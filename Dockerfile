# Imagem do servidor de producao (Coolify).
# Puppeteer NAO roda aqui — automacoes ficam no worker.ts que roda no PC local.
# Por isso nao precisamos instalar Chromium/X11/etc. Build single-stage simples
# pra evitar OOM no Coolify durante o "exporting to image" do multi-stage.

FROM node:20-slim
WORKDIR /app

# Tini = PID 1 com SIGTERM correto. ca-certificates pra TLS sair.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Retries do npm pra tolerar ECONNRESET do Coolify.
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000

# Instala dependencias (cache hit em mudancas so de source).
COPY package*.json ./
RUN (npm install --no-audit --no-fund || npm install --no-audit --no-fund)

# Codigo + build do frontend
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Healthcheck — Docker/Coolify só consideram o container "saudável" quando o
# /api/health responde. start-period generoso (40s) cobre o boot do servidor.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
