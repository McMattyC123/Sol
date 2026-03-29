import { assertTradingMutationsAllowed } from '../config/network.js';
import { nextConnection } from '../rpc/pool.js';
import {
  getQuote,
  getSwapTransaction,
  deserializeSignedNeeded,
  wsolMint,
} from '../trading/jupiter.js';
import {
  getJitoBundleTransactionLimit,
  sendBundleWithTipMulti,
} from '../trading/jitoBundle.js';
import { getTokenRawBalance } from '../sim/tick.js';
import { loadPrimaryKeypair, loadWalletEntries, walletsForGroup } from './wallet.js';

const ALIGN_ATTEMPTS = Number(process.env.MASTER_SELL_BLOCKHASH_RETRIES ?? '6');

/**
 * Master sell-all: for every loaded wallet with SPL balance of `mint`, build Jupiter SPL→WSOL swaps,
 * pack into **Jito bundles** with **one tip from the primary** keypair. Each bundle is all-or-none.
 * This is separate from per-wallet `sendBundleWithTip` usage inside the simulation tick.
 *
 * @param {object} opts
 * @param {string} opts.mint - SPL mint to dump
 * @param {string} [opts.group] - if set, only wallets in this group id
 */
export async function sellAllMasterJito({ mint, group }) {
  assertTradingMutationsAllowed();
  if ((process.env.USE_JITO ?? 'true').toLowerCase() === 'false') {
    throw new Error('sell-all-jito requires USE_JITO=true (atomic bundle + tip)');
  }

  const commitment = process.env.COMMITMENT ?? 'confirmed';
  const conn = nextConnection(commitment);
  let entries = loadWalletEntries();
  if (group?.trim()) {
    const g = group.trim();
    entries = walletsForGroup(entries, g);
    if (!entries.length) {
      throw new Error(`No wallets in group "${g}"`);
    }
  }

  const primary = loadPrimaryKeypair();

  const tipLamports = BigInt(process.env.JITO_TIP_LAMPORTS ?? '10000');
  const limit = getJitoBundleTransactionLimit();
  const maxSwapsPerBundle = tipLamports > 0n ? Math.max(1, limit - 1) : limit;
  /** Max SPL→SOL swaps packed into one Jito bundle (one bundle slot may be the tip tx). */
  const swapSlots = maxSwapsPerBundle;

  /** @type {{ entry: (typeof entries)[number], raw: bigint }[]} */
  const sellers = [];
  for (const e of entries) {
    const raw = await getTokenRawBalance(conn, e.keypair.publicKey, mint);
    if (raw > 0n) sellers.push({ entry: e, raw });
  }

  if (!sellers.length) {
    return {
      mint,
      group: group?.trim() || null,
      swapSlots,
      bundleCount: 0,
      bundles: [],
      skipped: 'No non-zero token balances for this mint on selected wallets',
    };
  }

  /** @type {object[]} */
  const bundleResults = [];

  for (let i = 0; i < sellers.length; i += maxSwapsPerBundle) {
    const chunk = sellers.slice(i, i + maxSwapsPerBundle);
    const signed = await buildAlignedSignedSwaps(conn, mint, chunk);
    const send = await sendBundleWithTipMulti(signed, primary, conn);
    bundleResults.push({
      wallets: chunk.map((c) => c.entry.label),
      ...send,
    });
  }

  return {
    mint,
    group: group?.trim() || null,
    swapSlots,
    bundleCount: bundleResults.length,
    bundles: bundleResults,
  };
}

/**
 * @param {import('@solana/web3.js').Connection} conn
 * @param {string} mint
 * @param {{ entry: { label: string, keypair: import('@solana/web3.js').Keypair }, raw: bigint }[]} chunk
 */
async function buildAlignedSignedSwaps(conn, mint, chunk) {
  const wsol = wsolMint();
  let lastErr = null;
  for (let attempt = 0; attempt < ALIGN_ATTEMPTS; attempt++) {
    try {
      const quotes = await Promise.all(
        chunk.map((c) =>
          getQuote({
            inputMint: mint,
            outputMint: wsol,
            amountRaw: c.raw,
          }),
        ),
      );
      const swaps = await Promise.all(
        quotes.map((q, idx) =>
          getSwapTransaction(q, chunk[idx].entry.keypair.publicKey.toBase58()),
        ),
      );
      const txs = swaps.map((s, idx) => {
        const tx = deserializeSignedNeeded(s);
        tx.sign([chunk[idx].entry.keypair]);
        return tx;
      });
      const bh = txs[0].message.recentBlockhash;
      if (txs.every((t) => t.message.recentBlockhash === bh)) {
        return txs;
      }
      lastErr = new Error('Jupiter swaps returned mismatched recentBlockhash');
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
  }
  throw lastErr ?? new Error('Failed to build aligned swaps for Jito bundle');
}
