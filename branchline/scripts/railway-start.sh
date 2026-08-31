#!/bin/sh
# Boots the built app on Railway (or any container host): materializes the
# runtime vars into .dev.vars for wrangler's local runtime, then serves the
# production build through workerd with D1/R2 state persisted to a volume.
set -e

: "${PORT:=3000}"
PERSIST_DIR="${PERSIST_DIR:-/data/state}"
mkdir -p "$PERSIST_DIR"

if [ "${DEMO_MODE:-true}" = "true" ] && [ -z "$AUTH_SECRET" ]; then
  echo "AUTH_SECRET is required when DEMO_MODE=true" >&2
  exit 1
fi

write_vars() {
  [ -n "$BFL_API_KEY" ] && echo "BFL_API_KEY=$BFL_API_KEY"
  [ -n "$MISTRAL_API_KEY" ] && echo "MISTRAL_API_KEY=$MISTRAL_API_KEY"
  [ -n "$DAILY_RUN_LIMIT" ] && echo "DAILY_RUN_LIMIT=$DAILY_RUN_LIMIT"
  [ -n "$VIDEO_DAILY_LIMIT" ] && echo "VIDEO_DAILY_LIMIT=$VIDEO_DAILY_LIMIT"
  [ -n "$AUTH_SECRET" ] && echo "AUTH_SECRET=$AUTH_SECRET"
  echo "VIDEO_ENABLED=${VIDEO_ENABLED:-false}"
  echo "DEMO_MODE=${DEMO_MODE:-true}"
  # Keep the function's exit status truthy even when optional vars are unset.
  true
}

# Wrangler resolves .dev.vars relative to the config file; write both spots.
write_vars > .dev.vars
write_vars > dist/server/.dev.vars

exec npx wrangler dev \
  --config dist/server/wrangler.json \
  --ip 0.0.0.0 \
  --port "$PORT" \
  --persist-to "$PERSIST_DIR"
