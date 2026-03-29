import { nextConnection } from '../rpc/pool.js';

/**
 * Next RPC in the Helius / QuickNode / SOLANA round-robin pool.
 * Reuse the returned Connection for an entire flow (quote → sign → send).
 */
export function getConnection(opts = {}) {
  const commitment = opts.commitment ?? process.env.COMMITMENT ?? 'confirmed';
  return nextConnection(commitment);
}
