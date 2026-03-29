# chatting-sol

Private **CLI** and optional **web dashboard** for Solana (`sol-trade`): status, balances, SOL transfer, and simulation ticks (Jupiter + optional Jito). Run only on a machine you control; follow the security notes below if you enable HTTP.

Environment templates (copy one to `.env`):

- [.env.example.devnet](.env.example.devnet) — `TRADING_NETWORK=devnet`, devnet RPC placeholders, Jito host hints
- [.env.example.mainnet](.env.example.mainnet) — `TRADING_NETWORK=mainnet` and `ALLOW_MAINNET_LIVE` gate for live trading

[.env.example](.env.example) is a short pointer; prefer the files above.

## Requirements

- Node.js **20+**
- From repo root: `npm install` (uses **workspaces**: `client`, `server`, and root CLI deps)

## CLI usage

```bash
node src/cli.js --help
node src/cli.js status
node src/cli.js wallets
node src/cli.js transfer <RECIPIENT_ADDRESS> <SOL_AMOUNT>
node src/cli.js wallet-create --out ./data/wallets.json --keys-dir ./data/keys --buyers 2 --sellers 2 --starting-sol 0.2 --simulation-config ./data/simulation.json
node src/cli.js sell-all-jito --mint <TOKEN_MINT>
node src/cli.js sell-all-jito --mint <TOKEN_MINT> --group sellers
node src/cli.js sim tick --mint <TOKEN_MINT>
node src/cli.js sim run --mint <TOKEN_MINT> --interval-ms 15000
node src/cli.js repl
```

After `npm link`, you can use `sol-trade …`.

## Web dashboard + API (deployable)

The **`server/`** app hosts a REST API and Socket.IO stream. In production it also serves the built **`client/`** SPA from `client/dist`.

**Run from repo root** so `.env`, `data/simulation.json`, and wallet paths resolve the same as the CLI.

### Production-style (single process)

```bash
npm run start:app
```

Opens API/UI on **`PORT`** (default **3001**). Open `http://localhost:3001`.

### Development (Vite HMR + API)

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

Vite runs on **3000** and proxies `/api` and `/socket.io` to **3001**. Optional: [client/.env.example](client/.env.example) → `client/.env` with `VITE_API_URL` if you point the UI at another origin.

### API summary

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | Liveness |
| GET | `/api/config` | `tradingNetwork`, `allowMainnetLive`, `canMutate`, `mutationsBlockedReason` |
| GET | `/api/status` | RPC pool + slot (`version`/`slot` null if no RPC env yet) |
| GET | `/api/wallets` | SOL balances (empty array if no RPC env) |
| GET | `/api/sim/state` | Loop running / mint / intervals |
| POST | `/api/transfer` | Body: `{ "to", "sol" }` — requires master password if set |
| POST | `/api/sim/tick` | Body: `{ "mint" }` |
| POST | `/api/sim/run` | Body: `{ "mint", "intervalMs"?, "jitterMs"? }` |
| POST | `/api/sim/stop` | Stops loop |

If **`CLI_MASTER_PASSWORD`** is set in `.env`, protected routes accept it via header **`X-Master-Password`** or JSON **`masterPassword`**. Prefer **HTTPS** in front of any deployment so that secret is not sent in cleartext.

Socket events: **`sim:tick`** (payload per tick), **`sim:error`** (`{ message }`).

### Railway

- **Default:** [railway.json](railway.json) uses the root [**Dockerfile**](Dockerfile): `npm ci` → `npm run build:client` (output **`client/dist/`**) → **`node server/index.js`**. Health check: **`GET /api/health`**. Full steps: [docs/RAILWAY.md](docs/RAILWAY.md).
- **Alternative:** Turn off the Docker builder in Railway and use [nixpacks.toml](nixpacks.toml) (`npm ci` → `npm run build:client` → same start command).
- Verify locally after install: **`npm run test:smoke`** (build + short `/api/health` / `/api/config` check).

Railway sets **`PORT`** automatically (do not hardcode it in production).

**Suggested variables**

| Variable | Purpose |
|----------|---------|
| `HELIUS_RPC_URL` / `SOLANA_RPC_URL` | RPC URL for your cluster |
| `TRADING_NETWORK` | `mainnet`, `devnet`, or `testnet` |
| `ALLOW_MAINNET_LIVE` | Set **`true`** for **mainnet live** (required when `TRADING_NETWORK=mainnet`) |
| `WALLETS_CONFIG`, keypair paths | As in [.env.example](.env.example) |
| `CLI_MASTER_PASSWORD` | Recommended in production |
| Jito / `SIM_*` | Optional; on devnet consider `USE_JITO=false` if bundles fail |

Use **`/api/health`** for health checks.

### Mainnet live vs devnet/testnet

- **`TRADING_NETWORK=devnet` or `testnet`**: Jupiter adds the matching `cluster` query param. Transfers and sim work without `ALLOW_MAINNET_LIVE`.
- **`TRADING_NETWORK=mainnet`**: Set **`ALLOW_MAINNET_LIVE=true`** or transfers and simulation return **403** until you opt in on the server (e.g. Railway variables). The dashboard shows **Mainnet live ON** when enabled.
- **Omit `TRADING_NETWORK`**: Legacy mode — no gate (only if you understand the risk).

### Docker

```bash
docker build -t chatting-sol .
docker run --rm -p 3001:3001 --env-file .env chatting-sol
```

Mount or inject **`.env`** and ensure keypair paths inside the container are valid (or use absolute paths / secrets mounts).

**Deployment note:** The sim **loop** is a long-running process. Use a **VPS, Fly.io, Railway, Docker**, or similar. **Serverless-only** hosts are a poor fit for `POST /api/sim/run` loops (timeouts, no always-on process).

### Security

- The server loads **local keypairs** and can **sign transactions**. Treat it like hot wallet infrastructure.
- Do **not** expose the port to the internet without **TLS** (reverse proxy), a **strong `CLI_MASTER_PASSWORD`**, firewall rules, and ideally VPN / allowlists.
- **Wash-style simulation may be illegal** on mainnet; prefer **devnet/testnet** for learning.

### Environment

- **`SOLANA_RPC_URL`** / **`HELIUS_RPC_URL`** / **`QUICKNODE_RPC_URL`** — RPC pool.
- **`SOLANA_KEYPAIR_PATH`** — primary keypair, **or** `SOLANA_PRIVATE_KEY` (base58).
- **`WALLETS_CONFIG`** — JSON array of `{ "label", "keypairPath", "group": "buyers"|"sellers" }` for sim / `wallets` command.
- **`CLI_MASTER_PASSWORD`** — optional CLI prompt **and** web/API gate for mutating routes.
- **`PORT`** — HTTP port for `server/index.js` (default `3001`); Railway provides this.
- **`TRADING_NETWORK`** — `mainnet` | `devnet` | `testnet` (optional; see mainnet section above).
- **`ALLOW_MAINNET_LIVE`** — must be `true` when `TRADING_NETWORK=mainnet` for any transfer or sim tick.

See [.env.example](.env.example) for Jito, `SIM_*`, and slippage settings.

## Simulation (`sim`) — research only

Multi-wallet volume patterns (round-robin buyers/sellers, dynamic sizing in `data/simulation.json`, Jupiter, optional Jito). **Wash trading and related manipulation may be illegal.**

- PM2: `pm2 start ecosystem.config.cjs` (requires `SIM_MINT` in env) — same loop as `node src/worker.js` / web **Start loop**.

## Tech stack

- CLI: Commander, `dotenv`
- Web: React + Vite (`client/`), Express 5 + Socket.IO (`server/`)
- Chain: `@solana/web3.js`, `@solana/spl-token`, `jito-ts`, Jupiter v6 HTTP, optional Anchor
