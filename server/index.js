import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { assertMasterPassword } from '../src/auth.js';
import {
  getTradingNetwork,
  isMainnetLiveExplicitlyAllowed,
} from '../src/config/network.js';
import { getStatus, getBalances, transferSol } from '../src/solana/actions.js';
import { loadWalletEntries } from '../src/solana/wallet.js';
import { runWashTick } from '../src/sim/tick.js';
import {
  getSimLoopState,
  startSimLoop,
  stopSimLoop,
} from '../src/sim/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const distPath = path.join(rootDir, 'client', 'dist');
const distIndex = path.join(distPath, 'index.html');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '512kb' }));

function jsonSafe(data) {
  return JSON.parse(
    JSON.stringify(data, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
}

function masterPasswordFrom(req) {
  const h = req.get('X-Master-Password');
  if (h) return h;
  if (req.body && typeof req.body.masterPassword === 'string') {
    return req.body.masterPassword;
  }
  return '';
}

function requireMasterPassword(req, res, next) {
  try {
    assertMasterPassword(masterPasswordFrom(req));
    next();
  } catch (e) {
    if (e.statusCode === 401) {
      return res.status(401).json({ error: e.message });
    }
    next(e);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  const tradingNetwork = getTradingNetwork();
  const mainnetLiveAllowed = isMainnetLiveExplicitlyAllowed();
  const needsExplicitMainnet =
    tradingNetwork === 'mainnet' && !mainnetLiveAllowed;
  res.json({
    tradingNetwork: tradingNetwork ?? 'unspecified',
    /** Explicit opt-in required on Railway when using mainnet */
    allowMainnetLive: mainnetLiveAllowed,
    /** false when TRADING_NETWORK=mainnet but ALLOW_MAINNET_LIVE is not true */
    canMutate: !needsExplicitMainnet,
    mutationsBlockedReason: needsExplicitMainnet
      ? 'Set Railway env ALLOW_MAINNET_LIVE=true with TRADING_NETWORK=mainnet to enable transfers and simulation.'
      : null,
  });
});

app.get('/api/status', async (_req, res, next) => {
  try {
    const data = await getStatus();
    res.json(jsonSafe(data));
  } catch (e) {
    next(e);
  }
});

app.get('/api/wallets', async (_req, res, next) => {
  try {
    const rows = await getBalances();
    res.json(jsonSafe(rows));
  } catch (e) {
    next(e);
  }
});

app.post('/api/transfer', requireMasterPassword, async (req, res, next) => {
  try {
    const { to, sol } = req.body ?? {};
    if (!to || sol == null) {
      return res.status(400).json({ error: 'Body requires to, sol' });
    }
    const r = await transferSol(to, String(sol));
    res.json(jsonSafe(r));
  } catch (e) {
    next(e);
  }
});

app.post('/api/sim/tick', requireMasterPassword, async (req, res, next) => {
  try {
    const mint = req.body?.mint?.trim?.();
    if (!mint) {
      return res.status(400).json({ error: 'Body requires mint' });
    }
    const entries = loadWalletEntries();
    const result = await runWashTick({ outputMint: mint, entries });
    const payload = jsonSafe(result);
    io.emit('sim:tick', payload);
    res.json(payload);
  } catch (e) {
    next(e);
  }
});

app.get('/api/sim/state', (_req, res) => {
  res.json(getSimLoopState());
});

app.post('/api/sim/run', requireMasterPassword, (req, res, next) => {
  try {
    const mint = req.body?.mint?.trim?.();
    if (!mint) {
      return res.status(400).json({ error: 'Body requires mint' });
    }
    const intervalMs = Number(
      req.body?.intervalMs ?? process.env.SIM_INTERVAL_MS ?? '15000',
    );
    const jitterMs = Number(
      req.body?.jitterMs ?? process.env.SIM_JITTER_MS ?? '3000',
    );
    if (!Number.isFinite(intervalMs) || intervalMs < 0) {
      return res.status(400).json({ error: 'Invalid intervalMs' });
    }
    if (!Number.isFinite(jitterMs) || jitterMs < 0) {
      return res.status(400).json({ error: 'Invalid jitterMs' });
    }

    startSimLoop({
      mint,
      intervalMs,
      jitterMs,
      loadEntries: loadWalletEntries,
      onTick: (result) => io.emit('sim:tick', jsonSafe(result)),
      onError: (err) =>
        io.emit('sim:error', {
          message: err instanceof Error ? err.message : String(err),
        }),
    });
    res.json(getSimLoopState());
  } catch (e) {
    if (e instanceof Error && e.message === 'Sim loop already running') {
      return res.status(409).json({ error: e.message });
    }
    next(e);
  }
});

app.post('/api/sim/stop', requireMasterPassword, (_req, res) => {
  stopSimLoop();
  res.json(getSimLoopState());
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status =
    typeof err.statusCode === 'number' ? err.statusCode : 500;
  res.status(status).json({
    error: err instanceof Error ? err.message : 'Internal error',
  });
});

const serveStatic = fs.existsSync(distIndex);
if (serveStatic) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(distIndex, (err) => {
      if (err) next(err);
    });
  });
}

io.on('connection', (socket) => {
  socket.emit('hello', { id: socket.id });
});

const PORT = Number(process.env.PORT ?? '3001');
server.listen(PORT, () => {
  console.log(`API + Socket.IO listening on ${PORT}`);
  if (serveStatic) {
    console.log(`Serving static UI from ${distPath}`);
  } else {
    console.warn(
      'client/dist not found — run npm run build:client or use Vite dev with proxy.',
    );
  }
});
