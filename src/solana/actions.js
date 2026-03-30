import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { assertTradingMutationsAllowed } from '../config/network.js';
import {
  getRpcUrls,
  getWsUrls,
  isRpcConfigured,
  isWsConfigured,
} from '../rpc/pool.js';
import { getConnection } from './connection.js';
import { loadPrimaryKeypair, loadWalletEntries } from './wallet.js';

export async function getStatus() {
  let wsDisplay;
  try {
    const urls = getWsUrls();
    wsDisplay = urls.map((u) =>
      u.length > 24 ? `${u.slice(0, 12)}…${u.slice(-8)}` : u,
    );
  } catch {
    wsDisplay = [];
  }

  if (!isRpcConfigured()) {
    return {
      rpcPool: [
        '(no RPC URL — set HELIUS_RPC_URL, QUICKNODE_RPC_URL, or SOLANA_RPC_URL)',
      ],
      wsPool: wsDisplay,
      version: null,
      slot: null,
      rpcConfigured: false,
      wsConfigured: isWsConfigured(),
    };
  }
  const conn = getConnection();
  const version = await conn.getVersion();
  const slot = await conn.getSlot('confirmed');
  let rpcDisplay;
  try {
    const urls = getRpcUrls();
    rpcDisplay = urls.map((u) =>
      u.length > 24 ? `${u.slice(0, 12)}…${u.slice(-8)}` : u,
    );
  } catch {
    rpcDisplay = ['(no rpc env)'];
  }
  return {
    rpcPool: rpcDisplay,
    wsPool: wsDisplay,
    version: version['solana-core'] ?? version,
    slot,
    rpcConfigured: true,
    wsConfigured: isWsConfigured(),
  };
}

export async function getBalances() {
  if (!isRpcConfigured()) {
    return [];
  }
  const conn = getConnection();
  const entries = loadWalletEntries();
  const rows = [];
  for (const e of entries) {
    const kp = e.keypair;
    const lamports = await conn.getBalance(kp.publicKey, 'confirmed');
    rows.push({
      label: e.label,
      group: e.group,
      role: e.role,
      pubkey: kp.publicKey.toBase58(),
      sol: lamports / LAMPORTS_PER_SOL,
    });
  }
  return rows;
}

export async function transferSol(toAddress, amountSol) {
  assertTradingMutationsAllowed();
  const conn = getConnection();
  const from = loadPrimaryKeypair();
  const to = new PublicKey(toAddress);
  const lamports = Math.round(Number(amountSol) * LAMPORTS_PER_SOL);
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error('Invalid amount');
  }

  const ix = SystemProgram.transfer({
    fromPubkey: from.publicKey,
    toPubkey: to,
    lamports,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [from], {
    commitment: 'confirmed',
  });
  return { signature: sig, from: from.publicKey.toBase58(), to: toAddress, lamports };
}
