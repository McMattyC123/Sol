# Environment variables — what each one is and does

Every variable below is read from **`.env`** (repo root), process environment, or your host’s **Railway / systemd** env. **Never commit** real keys or API URLs with secrets in git. For Railway deploy order and dashboard-first setup, see **[RAILWAY.md](RAILWAY.md)**.

---

## Network cluster (which chain the app thinks it is on)

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `TRADING_NETWORK` | No* | One of `mainnet`, `devnet`, `testnet` (case-insensitive) | Tells Jupiter which **cluster** to quote/swap on. When set to `mainnet`, **`ALLOW_MAINNET_LIVE`** gates dangerous routes. *Omit only if you accept legacy “no gate” behavior (not recommended). |
| `ALLOW_MAINNET_LIVE` | On mainnet, yes | `true` or anything else | Must be **`true`** (string) when `TRADING_NETWORK=mainnet`, or **mutating** API routes and sim ticks return **403**. Stops accidental mainnet execution. |

---

## RPC (reading the chain and sending transactions)

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `HELIUS_RPC_URL` | At least one RPC | Full HTTPS URL, often `https://mainnet.helius-rpc.com/?api-key=...` or devnet host | Added to the **RPC pool**. Each request round-robins to the next provider in the list. |
| `QUICKNODE_RPC_URL` | optional | QuickNode Solana HTTPS endpoint | Same pool as above. |
| `SOLANA_RPC_URL` | optional | Generic Solana RPC URL | Same pool as above. |
| `HELIUS_WSS_URL` | optional | Helius Solana WebSocket endpoint (`wss://...`) | Reserved for real-time subscriptions (accounts/logs/tx). Exposed in `/api/status` as part of `wsPool`. |
| `QUICKNODE_WSS_URL` | optional | QuickNode Solana WebSocket endpoint (`wss://...`) | Same as above. |
| `SOLANA_WSS_URL` | optional | Generic Solana WebSocket endpoint (`wss://...`) | Same as above. |
| `COMMITMENT` | No (default `confirmed`) | Solana commitment level | Used when creating `Connection` objects (`processed` / `confirmed` / `finalized`). Affects how “sure” balance and slot calls are before returning. |

If **none** of the three HTTP RPC URL variables are set, the app throws at startup when it needs RPC. WSS-only setup is not sufficient for current transaction and balance flows.

---

## Signing / wallets

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `SOLANA_KEYPAIR_PATH` | For primary wallet flows | Filesystem path to a **JSON keypair** (Solana CLI format: array of byte values) | **Primary signer** for `transfer` in the API/CLI. Also used as **Jito gRPC auth** keypair if `JITO_AUTH_KEYPAIR_PATH` is unset and this file exists. |
| `SOLANA_PRIVATE_KEY` | Alternative to path | Base58-encoded **64-byte secret key** | Same role as loading from `SOLANA_KEYPAIR_PATH` for code paths that use `loadPrimaryKeypair` / env-based deploys. **Extremely sensitive** — do not log or commit. |
| `WALLETS_CONFIG` | For multi-wallet | Path to JSON file: list of `{ label, keypairPath, group, role, optional targetMint }` | Loads **multiple** keypairs for `wallets`, `buy`, and **simulation** (buyers/sellers by `group`). **`targetMint`** = SPL mint that wallet is tied to for buys/sells without passing mint each time. |

Aliases for per-wallet mint in JSON: `coinMint`, `mint`, `tokenMint` (see code).

---

## Jito (bundles on mainnet)

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `USE_JITO` | No (default on) | `true` / `false` | If **not** `false`, signed swaps are sent through **Jito** (`sendBundle`). If `false`, sends as a normal **`sendRawTransaction`** on the RPC. |
| `BLOCK_ENGINE_URL` | No | Host for Jito block engine | Default `mainnet.block-engine.jito.wtf`. gRPC client connects here. |
| `JITO_AUTH_KEYPAIR_PATH` | No* | Path to JSON keypair | Authenticates the **searcher** gRPC session to Jito. *If omitted, **`SOLANA_KEYPAIR_PATH`** is used when present. |
| `JITO_TIP_LAMPORTS` | No | Integer string | Lamports added as a **tip** transaction in the bundle (validators). Default `10000` (0.00001 SOL). |
| `BUNDLE_TRANSACTION_LIMIT` | No | Integer 1–5 (higher values **clamped to 5**) | Max transactions per **one** Jito bundle (includes the tip tx when `JITO_TIP_LAMPORTS` &gt; 0). Jito’s block engine caps at **5**; raising this env cannot exceed that. |
| `SKIP_PREFLIGHT` | No | `true` / `false` | When **not** using Jito (vanilla RPC path), whether to skip simulation before send. Default `false`. |

### Versioned transactions & preloaded address lookup tables (ALT)

- **Why ALTs exist:** In a **v0** (`VersionedTransaction`) message, accounts can be listed in the **static** account-key block (each pubkey is **32 bytes** on the wire in that list) **or** pulled in via **address lookup tables**. For accounts resolved through a lookup table, the message carries the **lookup table’s address** plus **compact indices** (typically **one byte each**) into that table’s on-chain **preloaded** address list—instead of repeating another full 32-byte pubkey in the static keys for every such account. That frees space so complex routes (many programs/accounts) still fit under Solana’s transaction size limit.
- **Preloading:** You (or a protocol) create an on-chain ALT account and **extend** it with the addresses you want cached. Validators **load the table account data** at execution time to map indices → full pubkeys.
- **This repo:** Swaps use Jupiter’s **`POST /swap`**, which returns an already-serialized **v0** transaction. Jupiter embeds whatever **`addressTableLookups`** the route needs; the app does **not** build custom ALTs or splice your own preloaded table into that response. To use **your** ALTs you would need a custom builder (or API support to pass lookup table accounts) and is out of scope for the current integration.

### Address lookup tables vs “more than 5 swaps” in one bundle

ALT compression affects **bytes per transaction**, not how many **separate transactions** Jito allows in one bundle (still capped at **five**). **`JUPITER_USE_SHARED_ACCOUNTS`** (below) nudges Jupiter toward routes that are often smaller and more LUT-friendly for messy meme-coin paths—but you still cannot pack **more than five transactions** (e.g. four swaps + one tip) in a single Jito bundle. Beyond that requires another bundle submission.

### Jito bundle atomicity and master sell-all (`sell-all-jito`)

- **Per bundle:** Transactions in **one** submitted Jito bundle are intended to execute **atomically and sequentially** (all land in the same block context for that bundle, or that **whole bundle** does not succeed as a unit). See the Jito / `jito-ts` bundle model.
- **Across bundles:** The CLI command **`sell-all-jito`** may submit **multiple** bundles when more wallets have a balance than fit in a single bundle. `swapSlots` is the max number of SPL→SOL **swap** transactions per bundle (see `BUNDLE_TRANSACTION_LIMIT` and whether a slot is reserved for `JITO_TIP_LAMPORTS`). **There is no cross-bundle all-or-nothing guarantee:** later bundles can still land if an earlier one fails, unless you keep the sell set small enough for one bundle (`bundleCount` in the JSON output is how many Jito submissions ran).

---

## Jupiter (DEX aggregator)

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `JUPITER_QUOTE_URL` | No | Base URL for quotes | Default `https://quote-api.jup.ag/v6`. App calls `GET.../quote`. |
| `JUPITER_SWAP_URL` | No | Base URL for swap | Default same host; `POST.../swap` returns serialized transaction. |
| `SLIPPAGE_BPS` | No (default `100`) | Basis points | `100` = 1% max slippage passed to Jupiter unless overridden in code. |
| `JUP_PRIORITIZATION_LAMPORTS` | No | Number or omit | If set, passed into swap request as fixed **priority fee** lamports; else often `auto` in payload. |
| `JUPITER_USE_SHARED_ACCOUNTS` | No (default on) | `true` / `false` | When **not** `false`, sets **`useSharedAccounts: true`** on Jupiter `/swap` so routes can use shared vault accounts (often **smaller** txs via v0 + lookups). Some illiquid or very new pools may fail with shared accounts—set to `false` to opt out. |

Cluster query parameter for devnet/testnet comes from **`TRADING_NETWORK`**, not from a separate env var.

---

## Simulation (ticks and optional loop)

Each **`sim tick`** / **`POST /api/sim/tick`** runs **`runWashTick` once**. A **loop** repeats ticks: dashboard **Start loop** / **`POST /api/sim/run`**, **`npm run worker`**, CLI **`sim run`**, or PM2 ([ecosystem.config.cjs](../ecosystem.config.cjs)).

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `SIMULATION_CONFIG` | No | Path to JSON | Sizing rules and group names: `buyerGroup`, `sellerGroup`, `groups.*.buy` / `.sell` (see [data/simulation.json](../data/simulation.json)). Defaults to `./data/simulation.json` if file missing uses minimal inline defaults. |
| `SIM_MINT` | No | SPL mint address | For **`npm run worker`**: optional mint; if unset, buyer/seller wallets must share the same **`targetMint`**. |
| `SIM_INTERVAL_MS` | No (default `15000`) | Milliseconds | Default interval between **loop** ticks (worker, `sim run`, or API when body omits `intervalMs`). |
| `SIM_JITTER_MS` | No (default `3000`) | Milliseconds | Random extra 0…jitter between **loop** ticks. |
| `SIM_RR_STATE_PATH` | No | Path to JSON file | **Round-robin cursors** for the next tick. Default `data/rr-state.json`. |

---

## Auth / HTTP server

| Variable | Required | What it is | What it does |
|----------|----------|------------|--------------|
| `CLI_MASTER_PASSWORD` | Recommended in prod | Any secret string | If set, **CLI** may prompt once (TTY) before sensitive commands; **HTTP API** requires `X-Master-Password` header or JSON `masterPassword` on protected **POST** routes. |
| `PORT` | No (default `3001`) | TCP port | **Express + Socket.IO** listen port. **Railway injects `PORT`** — do not hardcode in production there unless you know you need to. |

---

## Client-only (Vite dev / build)

Not read by the Node server. Set in **`client/.env`** if needed.

| Variable | What it does |
|----------|--------------|
| `VITE_API_URL` | If set, browser **fetch** and **Socket.IO** connect to this **origin** instead of same-host proxy. Empty in dev = use Vite proxy to `:3001`. |

---

## Quick “do I need this?” summary

- **Minimal read-only:** `HELIUS_RPC_URL` (or `SOLANA_RPC_URL`) — enough for `status` that only needs RPC.
- **Minimal mainnet trading:** above + `TRADING_NETWORK=mainnet` + `ALLOW_MAINNET_LIVE=true` + `SOLANA_KEYPAIR_PATH` **or** `SOLANA_PRIVATE_KEY` + optional `WALLETS_CONFIG`.
- **Minimal devnet sim:** `TRADING_NETWORK=devnet` + RPC + keys + `USE_JITO=false` + `SIMULATION_CONFIG` path as needed.

Full templates: [.env.example.mainnet](../.env.example.mainnet), [.env.example.devnet-sim](../.env.example.devnet-sim).
