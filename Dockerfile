FROM node:20-slim

# Install Chromium and the system libraries whatsapp-web.js (via puppeteer) needs
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium \
       ca-certificates \
       fonts-liberation \
       libnss3 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcups2 \
       libdrm2 \
       libgbm1 \
       libgtk-3-0 \
       libasound2 \
       libxss1 \
       libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

VOLUME ["/app/.wwebjs_auth", "/app/data"]

CMD ["node", "src/index.js"]
