FROM node:20

# Installa solo le dipendenze necessarie per Chromium + Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    libnspr4 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia prima i file package per sfruttare la cache Docker
COPY package*.json ./

# Installa le dipendenze
RUN npm install --omit=dev

# Installa Chromium di Playwright
RUN npx playwright install --with-deps chromium

# Copia tutto il codice
COPY . .

# Comando di avvio
CMD ["node", "index.js"]
