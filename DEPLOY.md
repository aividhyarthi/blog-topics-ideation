# Deploying AI Page Audit to Railway

AI Page Audit is a **paid, account-gated tool**. Accounts, credits, payments and saved
audits all live in a self-contained SQLite database file that the app carries
with it — **no separate database service to create or link.** The one thing
that has to exist is a persistent folder for that file to live in, or every
redeploy wipes it.

> **If you see "Accounts are temporarily unavailable" on signup, this page is
> the fix.** It means the running app has nowhere durable to write. Jump to
> [Step 2](#step-2-add-a-volume-required) — and check `/setup` first, it's a
> plain-English status page built for exactly this.

---

## Step 0 — check what's actually wrong

Open `https://<your-domain>/setup` in a browser. It's written for a
non-technical operator and tells you, in plain English, whether the site is
live and what to click next if it isn't. `/api/health` gives the same
information as raw JSON if you want it.

---

## Step 1 — create the Railway project

1. Go to **https://railway.com** → **New Project** → **Deploy from GitHub repo**.
2. Choose **`aividhyarthi/blog-topics-ideation`**.
3. Pick the branch you want live (currently **`aeo-checker`**).
4. Leave **Root Directory** blank. Railway auto-detects the `Dockerfile`.

---

## Step 2 — add a Volume (REQUIRED)

Without this, nobody can sign up, log in, buy credits, or run a single check.
The app deliberately **locks itself** rather than running unmetered — and,
just as important, rather than quietly storing real customer data on disk
that vanishes the next time Railway redeploys.

This is all on the **one** service that is your website. There is no second
service to create or link.

1. Open your website's service → **Settings** → **Volumes** → **New Volume**.
2. Set the mount path to **`/data`**.
3. Open **Variables** → **New Variable**: name **`DATA_DIR`**, value **`/data`**
   (must match the mount path exactly).
4. Redeploy.
5. Reload `/setup`. It should now say your site is live.

The database schema creates itself on first boot — there is no migration step,
and no second service's connection string to copy or get wrong.

---

## Step 3 — the other variables

Open the service → **Variables**:

| Variable | Required? | What it does |
|---|---|---|
| `DATA_DIR` | **Yes** | Where accounts, credits, payments and saved audits live. See Step 2 — must be paired with a Volume at the same path. |
| `ADMIN_EMAIL` | **Yes, to get paid** | The account allowed to open `/admin/payments` and approve UPI payments. Set it to your own signup email. |
| `SESSION_SECRET` | Recommended | Signs session cookies. Any long random string. |
| `RESEND_API_KEY` + `MAIL_FROM` | **Yes, in practice** | Sends password-reset email. Without both, a customer who forgets their password cannot recover the account themselves, and the reset form says so honestly. Get a key at resend.com; `MAIL_FROM` must be an address on a domain you've verified there. |
| `SUPPORT_EMAIL` | Recommended | Shown on the legal pages and in the "email us" fallback when reset mail isn't configured. |
| `SITE_URL` | Recommended | Your public origin, e.g. `https://citerank.app`. Used for canonical tags, `sitemap.xml`, and links inside reset emails. Falls back to the request host. |
| `OPENAI_API_KEY` *or* `ANTHROPIC_API_KEY` | Recommended | Powers the AI-judged audit signals. Without either, rule-based signals still score and AI ones default to 50. |
| `UPI_ID` | To accept payments | Your UPI address, e.g. `you@okhdfcbank`. Rendered into the QR on `/pricing`. |
| `UPI_PAYEE_NAME` | To accept payments | Name shown in the payer's UPI app. |
| `UPI_AMOUNT_INR` | Optional | Monthly Pro price in INR. Defaults to `8299`. |
| `PORT` | **No — never set this** | Railway injects it. Setting it manually breaks routing. |

Then **Settings → Networking → Generate Domain** for a public URL.

---

## Step 4 — verify before announcing it

Run these against your live domain, in order:

1. `/setup` → says your site is live.
2. Open `/` signed out → you should see **"Sign in to run a check"**, not a
   working form. The tool is gated on the server; if you can use it signed out,
   something is very wrong.
3. `/blog`, `/news`, `/glossary` signed out → these **should** load. They are
   public on purpose, for search and AI visibility.
4. Sign up → your first check is free. Run it.
5. Run a second check → should be refused with a prompt to buy credits.
6. Sign in as `ADMIN_EMAIL` → `/admin/payments` should open. Any other account
   should be refused.

---

## How payment works today

Stripe cannot do recurring billing for Indian businesses, so billing is a
**manual UPI flow** for now:

1. Customer picks a pack on `/pricing` and pays the QR via any UPI app.
2. They submit the UTR/reference number as a payment claim.
3. You open `/admin/payments`, cross-check the amount and UTR against your bank,
   and click **Approve**.
4. Credits (or Pro for 30 days) land on their account immediately.

Nothing is charged automatically and nothing is stored about their card. Replace
this with Razorpay Subscriptions when you're ready.

---

## Redeploys and backups

Railway watches the branch you selected and redeploys on every push. The
Volume persists across redeploys — that's the whole point of Step 2. It does
**not** survive if the Volume itself is deleted, so treat it like you would any
production database: back it up periodically. The entire database is one file
at `/data/citerank.db` inside the container; Railway's volume backup/snapshot
feature (if available on your plan) covers it automatically.

## Common questions

- **"Accounts are temporarily unavailable."** No `DATA_DIR`/Volume yet. Step 2.
- **A URL won't check ("bot-blocked / JS-rendered").** Some sites refuse
  crawlers. Use the **Paste** tab instead. A failed fetch is refunded — it does
  not consume the customer's check.
- **Can I let people try it without an account?** Not currently, by design. Every
  check costs real bandwidth and AI tokens, so all of them are metered.
- **Why SQLite instead of Postgres?** One process, one Volume, nothing to link
  between services — the whole failure mode of "added the variable to the
  wrong box" goes away. If you outgrow a single instance later, this can move
  to Postgres without changing anything customer-facing.
