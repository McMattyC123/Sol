# Deploy on Railway (one service, dashboard-first)

This repo ships a **`Dockerfile`** and **`railway.json`**: Railway builds the image, runs **`node server/index.js`**, and health-checks **`GET /api/health`**. You do **not** start the server yourself — Railway does after each successful deploy.

### Build layout (what the image contains)

| Step | Location |
|------|----------|
| **Docker build context** | Repository **root** (same as `railway.json` + `Dockerfile`). Do not set Railway “root directory” to `server/` only. |
| **Vite output** | **`client/dist/`** — produced by `npm run build:client` during the image build. |
| **Process to run** | **`node server/index.js`** from `/app` — serves **`/api/*`** and static files from **`client/dist`**. |
| **Listen port** | **`process.env.PORT`** — Railway sets this automatically. The `Dockerfile` `EXPOSE` line is documentation only. |

Local check before push: `npm ci && npm run test:smoke` (builds the client and hits `/api/health` + `/api/config` on a temp port).

---

## What you get after deploy

- **One public URL** (HTTP) serving the **React dashboard** and **`/api/*`** on the same port.
- **`PORT`** is **injected by Railway**. Do **not** pin `PORT` in variables unless you know you need to; the app reads `process.env.PORT` automatically.

---

## Recommended order (first time)

1. **Create a Railway project** and connect **this GitHub repository** (or push this repo to Git and deploy it).
2. **Wait for the first build** to finish. Even before RPC/keys are set, the service should become **healthy** (`/api/health` returns `{ "ok": true }`). **`/api/status`** and **`/api/wallets`** return degraded data until you add an RPC URL (`HELIUS_RPC_URL` or `SOLANA_RPC_URL`); the dashboard should still load.
3. Open **your service → Variables** and add the **minimum set** for your cluster (copy names from [.env.example.devnet-sim](../.env.example.devnet-sim) or [.env.example.mainnet](../.env.example.mainnet)).
4. Railway **redeploys automatically** when you save variables (or trigger **Deploy** manually).
5. When the deploy is **green**, open **Settings → Networking → Generate Domain** (or your project’s default public URL).
6. **Open that URL in a browser** — you should see the **chatting-sol** dashboard (no separate “start server” step).
7. In the dashboard:
   - Enter **`CLI_MASTER_PASSWORD`** in **Master password** if you set that variable on Railway.
   - Use **Guided setup** to see which steps are still red (RPC, signer, network, etc.).
   - Use **Command chat**, **Buy**, **Simulation**, or **Transfer** once the checklist is satisfied.

**Summary:** Configure **Variables** on Railway → wait for **deploy success** → **open the public URL** → finish setup and run actions **from the dashboard**.

---

## Minimum variables (safe path: devnet first)

For a **devnet** smoke test (fake SOL, no mainnet live gate):

| Variable | Example / note |
|----------|----------------|
| `TRADING_NETWORK` | `devnet` |
| `HELIUS_RPC_URL` or `SOLANA_RPC_URL` | Your **devnet** HTTPS RPC URL |
| `SOLANA_PRIVATE_KEY` | Base58 **secret** for a **devnet** wallet (Railway variable; treat as secret) |
| `USE_JITO` | `false` |
| `CLI_MASTER_PASSWORD` | Strong password; required in dashboard **Master password** for `/api/*` mutations |

**Omit `WALLETS_CONFIG`** for the simplest Railway setup: the app uses **one** wallet from **`SOLANA_PRIVATE_KEY`** (see [VARIABLES.md](VARIABLES.md)).

The file **`data/wallets.example.json`** in the image is only a **template**; it points at placeholder keypair paths and is **not** usable as-is. For multi-wallet sim on Railway you must supply real keypair files inside the container (custom image) or extend the app — not covered in the minimal flow.

---

## Mainnet (real funds)

Only after you understand devnet:

| Variable | Value |
|----------|--------|
| `TRADING_NETWORK` | `mainnet` |
| `ALLOW_MAINNET_LIVE` | `true` (required or buys / sim return **403**) |
| At least one of | `HELIUS_RPC_URL`, `QUICKNODE_RPC_URL`, `SOLANA_RPC_URL` (**mainnet** URLs) |
| Signing | `SOLANA_PRIVATE_KEY` and/or valid keypair paths if you add files to the image |

Use **HTTPS** in front of the service in production and a **strong** `CLI_MASTER_PASSWORD`. See [MAINNET.md](MAINNET.md).

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Log: `bigint` / `Failed to load bindings, pure JS` | Usually harmless; native `bigint-buffer` failed to compile. The **Dockerfile** adds `python3 make g++` and `npm rebuild bigint-buffer`. On your machine: install build-essential / Xcode CLT, then `npm run rebuild`. |
| Deploy fails on build | Build logs: `npm ci` / `build:client` must succeed locally too (`npm run build:client`). |
| Health check never passes | Service logs: process exit? **`/api/health`** should return `{"ok":true}` without RPC. |
| Dashboard loads but everything errors | **Guided setup**: add **RPC** + **signer**; on mainnet add **`ALLOW_MAINNET_LIVE=true`**. |
| 401 on actions | Set **Master password** in the dashboard to match **`CLI_MASTER_PASSWORD`**. |
| 403 on mainnet | Set **`ALLOW_MAINNET_LIVE=true`** with **`TRADING_NETWORK=mainnet`**. |

---

## Related

- [VARIABLES.md](VARIABLES.md) — every env key  
- [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — dashboard, API, chat commands  
- [MAINNET.md](MAINNET.md) — live trading checklist  
- [DEVNET.md](DEVNET.md) — devnet / simulation  
