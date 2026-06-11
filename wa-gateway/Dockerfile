# Dockerfile for WhatsApp Gateway (whatsapp-web.js + Puppeteer)
# Requires Chromium for headless browser automation

FROM node:20-alpine

WORKDIR /app

# Install Chromium and dependencies required by Puppeteer / whatsapp-web.js
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev

# Tell Puppeteer to use the installed Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Session data is stored in .wwebjs_auth — mount a persistent volume here
VOLUME ["/app/.wwebjs_auth"]

EXPOSE 8000

CMD ["node", "server.js"]
