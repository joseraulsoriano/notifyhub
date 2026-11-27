FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY services/presence ./services/presence

USER node
CMD ["node", "services/presence/index.js"]
