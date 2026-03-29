import 'dotenv/config';
import { loadWalletEntries } from './solana/wallet.js';
import { startSimLoop } from './sim/runner.js';

const mint = process.env.SIM_MINT?.trim();
if (!mint) {
  console.error('Set SIM_MINT to the token mint (output mint for buys).');
  process.exit(1);
}

const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? '15000');
const jitterMs = Number(process.env.SIM_JITTER_MS ?? '3000');

function safeJson(obj) {
  return JSON.stringify(
    obj,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

startSimLoop({
  mint,
  intervalMs,
  jitterMs,
  loadEntries: loadWalletEntries,
  onTick: (result) => console.log(safeJson(result)),
  onError: (e) =>
    console.error('tick error:', e instanceof Error ? e.message : e),
});
