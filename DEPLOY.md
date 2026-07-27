# Deploying CiteRank to Railway

CiteRank is a **paid, account-gated tool**. Accounts, credits, payments and saved
audits all live in Postgres, so **the app needs a database to function at all**.

> **If you see "Accounts are temporarily unavailable" on signup, this page is
> the fix.** It means the running app found no database. Jump to
> [Step 2](#step-2-add-postgres-required) — and check `/api/health` first, which
> tells you exactly what the server can see.

---

## Step 0 — check what's actually wrong

Open `https://<your-domain>/api/health` in a browser. It answers the only
question that matters, and exposes no passwords.

Database missing:

```json
{ "ok": false, "accounts": "disabled", "db": { "configured": false } }
```

Database working:

```json
{ "ok": true, "accounts": "enabled", "db": { "host": "…" }, "users": 12 }
```

If `configured` is `false`, do Step 2. If it's `true` but `ok` is `false`, the
URL is set but unreachable — check the Postgres service is running and that you
used the **private** URL, not a public one behind a firewall.

---

## Step 1 — create the Railway project

1. Go to **https://railway.com** → **New Project** → **Deploy from GitHub repo**.
2. Choose **`aividhyarthi/blog-topics-ideation`**.
3. Pick the branch you want live (currently **`aeo-checker`**).
4. Leave **Root Directory** blank. Railway auto-detects the `Dockerfile`.

---

## Step 2 — add Postgres (REQUIRED)

Without this, nobody can sign up, log in, buy credits, or run a single check.
The app deliberately **locks itself** rather than running unmetered.

1. In your project, click **New** → **Database** → **Add PostgreSQL**.
2. Wait for the Postgres service to finish provisioning.
3. **Link it to the app** — this is the step everyone misses. Adding Postgres to
   the project does **not** give your app the connection string automatically.

   Open your **app service** (not the database) → **Variables** →
   **New Variable** → **Add Reference** → select the **Postgres** service →
   choose **`DATABASE_URL`** → **Add**.

4. Redeploy the app service.
5. Reload `/api/health`. It should now say `"accounts": "enabled"`.

The database schema creates itself on first boot — there is no migration step.

> The app also accepts `POSTGRES_URL`, `DATABASE_PRIVATE_URL`,
> `DATABASE_PUBLIC_URL`, `PG_URL`, or the discrete `PGHOST` / `PGUSER` /
> `PGPASSWORD` / `PGDATABASE` / `PGPORT` set. Any one of them works.

---

## Step 3 — the other variables

Open the **app service** → **Variables**:

| Variable | Required? | What it does |
|---|---|---|
| `DATABASE_URL` | **Yes** | Accounts, credits, payments, saved audits. See Step 2. |
| `ADMIN_EMAIL` | **Yes, to get paid** | The account allowed to open `/admin/payments` and approve UPI payments. Set it to your own signup email. |
| `SESSION_SECRET` | Recommended | Signs session cookies. Any long random string. |
| `RESEND_API_KEY` + `MAIL_FROM` | **Yes, in practice** | Sends password-reset email. Without both, a customer who forgets their password cannot recover the account themselves and the reset form says so honestly. Get a key at resend.com; `MAIL_FROM` must be an address on a domain you've verified there. |
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

1. `/api/health` → `"accounts": "enabled"`.
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

## Redeploys

Railway watches the branch you selected and redeploys on every push. Postgres
data survives redeploys — it lives in the database service, not the container.

## Common questions

- **"Accounts are temporarily unavailable."** No database. Step 2.
- **A URL won't check ("bot-blocked / JS-rendered").** Some sites refuse
  crawlers. Use the **Paste** tab instead. A failed fetch is refunded — it does
  not consume the customer's check.
- **Can I let people try it without an account?** Not currently, by design. Every
  check costs real bandwidth and AI tokens, so all of them are metered.
