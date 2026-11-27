FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY services/auth ./services/auth

USER node
CMD ["node", "services/auth/index.js"]
