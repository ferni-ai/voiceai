# =============================================================================
# Ferni Async Workers - Cloud Run Container
# =============================================================================
#
# Expects `pnpm build:fast` to have already run in apps/async (ferni deploy
# async does this). That local build can see monorepo sources for the
# daily-outreach bundle; the image only needs dist/ + production deps.

FROM node:20-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json ./
RUN pnpm install --prod --prefer-offline || pnpm install --prod

COPY dist ./dist

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server.js"]
