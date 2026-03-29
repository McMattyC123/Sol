import { resolveBuyAmountLamports } from './sizing.js';

/** Zero jitter so funding plans are reproducible. */
function ruleForPlanning(rule) {
  if (!rule || !rule.mode) {
    return {
      mode: 'pct_sol',
      pct: 0.02,
      minSol: 0.001,
      maxSol: 0.05,
      jitterPct: 0,
    };
  }
  return { ...rule, jitterPct: 0 };
}

/**
 * Estimate notional buy size per simulation tick from starting SOL and SIMULATION_CONFIG
 * (no on-chain liquidity / impact model — educational only).
 *
 * @param {object} params
 * @param {ReturnType<import('./loadSimulationConfig.js').loadSimulationConfig>} params.simConfig
 * @param {number} params.buyerCount
 * @param {number} params.startingSolPerBuyer - wallet SOL after funding (before ticks)
 */
export function planMarketMovingFromFunding({
  simConfig,
  buyerCount,
  startingSolPerBuyer,
}) {
  const bg = simConfig.buyerGroup ?? 'buyers';
  const buyRuleRaw = simConfig.groups?.[bg]?.buy ?? simConfig.buy;
  const buyRule = ruleForPlanning(buyRuleRaw);

  const lamports = resolveBuyAmountLamports(
    buyRule,
    Math.max(0, startingSolPerBuyer),
  );
  const buySol = Number(lamports) / 1e9;

  const perSimTickBuySol = buySol;
  const oneFullBuyerRotationNotionalSol =
    buyerCount > 0 ? perSimTickBuySol * buyerCount : 0;

  const pctOfWallet =
    startingSolPerBuyer > 0
      ? perSimTickBuySol / startingSolPerBuyer
      : null;

  return {
    simulationBuyerGroup: bg,
    buyRuleSnapshot: buyRuleRaw ?? buyRule,
    buyRulePlanningUsed: buyRule,
    startingSolPerBuyer,
    buyerCount,
    estimatedBuySolPerSimTick: perSimTickBuySol,
    estimatedBuyLamportsPerSimTick: lamports.toString(),
    estimatedBuySolIfEachBuyerTicksOnceApprox: oneFullBuyerRotationNotionalSol,
    approximatePctOfStartingSolPerTick: pctOfWallet,
    disclaimer:
      'Notional sizes from your simulation buy rule and starting SOL only. Real “market move” depends on pool depth; this does not predict price impact.',
  };
}

/**
 * @param {ReturnType<typeof planMarketMovingFromFunding> | null} aggregate
 * @param {'buyer' | 'seller'} role
 * @param {number} startingSol
 */
export function perWalletMarketMovingSnippet(aggregate, role, startingSol) {
  if (role === 'seller') {
    return {
      sellerReserveSol: startingSol,
      note: 'Sell leg size depends on token holdings; fund SOL covers fees / rent.',
    };
  }
  if (!aggregate) {
    return {
      note: 'No buyers; buy-side tick estimates apply only to buyer wallets.',
    };
  }
  return {
    estimatedBuySolPerSimTick: aggregate.estimatedBuySolPerSimTick,
    estimatedBuyLamportsPerSimTick: aggregate.estimatedBuyLamportsPerSimTick,
    approximatePctOfStartingSolPerTick:
      aggregate.approximatePctOfStartingSolPerTick,
  };
}
