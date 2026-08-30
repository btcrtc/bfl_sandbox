# Branchline on a container host (Railway): the app targets the Cloudflare
# Workers runtime, so the container serves the production build through
# wrangler's local workerd with D1/R2 persisted to a mounted volume.
FROM node:22-slim

WORKDIR /app

COPY branchline/package.json branchline/package-lock.json ./
RUN npm ci

COPY branchline/ ./
RUN npm run build

ENV CI=1 \
    WRANGLER_SEND_METRICS=false \
    NODE_ENV=production

CMD ["sh", "scripts/railway-start.sh"]
