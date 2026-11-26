#!/usr/bin/env bash
# Dumps the database named in .env to a compressed file and deletes old dumps.
# Run by hand or from cron on the VPS: `bash scripts/backup-db.sh`.
#
# Optional settings (environment variables):
#   BACKUP_DIR     where dumps are kept          (default /var/backups/pro-nutrition)
#   KEEP_DAYS      days to keep old dumps        (default 14)
#   BACKUP_REMOTE  rclone target for an off-server copy, e.g. gdrive:pronutrition
set -euo pipefail
umask 077 # dumps contain customer data: readable by this user only

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pro-nutrition}"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

# cron starts with a minimal PATH; node may come from nvm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$APP_DIR"
if [ ! -f .env ]; then
  echo "ERROR: $APP_DIR/.env is missing." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cnf="$(mktemp)"
part=""
trap 'rm -f "$cnf" ${part:+"$part"}' EXIT

# Turn DATABASE_URL into a private MySQL options file, so the password never
# appears in the process list. Prints the database name.
db="$(node - "$cnf" <<'JS'
const fs = require('fs');
const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
if (!line) throw new Error('DATABASE_URL is not set in .env');
const url = new URL(line.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1.*$/, '$2'));
const q = (s) => '"' + decodeURIComponent(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
fs.writeFileSync(
  process.argv[2],
  ['[client]', 'user=' + q(url.username), 'password=' + q(url.password),
   'host=' + q(url.hostname), 'port=' + (url.port || '3306'), ''].join('\n'),
);
process.stdout.write(decodeURIComponent(url.pathname.slice(1)));
JS
)"

file="$BACKUP_DIR/$db-$(date +%F_%H%M%S).sql.gz"
part="$file.part"

# --single-transaction: a consistent snapshot without blocking sales.
mysqldump --defaults-extra-file="$cnf" \
  --single-transaction --quick --no-tablespaces --hex-blob \
  --default-character-set=utf8mb4 --max-allowed-packet=512M \
  "$db" | gzip >"$part"

# mysqldump writes this line last, so its absence means a cut-off dump.
gzip -dc "$part" | tail -n 1 | grep -q 'Dump completed' || {
  echo "ERROR: the dump is incomplete; nothing was saved." >&2
  exit 1
}
mv "$part" "$file"
part=""
echo "$(date '+%F %T') Saved $file ($(du -h "$file" | cut -f1))"

# Old dumps are removed only after a new one has been saved.
find "$BACKUP_DIR" -maxdepth 1 -name "$db-*.sql.gz" -mtime +"$KEEP_DAYS" -delete

if [ -n "$BACKUP_REMOTE" ]; then
  rclone copy "$file" "$BACKUP_REMOTE"
  echo "$(date '+%F %T') Copied to $BACKUP_REMOTE"
fi
