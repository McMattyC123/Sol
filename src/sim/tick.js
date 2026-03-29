import { PublicKey } from '@solana/web3.js';
import { assertTradingMutationsAllowed } from '../config/network.js';
import { nextConnection } from '../rpc/pool.js';
import {
  walletsForGroup,
} from '../solana/wallet.js';
import { loadSimulationConfig } from './loadSimulationConfig.js';
import { nextIndex } from './roundRobin.js';
import { resolveBuyAmountLamports, resolveSellAmountRaw } from './sizing.js';
import {
  getQuote,
  getSwapTransaction,
  deserializeSignedNeeded,
  wsolMint,
} from '../trading/jupiter.js';
import { sendBundleWithTip } from '../trading/jitoBundle.js';

export async function getTokenRawBalance(conn, owner, mintStr) {
  const mint = new PublicKey(mintStr);
  const res = await conn.getParsedTokenAccountsByOwner(owner, { mint });
  let total = 0n;
  for (const { account } of res.value) {
    const info = account.data.parsed?.info;
    if (!info?.tokenAmount) continue;
    total += BigInt(info.tokenAmount.amount);
  }
  return total;
}

function simWarning() {
  console.error(
    '\n[!] SIMULATION / RESEARCH ONLY — manipulative trading may be illegal. Prefer devnet/testnet.\n',
  );
}

/**
 * @param {object} opts
 * @param {string} opts.outputMint - token to buy/sell (pump-style mint)
 * @param {ReturnType<typeof loadSimulationConfig>} [opts.config]
 */
export async function runWashTick(opts) {
  assertTradingMutationsAllowed();
  simWarning();
  const mint = (opts.outputMint ?? '').trim();
  if (!mint) {
    throw new Error(
      'runWashTick requires outputMint (SPL mint), e.g. sim tick --mint <address>',
    );
  }
  const entries = opts.entries;
  if (!entries?.length) {
    throw new Error(
      'No wallets loaded: set WALLETS_CONFIG or SOLANA_KEYPAIR_PATH / SOLANA_PRIVATE_KEY',
    );
  }
  const sim = opts.config ?? loadSimulationConfig();
  const bg = sim.buyerGroup ?? 'buyers';
  const sg = sim.sellerGroup ?? 'sellers';
  const buyers = walletsForGroup(entries, bg);
  const sellers = walletsForGroup(entries, sg);
  if (!buyers.length) throw new Error(`No wallets in buyer group "${bg}"`);
  if (!sellers.length) throw new Error(`No wallets in seller group "${sg}"`);

  const bi = nextIndex(`rr:${bg}`, buyers);
  const si = nextIndex(`rr:${sg}`, sellers);
  const buyer = buyers[bi];
  const seller = sellers[si];
  const buyRule = sim.groups?.[bg]?.buy ?? sim.buy;
  const sellRule = sim.groups?.[sg]?.sell ?? sim.sell;

  const commitment = process.env.COMMITMENT ?? 'confirmed';
  const conn = nextConnection(commitment);
  const wsol = wsolMint();

  const solBal = (await conn.getBalance(buyer.keypair.publicKey)) / 1e9;
  const tokenRaw = await getTokenRawBalance(conn, seller.keypair.publicKey, mint);
  const buyLamports = resolveBuyAmountLamports(buyRule, solBal);
  const buyQuote = await getQuote({
    inputMint: wsol,
    outputMint: mint,
    amountRaw: buyLamports,
  });
  const buySwap = await getSwapTransaction(buyQuote, buyer.keypair.publicKey.toBase58());
  const buyTx = deserializeSignedNeeded(buySwap);
  buyTx.sign([buyer.keypair]);
  const buySend = await sendBundleWithTip(buyTx, buyer.keypair, conn);

  const sellAmt = resolveSellAmountRaw(sellRule, tokenRaw);
  let sellSend = { skipped: true, reason: 'zero sell size or no tokens' };
  if (sellAmt > 0n) {
    const sellQuote = await getQuote({
      inputMint: mint,
      outputMint: wsol,
      amountRaw: sellAmt,
    });
    const sellSwap = await getSwapTransaction(
      sellQuote,
      seller.keypair.publicKey.toBase58(),
    );
    const sellTx = deserializeSignedNeeded(sellSwap);
    sellTx.sign([seller.keypair]);
    sellSend = await sendBundleWithTip(sellTx, seller.keypair, conn);
  }

  return {
    buyer: buyer.label,
    seller: seller.label,
    mint,
    buy: buySend,
    sell: sellSend,
  };
}

export { simWarning };
