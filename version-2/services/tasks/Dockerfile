FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY shared ./shared
COPY services/tasks ./services/tasks

USER node
CMD ["node", "services/tasks/index.js"]
