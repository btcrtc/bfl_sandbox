# Branchline on a container host (Railway): the app targets the Cloudflare
# Workers runtime, so the container serves the production build through
# wrangler's local workerd with D1/R2 persisted to a mounted volume.
FROM node:22-slim

# workerd is a native binary doing its own TLS: without the system CA store
# every outbound fetch fails with "self signed certificate in certificate
# chain".
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_DIR=/etc/ssl/certs

WORKDIR /app

COPY branchline/package.json branchline/package-lock.json ./
RUN npm ci

COPY branchline/ ./
RUN npm run build

ENV CI=1 \
    WRANGLER_SEND_METRICS=false \
    NODE_ENV=production

CMD ["sh", "scripts/railway-start.sh"]
