# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN npm install -g pnpm@11.1.1
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@notifyhub/api...
RUN pnpm deploy --legacy --filter=@notifyhub/api --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/packages/persistence/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
