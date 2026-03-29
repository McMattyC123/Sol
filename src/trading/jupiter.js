import { VersionedTransaction } from '@solana/web3.js';
import { jupiterClusterParam } from '../config/network.js';

const WSOL = 'So11111111111111111111111111111111111111112';
const QUOTE = process.env.JUPITER_QUOTE_URL?.trim() || 'https://quote-api.jup.ag/v6';
const SWAP = process.env.JUPITER_SWAP_URL?.trim() || 'https://quote-api.jup.ag/v6';

export function wsolMint() {
  return WSOL;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jupiter GET ${res.status}: ${t.slice(0, 500)}`);
  }
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jupiter POST ${res.status}: ${t.slice(0, 500)}`);
  }
  return res.json();
}

/**
 * @param {object} p
 * @param {string} p.inputMint
 * @param {string} p.outputMint
 * @param {bigint|string|number} p.amountRaw - base units
 * @param {number} [p.slippageBps]
 */
export async function getQuote({ inputMint, outputMint, amountRaw, slippageBps }) {
  const slip = slippageBps ?? Number(process.env.SLIPPAGE_BPS ?? 100);
  const amount = typeof amountRaw === 'bigint' ? amountRaw.toString() : String(amountRaw);
  const u = new URL(`${QUOTE}/quote`);
  u.searchParams.set('inputMint', inputMint);
  u.searchParams.set('outputMint', outputMint);
  u.searchParams.set('amount', amount);
  u.searchParams.set('slippageBps', String(slip));
  u.searchParams.set('onlyDirectRoutes', 'false');
  u.searchParams.set('asLegacyTransaction', 'false');
  const cluster = jupiterClusterParam();
  if (cluster) u.searchParams.set('cluster', cluster);
  return getJson(u.toString());
}

function useSharedAccountsForSwap() {
  return (process.env.JUPITER_USE_SHARED_ACCOUNTS ?? 'true').toLowerCase() !== 'false';
}

/**
 * @param {object} quoteResponse - from getQuote
 * @param {string} userPublicKey - base58
 */
export async function getSwapTransaction(quoteResponse, userPublicKey) {
  /** @type {Record<string, unknown>} */
  const body = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: process.env.JUP_PRIORITIZATION_LAMPORTS
      ? Number(process.env.JUP_PRIORITIZATION_LAMPORTS)
      : 'auto',
  };
  if (useSharedAccountsForSwap()) {
    body.useSharedAccounts = true;
  }
  return postJson(`${SWAP}/swap`, body);
}

/**
 * Jupiter returns a v0 `VersionedTransaction`; it may include `addressTableLookups`
 * so route accounts use ALT indices (compact) instead of only 32-byte static keys.
 */
export function deserializeSignedNeeded(swapResponse) {
  const b64 = swapResponse.swapTransaction;
  if (!b64) throw new Error('swap: missing swapTransaction');
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'));
  return tx;
}
