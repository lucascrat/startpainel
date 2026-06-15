FROM node:20-slim
WORKDIR /app

# Dependencias base (agora com xvfb)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates curl wget gnupg xvfb \
    fonts-liberation fonts-ipafont-gothic fonts-wqy-zenhei \
    fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    libxss1 libx11-xcb1 libxcomposite1 libxcursor1 \
    libxdamage1 libxi6 libxtst6 libnss3 libcups2 \
    libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 \
    libatk-bridge2.0-0 libgtk-3-0 libdrm2 libgbm1 libxfixes3 \
    libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

# Instala Google Chrome REAL (não Chromium) — fingerprint identical a desktop
RUN wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/chrome.deb \
    && rm /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# Aponta puppeteer para o Chrome real (não Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

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

# Display port for xvfb
ENV DISPLAY=:99

# Healthcheck — Docker/Coolify só consideram o container "saudável" quando o
# /api/health responde. start-period generoso (60s) cobre o boot + Chrome.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# Inicia Xvfb em background e depois o node (modo headful = 100% real)
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset & npm start"]
