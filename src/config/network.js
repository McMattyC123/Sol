/**
 * Trading cluster and mainnet live gate (Railway / .env).
 * If TRADING_NETWORK is unset, legacy behavior: no gate (existing deployments).
 */

/** @returns {'mainnet' | 'devnet' | 'testnet' | null} */
export function getTradingNetwork() {
  const raw = process.env.TRADING_NETWORK?.trim().toLowerCase();
  if (raw === 'mainnet' || raw === 'devnet' || raw === 'testnet') return raw;
  return null;
}

export function isMainnetLiveExplicitlyAllowed() {
  return (process.env.ALLOW_MAINNET_LIVE ?? '').toLowerCase() === 'true';
}

/**
 * When TRADING_NETWORK=mainnet, require ALLOW_MAINNET_LIVE=true so Railway
 * deploys are not live by accident.
 */
export function assertTradingMutationsAllowed() {
  const net = getTradingNetwork();
  if (net !== 'mainnet') return;
  if (!isMainnetLiveExplicitlyAllowed()) {
    const e = new Error(
      'Mainnet live trading is disabled. Set ALLOW_MAINNET_LIVE=true on the server (e.g. Railway) alongside TRADING_NETWORK=mainnet.',
    );
    e.statusCode = 403;
    throw e;
  }
}

/**
 * Jupiter quote/swap cluster query param (omit on legacy unspecified = mainnet behavior).
 * @returns {'devnet' | 'testnet' | null}
 */
export function jupiterClusterParam() {
  const net = getTradingNetwork();
  if (net === 'devnet') return 'devnet';
  if (net === 'testnet') return 'testnet';
  return null;
}
