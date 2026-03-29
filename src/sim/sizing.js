/**
 * @typedef {{ mode: string, pct?: number, minSol?: number, maxSol?: number, minTokens?: string, maxTokens?: string, jitterPct?: number, fixedSol?: number, fixedTokens?: string }} SizeRule
 */

function applyJitter(x, jitterPct) {
  if (x <= 0 || !jitterPct) return x;
  const j = jitterPct * (Math.random() * 2 - 1);
  return Math.max(0, x * (1 + j));
}

export function resolveBuyAmountLamports(rule, solBalance) {
  if (!rule || !rule.mode) return BigInt(Math.floor(0.001 * 1e9));
  const mode = rule.mode;
  let sol = 0;
  if (mode === 'fixed_sol') {
    sol = Number(rule.fixedSol ?? rule.minSol ?? 0.01);
  } else if (mode === 'pct_sol') {
    const pct = Number(rule.pct ?? 0.02);
    sol = solBalance * pct;
  } else {
    sol = Number(rule.minSol ?? 0.01);
  }
  sol = applyJitter(sol, Number(rule.jitterPct ?? 0));
  const minS = Number(rule.minSol ?? 0);
  const maxS = Number(rule.maxSol ?? 1e9);
  sol = Math.min(Math.max(sol, minS), maxS);
  const lamports = Math.floor(sol * 1e9);
  return BigInt(Math.max(lamports, 1));
}

export function resolveSellAmountRaw(rule, tokenRaw) {
  if (tokenRaw <= 0n) return 0n;
  if (!rule || !rule.mode) return tokenRaw / 10n > 0n ? tokenRaw / 10n : tokenRaw;
  const mode = rule.mode;
  let raw = tokenRaw;
  if (mode === 'fixed' || mode === 'fixed_tokens') {
    raw = BigInt(rule.fixedTokens ?? rule.minTokens ?? '0');
  } else if (mode === 'pct_token') {
    const pct = Number(rule.pct ?? 0.1);
    raw = BigInt(Math.floor(Number(tokenRaw) * pct));
  } else {
    raw = BigInt(rule.minTokens ?? '0');
  }
  const j = Number(rule.jitterPct ?? 0);
  if (j > 0 && raw > 0n) {
    const f = 1 + j * (Math.random() * 2 - 1);
    raw = BigInt(Math.max(0, Math.floor(Number(raw) * f)));
  }
  const minT = BigInt(rule.minTokens ?? '1');
  const maxT = rule.maxTokens ? BigInt(rule.maxTokens) : tokenRaw;
  if (raw < minT) raw = minT;
  if (raw > maxT) raw = maxT;
  if (raw > tokenRaw) raw = tokenRaw;
  return raw > 0n ? raw : 0n;
}
