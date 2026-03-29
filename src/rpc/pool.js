import { Connection } from '@solana/web3.js';

/** @type {string[]} */
let urls = null;
/** @type {Connection[]} */
let connections = null;
let rrIndex = 0;

function collectUrls() {
  const out = [];
  for (const key of ['HELIUS_RPC_URL', 'QUICKNODE_RPC_URL', 'SOLANA_RPC_URL']) {
    const u = process.env[key]?.trim();
    if (u) out.push(u);
  }
  if (out.length === 0) {
    throw new Error(
      'Set at least one of HELIUS_RPC_URL, QUICKNODE_RPC_URL, SOLANA_RPC_URL',
    );
  }
  return out;
}

export function getRpcUrls() {
  if (!urls) urls = collectUrls();
  return urls;
}

/**
 * One Connection per URL; round-robin pick (O(1), no retry loop over providers).
 */
export function getConnectionPool(commitment = 'confirmed') {
  if (!connections) {
    connections = getRpcUrls().map((u) => new Connection(u, commitment));
  }
  return connections;
}

export function nextConnection(commitment = 'confirmed') {
  const pool = getConnectionPool(commitment);
  const c = pool[rrIndex % pool.length];
  rrIndex += 1;
  return c;
}

export function resetPool() {
  urls = null;
  connections = null;
  rrIndex = 0;
}
