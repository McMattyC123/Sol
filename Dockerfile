# Build client, run single Node server (API + static UI). Run from repo root.
FROM node:20-bookworm-slim
WORKDIR /app

# bigint-buffer (@solana/web3.js) needs node-gyp toolchain or it logs "pure JS will be used".
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY scripts ./scripts
# postinstall runs scripts/ensure-bigint-native.mjs (rebuild if .node missing)
RUN npm ci

COPY src ./src
COPY data ./data
COPY server ./server
COPY client ./client

RUN npm run build:client

# Railway injects PORT at runtime (do not rely on 3001 in production).
ENV NODE_ENV=production
EXPOSE 3001

# .env / secrets: mount or inject at runtime (do not bake keypairs into the image)
CMD ["node", "server/index.js"]
