import { createRequire } from 'node:module';
import fs from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher.js');
const { Bundle } = require('jito-ts/dist/sdk/block-engine/types.js');
const { isError } = require('jito-ts/dist/sdk/block-engine/utils.js');

export function loadJitoAuthKeypair() {
  const p = process.env.JITO_AUTH_KEYPAIR_PATH?.trim();
  if (p) {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const fallback = process.env.SOLANA_KEYPAIR_PATH?.trim();
  if (fallback && fs.existsSync(fallback)) {
    const raw = JSON.parse(fs.readFileSync(fallback, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  throw new Error(
    'Set JITO_AUTH_KEYPAIR_PATH (JSON keypair) for Jito gRPC auth, or SOLANA_KEYPAIR_PATH',
  );
}

function blockEngineUrl() {
  const u = process.env.BLOCK_ENGINE_URL?.trim();
  if (u) return u;
  return 'mainnet.block-engine.jito.wtf';
}

/** Jito block engines cap bundles at this many transactions (swaps + tip). ALTs / smaller txs do not raise this. */
export const JITO_MAX_TRANSACTIONS_PER_BUNDLE = 5;

/**
 * Clamp user `BUNDLE_TRANSACTION_LIMIT` to what Jito accepts (max 5 txs per bundle).
 * @returns {number} integer 1..5
 */
export function getJitoBundleTransactionLimit() {
  const raw = Number(process.env.BUNDLE_TRANSACTION_LIMIT ?? '5');
  const n = Number.isFinite(raw) ? Math.floor(raw) : 5;
  return Math.min(JITO_MAX_TRANSACTIONS_PER_BUNDLE, Math.max(1, n));
}

/**
 * Send one or more signed versioned swaps plus an optional Jito tip in a **single** atomic bundle
 * (all-or-none at the bundle level). Vanilla RPC only supports exactly one swap when Jito is off.
 *
 * @param {import('@solana/web3.js').VersionedTransaction[]} swapTxs - fully signed, same recentBlockhash
 * @param {import('@solana/web3.js').Keypair} tipPayer - pays Jito tip when tip > 0
 * @param {import('@solana/web3.js').Connection} conn
 */
export async function sendBundleWithTipMulti(swapTxs, tipPayer, conn) {
  if (!swapTxs.length) {
    throw new Error('sendBundleWithTipMulti: no transactions');
  }

  const useJito = (process.env.USE_JITO ?? 'true').toLowerCase() !== 'false';
  if (!useJito) {
    if (swapTxs.length !== 1) {
      throw new Error(
        'USE_JITO=false only supports a single swap; enable Jito for multi-tx bundles (master sell-all)',
      );
    }
    const raw = swapTxs[0].serialize();
    const sig = await conn.sendRawTransaction(raw, {
      skipPreflight: (process.env.SKIP_PREFLIGHT ?? 'false') === 'true',
      maxRetries: 2,
    });
    return { channel: 'vanilla_rpc', signature: sig };
  }

  const firstBh = swapTxs[0].message.recentBlockhash;
  for (let i = 1; i < swapTxs.length; i++) {
    if (swapTxs[i].message.recentBlockhash !== firstBh) {
      throw new Error(
        'Jito bundle requires identical recentBlockhash on every swap transaction',
      );
    }
  }

  const auth = loadJitoAuthKeypair();
  const client = searcherClient(blockEngineUrl(), auth);
  const tipLamports = BigInt(process.env.JITO_TIP_LAMPORTS ?? '10000');

  const limit = getJitoBundleTransactionLimit();
  const b = new Bundle([], limit);
  let nb = b.addTransactions(...swapTxs);
  if (isError(nb)) throw new Error(nb.message);
  if (tipLamports > 0n) {
    const tipRes = await client.getTipAccounts();
    if (!tipRes.ok) {
      throw new Error(`Jito getTipAccounts: ${tipRes.error}`);
    }
    const tipPk = new PublicKey(tipRes.value[0]);
    nb = nb.addTipTx(tipPayer, Number(tipLamports), tipPk, firstBh);
    if (isError(nb)) throw new Error(nb.message);
  }
  const sent = await client.sendBundle(nb);
  if (!sent.ok) {
    throw new Error(`Jito sendBundle: ${sent.error}`);
  }
  return {
    channel: 'jito',
    bundleUuid: sent.value,
    swapCount: swapTxs.length,
  };
}

/**
 * @param {import('@solana/web3.js').VersionedTransaction} swapTx - fully signed
 * @param {import('@solana/web3.js').Keypair} tipPayer - pays Jito tip when tip > 0
 * @param {import('@solana/web3.js').Connection} conn
 */
export async function sendBundleWithTip(swapTx, tipPayer, conn) {
  return sendBundleWithTipMulti([swapTx], tipPayer, conn);
}
