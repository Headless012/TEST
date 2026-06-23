FROM node:20

# Installa dipendenze di sistema per Playwright/Chromium
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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Usa npm install invece di npm ci (più tollerante)
RUN npm install --omit=dev

# Installa Chromium per Playwright
RUN npx playwright install --with-deps chromium

COPY . .

CMD ["npm", "start"]
