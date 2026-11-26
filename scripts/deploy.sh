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

restart_app() {
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME" --update-env
  else
    pm2 start "pnpm start" --name "$PM2_NAME"
  fi
}

app_is_up() {
  curl -fsS -o /dev/null --max-time 10 --retry 15 --retry-delay 2 --retry-connrefused \
    "http://127.0.0.1:$APP_PORT/login"
}

pnpm install --frozen-lockfile

# Build into .next-build so the running app keeps serving from .next. If the
# build fails, the script stops here and the live app is left as it was.
rm -rf .next-build .next/types # old generated types would be type-checked too
if [ -d .next/cache ]; then
  mkdir -p .next-build
  cp -a .next/cache .next-build/
fi
NEXT_DIST_DIR=.next-build pnpm build # prisma generate + next build
pnpm db:migrate                      # prisma migrate deploy — only applies new migrations

echo "==> Switching to the new build"
rm -rf .next-previous
if [ -d .next ]; then mv .next .next-previous; fi
mv .next-build .next
restart_app

echo "==> Waiting for the app on port $APP_PORT"
if ! app_is_up; then
  echo "ERROR: the new build does not answer on port $APP_PORT." >&2
  if [ -d .next-previous ]; then
    echo "==> Putting the previous build back" >&2
    rm -rf .next
    mv .next-previous .next
    restart_app
    if app_is_up; then
      echo "Previous build is running again. Database migrations were NOT undone." >&2
    else
      echo "The previous build does not answer either. Check: pm2 logs $PM2_NAME" >&2
    fi
  fi
  exit 1 # still a failed deploy
fi
pm2 save
echo "==> Deploy OK"
