FROM node:20

# Installa XVFB + dipendenze grafiche
RUN apt-get update && apt-get install -y \
    xvfb \
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
RUN npm install --omit=dev

RUN npx playwright install --with-deps chromium

COPY . .

# Avvia con XVFB
CMD ["xvfb-run", "-a", "node", "index.js"]
