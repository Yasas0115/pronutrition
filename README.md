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
- **Products & Stock** — catalogue with categories and the retail price, stock
  with low-stock & out-of-stock alerts, receive / count / transfer, movement
  ledger. The buying price is only an input box (for staff with the *Expenses,
  profit & buying prices* grant); its figures are in Accounting › Stock value.
- **Sidebar** — five entries: *Point of Sale*, *Store* (Products & Stock,
  Categories), *Customers*, *Accounting* (Sales, Receivables, Expenses & Payroll,
  Profit & Cash, Stock value, Activity log) and *Administration* (Branches, Staff,
  Settings). **Every money total, balance, ledger and history lives under
  Accounting** — the till and the price input boxes are the only other places an
  amount appears. Each Accounting page is gated by the staff member's own grants
  (see *Who sees what* below). The old `/sales`, `/accounts` and `/finance` URLs
  redirect.
- **Accounting › Sales** (*Sales & takings* grant) — today / month / all-time
  takings (tax included) with net sales (the figure profit is measured on), best
  sellers, recent receipts (re-printable), takings by branch and the sales mix by
  payment method and retail / wholesale.
- **Customers** — the directory of registered customers and shops (name, phone,
  address, type, notes). Walk-ins pay Cash or Card only; Koko, Bank transfer and
  Credit need a registered customer. No balances are shown here.
- **Accounting › Receivables** (*Customers* grant) — who owes what, aged
  0–30 / 31–60 / 61–90 / 90+ days. Open a customer for their ledger, receive a
  payment (applied oldest-sale-first, dated and timed) and print a statement.
- **Wholesale** — a Retail / Wholesale switch in the POS for selling in bulk to
  another shop (registered customer required, line prices editable, no automatic
  payment-method discount).
- **Accounting › Stock value** (owner / *Expenses, profit & buying prices* grant) —
  buying vs retail price, what the stock is worth and the margin, plus the
  price-change history. Buying prices are never sent to anyone without that grant.
- **Accounting › Expenses & Payroll** (same grant) — expenses by category, worker
  salaries (monthly due vs paid, bonus / deduction) and petty cash taken by
  workers.
- **Accounting › Profit & Cash** (same grant) — profit & loss for any date range
  (net sales − cost of goods − expenses, retail vs wholesale), the cash-drawer
  report and the till float with a full change history. Entries are never edited
  or deleted — mistakes are voided with a reason and drop out of the reports.
  Every entry records the business date *and* the exact time it was entered, plus
  who entered it.
- **Accounting › Activity log** (same grant) — who changed what, and when.
- **Branch transfers** (owner) — move any number of products between two branches
  as one numbered document (TRF-1001), saved all-or-nothing. The Transfers tab
  shows both branches' before → after balances for every line (−3 / +3) with a
  printable hand-over note, and **Stock check** replays the stock history against
  the live counts to flag anything that no longer adds up.
- **Passwords by email only** — nobody types a new password into the app. *Forgot
  password?* on the sign-in page, *Change password* in the account menu and
  *Send password reset email* on the Staff page all send a one-time link
  (30 minutes, single use). Changing a password signs out every older session.
  See **Email setup** below.
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

### Who sees what
The owner sees everything. A staff member sees only what the owner ticked on the
Staff page; the grants map onto the sidebar like this:

| Grant | Opens |
|---|---|
| Point of Sale | the till |
| Products & inventory / Stock control | Store › Products & Stock |
| Categories | Store › Categories |
| Customers + Accounting: Receivables | Customers, Accounting › Receivables |
| Accounting: Sales & takings | Accounting › Sales |
| Accounting: Expenses, profit & buying prices | Accounting › Expenses & Payroll, Profit & Cash, Stock value, Activity log |
| Branches / Staff | Administration › Branches / Staff |

Settings is owner-only.

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
pnpm exec tsx scripts/verify-credit.ts     # customer rules, credit, wholesale, settlement
pnpm exec tsx scripts/verify-prices.ts     # price history, cost snapshot, Colombo dates
pnpm exec tsx scripts/verify-profit.ts     # expenses, salaries, float, profit & loss, cash drawer
pnpm exec tsx scripts/verify-transfer.ts   # multi-product transfers, atomicity, stock check
pnpm exec tsx scripts/verify-password.ts   # email reset flow against a built-in fake mail server
```
The `verify-*` scripts build their own throw-away branch/products and remove them
afterwards, but they do write to the database in `DATABASE_URL` — run them against
a local database, not production.

## Email setup (password reset)

Passwords change only through an emailed link, so the server needs a mailbox to
send from. Add these to `.env` (on the VPS: `/var/www/pro-nutrition/.env`) and
restart with `pm2 restart pro-nutrition --update-env`:

```
SMTP_HOST="smtp.gmail.com"        # smtp.zoho.com, or your hosting provider's mail server
SMTP_PORT="587"                   # 587 = STARTTLS, 465 = TLS
SMTP_USER="you@gmail.com"
SMTP_PASS="xxxx xxxx xxxx xxxx"   # an App password, not your normal password
MAIL_FROM="Pro Nutrition <you@gmail.com>"
APP_URL="https://your-domain.example"   # the address people open the app at
```

*Gmail:* turn on 2-step verification, then Google Account → Security → App
passwords, and paste the 16-character password above. Until these are set,
*Forgot password?* says email is not set up — nothing breaks.

**Locked out with no email working?** On the server, as the person who runs the
app: `pnpm exec tsx scripts/set-owner.ts <email> <new-password>` makes that
account an owner with the new password and signs out any old session. Treat it
as break-glass; day-to-day changes go through the emailed link.

## Project layout
```
pro nutrition/
├─ app/
│  ├─ page.tsx            POS checkout (default route)
│  ├─ products/           products & stock
│  ├─ customers/          customer directory
│  ├─ accounting/         sales · receivables · expenses · profit · stock-value · activity
│  ├─ sales/ accounts/ finance/   redirects to the Accounting pages
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
