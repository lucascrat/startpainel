# Imagem do servidor de producao (Coolify).
# Puppeteer NAO roda aqui — automacoes Puppeteer ficam no worker.ts que roda
# no PC local do operador. Por isso nao precisamos instalar Chromium/X11/etc
# (saimos de uma imagem de ~2GB pra ~400MB e o build cai de ~3min pra ~1min).

FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
# Instala TODAS as dependencias (dev + prod) — devDeps tem tsx que usamos em runtime.
# npm install em vez de npm ci porque o registry as vezes da ECONNRESET no Coolify;
# install tolera melhor falhas transitorias de rede e tem retry interno.
# fetch-retries=5 da uma segunda chance se cair no meio.
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    (npm install --no-audit --no-fund || npm install --no-audit --no-fund)

# ===== Build do frontend (vite) =====
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ===== Runtime =====
FROM node:20-slim AS runner
WORKDIR /app

# Tini reaped zombies + sinaliza SIGTERM corretamente pro Express.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Roda como user nao-root.
RUN groupadd -r app && useradd -r -g app app

# Copia deps + build do estagio anterior. node_modules ja vem com devDeps
# porque server.ts roda via tsx (que esta em devDependencies).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY server.ts ./
COPY src ./src
COPY tsconfig.json ./
COPY index.html ./
COPY public ./public

RUN chown -R app:app /app
USER app

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
