FROM node:20

# Installa XVFB + tutte le dipendenze grafiche necessarie
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
    libxshmfence1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

RUN npx playwright install --with-deps chromium

COPY . .

# Avvia con XVFB (schermo virtuale)
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24", "node", "index.js"]
