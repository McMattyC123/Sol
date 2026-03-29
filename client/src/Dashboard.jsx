import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const apiBase = import.meta.env.VITE_API_URL ?? '';

function apiUrl(path) {
  return `${apiBase}${path}`;
}

function createSocket() {
  const base = import.meta.env.VITE_API_URL?.trim();
  const opts = { path: '/socket.io' };
  if (base) return io(base, opts);
  return io(opts);
}

export default function Dashboard() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(null);
  const [wallets, setWallets] = useState(null);
  const [simState, setSimState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [mint, setMint] = useState('');
  const [intervalMs, setIntervalMs] = useState('15000');
  const [jitterMs, setJitterMs] = useState('3000');
  const [transferTo, setTransferTo] = useState('');
  const [transferSol, setTransferSol] = useState('');
  const [logs, setLogs] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const logEndRef = useRef(null);

  const appendLog = useCallback((kind, payload) => {
    const entry = {
      t: new Date().toISOString(),
      kind,
      payload,
    };
    setLogs((prev) => [...prev.slice(-200), entry]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchJson = useCallback(async (path, init = {}) => {
    const r = await fetch(apiUrl(path), init);
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!r.ok) {
      const msg = data?.error || r.statusText;
      throw new Error(msg);
    }
    return data;
  }, []);

  const postProtected = useCallback(
    async (path, body) => {
      const headers = { 'Content-Type': 'application/json' };
      if (masterPassword) headers['X-Master-Password'] = masterPassword;
      return fetchJson(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
      });
    },
    [fetchJson, masterPassword],
  );

  const refreshReadOnly = useCallback(async () => {
    setError(null);
    try {
      const [s, w, loop, cfg] = await Promise.all([
        fetchJson('/api/status'),
        fetchJson('/api/wallets'),
        fetchJson('/api/sim/state'),
        fetchJson('/api/config'),
      ]);
      setStatus(s);
      setWallets(w);
      setSimState(loop);
      setAppConfig(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchJson]);

  useEffect(() => {
    refreshReadOnly();
  }, [refreshReadOnly]);

  useEffect(() => {
    const socket = createSocket();

    socket.on('connect', () => {
      setConnected(true);
      appendLog('system', { message: 'Socket connected' });
    });
    socket.on('disconnect', () => {
      setConnected(false);
      appendLog('system', { message: 'Socket disconnected' });
    });
    socket.on('sim:tick', (data) => appendLog('tick', data));
    socket.on('sim:error', (data) => appendLog('error', data));

    return () => socket.close();
  }, [appendLog]);

  const mutationsLocked = Boolean(appConfig && !appConfig.canMutate);

  async function onRunOneTick() {
    if (!mint.trim()) {
      setError('Mint is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await postProtected('/api/sim/tick', { mint: mint.trim() });
      appendLog('tick', r);
      await refreshReadOnly();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onStartLoop() {
    if (!mint.trim()) {
      setError('Mint is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postProtected('/api/sim/run', {
        mint: mint.trim(),
        intervalMs: Number(intervalMs),
        jitterMs: Number(jitterMs),
      });
      await refreshReadOnly();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onStopLoop() {
    setBusy(true);
    setError(null);
    try {
      await postProtected('/api/sim/stop', {});
      await refreshReadOnly();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onTransfer(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await postProtected('/api/transfer', {
        to: transferTo.trim(),
        sol: transferSol,
      });
      appendLog('transfer', r);
      setTransferTo('');
      setTransferSol('');
      await refreshReadOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dash-header">
        <h1>chatting-sol</h1>
        <div className="dash-meta">
          <span className={connected ? 'badge ok' : 'badge bad'}>
            {connected ? 'Socket live' : 'Socket offline'}
          </span>
          {appConfig ? (
            <>
              <span
                className={
                  appConfig.tradingNetwork === 'mainnet'
                    ? 'badge warn'
                    : 'badge subtle'
                }
              >
                Network: {appConfig.tradingNetwork}
              </span>
              {appConfig.tradingNetwork === 'mainnet' &&
              appConfig.allowMainnetLive ? (
                <span className="badge live">Mainnet live ON</span>
              ) : null}
            </>
          ) : null}
          <span className="badge subtle">
            API {apiBase || '(same origin / proxy)'}
          </span>
        </div>
      </header>

      {appConfig?.mutationsBlockedReason ? (
        <div className="alert blocked">{appConfig.mutationsBlockedReason}</div>
      ) : null}

      <p className="disclaimer">
        Simulation / research only. Wash-style activity may be illegal on mainnet.
        Never expose this server without TLS and a strong{' '}
        <code>CLI_MASTER_PASSWORD</code>.
      </p>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel">
        <h2>Master password</h2>
        <p className="hint">
          Set if <code>CLI_MASTER_PASSWORD</code> is in server <code>.env</code>.
          Sent as <code>X-Master-Password</code> on protected requests.
        </p>
        <input
          type="password"
          autoComplete="off"
          placeholder="Optional"
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
        />
      </section>

      <section className="panel row-actions">
        <button type="button" onClick={refreshReadOnly} disabled={busy}>
          Refresh status / wallets
        </button>
      </section>

      <section className="panel">
        <h2>RPC status</h2>
        {status ? (
          <pre className="json-block">{JSON.stringify(status, null, 2)}</pre>
        ) : (
          <p className="muted">No data yet</p>
        )}
      </section>

      <section className="panel">
        <h2>Wallets</h2>
        {Array.isArray(wallets) && wallets.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Group</th>
                  <th>SOL</th>
                  <th>Pubkey</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.pubkey}>
                    <td>{w.label}</td>
                    <td>{w.group}</td>
                    <td>{w.sol}</td>
                    <td className="mono">{w.pubkey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No wallets</p>
        )}
      </section>

      <section className="panel">
        <h2>Transfer SOL (primary keypair)</h2>
        {mutationsLocked ? (
          <p className="hint warn">
            Transfers disabled until mainnet live is enabled on the server.
          </p>
        ) : null}
        <form className="form-grid" onSubmit={onTransfer}>
          <label>
            To address
            <input
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              required
            />
          </label>
          <label>
            Amount (SOL)
            <input
              value={transferSol}
              onChange={(e) => setTransferSol(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy || mutationsLocked}>
            Send
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Simulation</h2>
        {mutationsLocked ? (
          <p className="hint warn">
            Simulation ticks disabled until you set{' '}
            <code>ALLOW_MAINNET_LIVE=true</code> (Railway variables) with{' '}
            <code>TRADING_NETWORK=mainnet</code>.
          </p>
        ) : null}
        {simState?.running ? (
          <p className="warn">
            Loop running — mint <code>{simState.mint}</code>, intervalMs{' '}
            {simState.intervalMs}, jitterMs {simState.jitterMs}
          </p>
        ) : (
          <p className="muted">Loop stopped</p>
        )}
        <label className="block">
          Output mint (token)
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="SPL mint address"
          />
        </label>
        <div className="form-row">
          <label>
            Interval ms
            <input
              value={intervalMs}
              onChange={(e) => setIntervalMs(e.target.value)}
            />
          </label>
          <label>
            Jitter ms
            <input
              value={jitterMs}
              onChange={(e) => setJitterMs(e.target.value)}
            />
          </label>
        </div>
        <div className="button-row">
          <button
            type="button"
            onClick={onRunOneTick}
            disabled={busy || mutationsLocked}
          >
            Run one tick
          </button>
          <button
            type="button"
            onClick={onStartLoop}
            disabled={busy || mutationsLocked}
          >
            Start loop
          </button>
          <button type="button" onClick={onStopLoop} disabled={busy}>
            Stop loop
          </button>
        </div>
      </section>

      <section className="panel log-panel">
        <h2>Event log</h2>
        <div className="log-box">
          {logs.map((l, i) => (
            <div key={`${l.t}-${i}`} className={`log-line ${l.kind}`}>
              <span className="log-time">{l.t}</span>
              <span className="log-kind">{l.kind}</span>
              <pre>{JSON.stringify(l.payload, null, 2)}</pre>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  );
}
