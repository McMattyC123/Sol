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

/**
 * @param {import('@solana/web3.js').VersionedTransaction} swapTx - fully signed
 * @param {import('@solana/web3.js').Keypair} tipPayer - pays Jito tip when tip > 0
 * @param {import('@solana/web3.js').Connection} conn
 */
export async function sendBundleWithTip(swapTx, tipPayer, conn) {
  const useJito = (process.env.USE_JITO ?? 'true').toLowerCase() !== 'false';
  const raw = swapTx.serialize();
  if (!useJito) {
    const sig = await conn.sendRawTransaction(raw, {
      skipPreflight: (process.env.SKIP_PREFLIGHT ?? 'false') === 'true',
      maxRetries: 2,
    });
    return { channel: 'vanilla_rpc', signature: sig };
  }

  const auth = loadJitoAuthKeypair();
  const client = searcherClient(blockEngineUrl(), auth);
  const tipLamports = BigInt(process.env.JITO_TIP_LAMPORTS ?? '10000');
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const limit = Math.min(8, Number(process.env.BUNDLE_TRANSACTION_LIMIT ?? 5));
  const b = new Bundle([], limit);
  let nb = b.addTransactions(swapTx);
  if (isError(nb)) throw new Error(nb.message);
  if (tipLamports > 0n) {
    const tipRes = await client.getTipAccounts();
    if (!tipRes.ok) {
      throw new Error(`Jito getTipAccounts: ${tipRes.error}`);
    }
    const tipPk = new PublicKey(tipRes.value[0]);
    nb = nb.addTipTx(tipPayer, Number(tipLamports), tipPk, blockhash);
    if (isError(nb)) throw new Error(nb.message);
  }
  const sent = await client.sendBundle(nb);
  if (!sent.ok) {
    throw new Error(`Jito sendBundle: ${sent.error}`);
  }
  return { channel: 'jito', bundleUuid: sent.value, lastValidBlockHeight };
}
