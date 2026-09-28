#!/usr/bin/env bash
# Builds and restarts the app on the VPS. GitHub Actions runs this over SSH
# after checking out the pushed commit (see .github/workflows/deploy.yml);
# you can also run it by hand on the server: `bash scripts/deploy.sh`.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PM2_NAME="${PM2_NAME:-pro-nutrition}"
APP_PORT="${APP_PORT:-3000}"

# Non-interactive SSH sessions skip ~/.bashrc, so node/pnpm/pm2 installed via
# nvm or the pnpm installer are not on PATH yet.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
export PATH="$PNPM_HOME:$PATH"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $APP_DIR/.env is missing (it is not in git). Create it from .env.example." >&2
  exit 1
fi

echo "==> Deploying $(git rev-parse --short HEAD) in $APP_DIR"

pnpm install --frozen-lockfile
pnpm build        # prisma generate + next build
pnpm db:migrate   # prisma migrate deploy — only applies new migrations

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start "pnpm start" --name "$PM2_NAME"
fi
pm2 save

echo "==> Waiting for the app on port $APP_PORT"
curl -fsS -o /dev/null --retry 15 --retry-delay 2 --retry-connrefused \
  "http://127.0.0.1:$APP_PORT/login"
echo "==> Deploy OK"
