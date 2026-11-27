FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY services/gateway ./services/gateway

USER node
CMD ["node", "services/gateway/index.js"]
