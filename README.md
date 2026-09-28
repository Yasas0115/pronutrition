# Pro Nutrition — POS

A point-of-sale app for the **Pro Nutrition** supplement store, built with the
same visual theme as the Anod Gym app (red `#EF4444` brand, Barlow / Barlow
Condensed type, dark + light toggle).

Standalone **Next.js 15** app (App Router, React 19) with **Prisma + MySQL /
MariaDB** — ready to host on a VPS.

## Features
- **Point of Sale** — product grid with search & barcode scan (type/scan then
  Enter), tap-to-add cart, live stock, discount, cash/card, change calculator,
  and a printable receipt.
- **Products & inventory** — catalogue with categories, price/cost, stock with
  low-stock & out-of-stock alerts, inline restock, add/edit/delete.
- **Sales & reports** (owner) — today / month / all-time takings, best sellers,
  recent receipts with detail view, printable report.
- **Settings** (owner) — store name, logo upload, currency, tax %, phone/address,
  receipt footer note.
- **Auth** — cookie session (JWT via `jose`), roles: `OWNER` and `STAFF`.
- **Theme** — dark/light toggle, no flash on load, fully responsive (desktop +
  mobile, with a mobile cart drawer).

## Requirements
- Node ≥ 20 (tested on 24)
- pnpm (`npm i -g pnpm`)
- MySQL 8 or MariaDB 10.4+ (locally, XAMPP's MariaDB works)

## Getting started

```bash
pnpm install
cp .env.example .env       # then set DATABASE_URL + AUTH_SECRET
pnpm db:migrate            # create all tables (prisma migrate deploy)
pnpm db:seed               # payment methods only — no demo data
pnpm dev                   # http://localhost:3000
```

> `pnpm run setup` does generate + migrate + seed in one step.
> Local XAMPP: `DATABASE_URL="mysql://root:@localhost:3306/pro_nutrition"`
> (create the empty `pro_nutrition` database in phpMyAdmin first).

**Image uploads need `max_allowed_packet` ≥ 16M** (product photos / logo are
stored in the DB, up to 3 MB per product). MySQL 8 defaults to 64M; XAMPP ships
with 1M — set `max_allowed_packet=64M` under `[mysqld]` in
`C:\xampp\mysql\bin\my.ini` and restart MySQL.

### First run
No demo accounts are created. On first launch, open the app and use
**Create your company** (`/register`) to set up your store and owner login.
Add cashiers afterwards from **Users**.

Cashiers see **POS** and **Products**; owners also get **Sales & Reports** and
**Settings**.

## Handy scripts
```bash
pnpm dev          # dev server
pnpm build        # production build (runs prisma generate first)
pnpm start        # run the production build
pnpm typecheck    # tsc --noEmit
pnpm db:migrate   # apply pending migrations (use this on the VPS)
pnpm db:reset     # DROP all tables, re-migrate + reseed (dev only!)
pnpm db:wipe      # delete all data + users, keep tables & payment methods
pnpm db:wipe-keep-owner --yes      # delete all data + staff, keep owner login, settings & branches
pnpm exec tsx scripts/verify-checkout.ts   # integration check for the sale flow
```

## Project layout
```
pro nutrition/
├─ app/
│  ├─ page.tsx            POS checkout (default route)
│  ├─ products/           catalogue & inventory
│  ├─ sales/              sales & reports (owner)
│  ├─ settings/           store settings (owner)
│  ├─ login/              sign-in
│  ├─ actions.ts          auth + checkout server actions
│  ├─ layout.tsx          fonts + theme boot script
│  └─ globals.css         the shared theme (tokens + components)
├─ components/            AppShell, POSView, ProductsView, SalesView, modals…
├─ lib/
│  ├─ db.ts               Prisma client singleton
│  ├─ auth.ts / session.ts  cookie session (jose)
│  ├─ checkout.ts         transactional sale core (validate → total → decrement)
│  ├─ money.ts / dates.ts formatting helpers
│  └─ password.ts         scrypt hashing (no native deps)
├─ prisma/
│  ├─ schema.prisma       Store, User, Product, Sale, SaleItem
│  └─ seed.ts             demo data
└─ scripts/verify-checkout.ts
```

## Notes
- Money is stored as whole rupees (integers) throughout.
- Sale line items snapshot the product name & price, so history stays correct
  even if a product is later renamed, repriced, or removed.
- Deleting a product that has sales history deactivates it instead (keeps
  reports intact).

## Deploying to a VPS (Ubuntu + MySQL)

```bash
# 1. MySQL: database + user
sudo mysql -e "CREATE DATABASE pro_nutrition CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'pronutrition'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
  GRANT ALL PRIVILEGES ON pro_nutrition.* TO 'pronutrition'@'localhost'; FLUSH PRIVILEGES;"

# 2. App
git clone <repo> /var/www/pro-nutrition && cd /var/www/pro-nutrition
pnpm install
cp .env.example .env          # DATABASE_URL=mysql://pronutrition:STRONG_PASSWORD@localhost:3306/pro_nutrition
                              # AUTH_SECRET=<long random string>
pnpm setup                    # generate + migrate + seed payment methods
pnpm build

# 3. Keep it running
npm i -g pm2
pm2 start "pnpm start" --name pro-nutrition && pm2 save && pm2 startup
```

Then put Nginx in front (`proxy_pass http://127.0.0.1:3000;`, plus
`client_max_body_size 10M;` so photo uploads fit) and add HTTPS with
`certbot --nginx`. Open the site and create the company + owner at `/register`.

**Updating later:** push to `main` — GitHub Actions deploys it (see below). To
deploy by hand on the server: `git pull && bash scripts/deploy.sh`.
Never run `pnpm db:reset` on the server — it drops every table.

### Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `main`: it typechecks and
builds on GitHub first, and only if that passes it SSHes into the VPS, checks out
the pushed commit and runs `scripts/deploy.sh` (install → build → migrate →
`pm2 restart` → health check). Pull requests get the build check only.

One-time setup:

1. **Deploy key** — on the VPS, as the user that owns the app and runs pm2:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N "" -C github-actions
   cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/github_actions          # copy this private key for step 3
   ```
2. **Link the app folder to the repo** (skip `git init`/`remote add` if it is
   already a clone — use `git remote set-url origin …` instead):
   ```bash
   cd /var/www/pro-nutrition
   cp .env ~/pro-nutrition.env.bak   # safety copy — .env is not in git
   git init -b main
   git remote add origin https://github.com/Yasas0115/pronutrition.git
   git fetch origin main
   git reset --hard origin/main      # server files now match GitHub
   bash scripts/deploy.sh            # first deploy by hand to confirm it works
   ```
3. **GitHub → Settings → Secrets and variables → Actions**
   - Secrets: `VPS_HOST` (IP or domain), `VPS_USER`, `VPS_SSH_KEY` (the private
     key from step 1), and `VPS_PORT` if SSH is not on 22.
   - Variables (only if different from the defaults): `APP_DIR`
     (`/var/www/pro-nutrition`), `PM2_NAME` (`pro-nutrition`).

Until the secrets exist, the deploy job is skipped with a warning. Re-run a
deploy any time from **Actions → Build & Deploy → Run workflow**.

**Changing the schema:** edit `prisma/schema.prisma`, run
`pnpm exec prisma migrate dev --name <change>` locally, commit the new folder in
`prisma/migrations/`, and `pnpm db:migrate` applies it on the VPS.
