# Deploying to Railway (plain-English guide)

This repo contains **one app with three tools**:

- `/` — the **Blog Topic Engine**
- `/audit` — the **AEO Auditor**
- `/wbr` — the **WBR Builder** (weekly AI-visibility report from SEMrush CSVs)

You do **not** need a separate codebase for the Auditor. If you want it to run
on its **own Railway project** (separate from your other deployments, so nothing
can conflict), just create a new Railway project that points at this repo. Both
tools will be live on that one project's URL.

---

## Create a new, isolated Railway project (≈5 clicks)

> You only need to do this once. Everything you click is in the Railway website.

1. Go to **https://railway.com** and log in.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Choose the repo **`aividhyarthi/blog-topics-ideation`**.
   (If Railway asks for permission to see your GitHub repos, approve it.)
4. When it asks which branch to deploy, pick the **default branch** (the one
   this change was merged into). To test *before* merging, pick the feature
   branch instead.
5. Open the new service → **Settings**:
   - **Root Directory**: leave it as `/` (blank/root). All the app files live at
     the top of the repo.
   - Railway auto-detects the included `Dockerfile` — you don't change anything.
6. Open the service → **Variables** → **New Variable**. Add these:
   - `SITE_PASSWORD` → a password of your choice. **This locks the whole site**
     so only people with the password can open it. **Add this** — the WBR data
     is Nykaa-internal. (Optional companion: `SITE_USER`, defaults to `nykaa`.)
   - `ANTHROPIC_API_KEY` → your Anthropic key (`sk-ant-...`). Needed for the
     AEO Auditor's AI signals and the WBR's optional Claude fallback.
   - `WBR_DATA_DIR` → `/data`. This is where the WBR remembers each week so it can
     show week-over-week change. Pair it with a Volume (next step) so it survives
     redeploys.
   - **Do NOT add a `PORT` variable** — Railway sets that automatically.
7. **Add a Volume for the weekly history** (so saved weeks aren't lost on redeploy):
   open the service → **Variables/Settings → Volumes → New Volume**, and set the
   **mount path** to `/data` (matching `WBR_DATA_DIR`). One-time setup.
8. Railway builds and deploys. When it's done, open **Settings → Networking →
   Generate Domain** to get a public URL.

That's it. Visit (you'll be asked for the password once):

- `https://<your-domain>/` for the Topic Engine
- `https://<your-domain>/audit` for the AEO Auditor
- `https://<your-domain>/wbr` for the WBR Builder

---

## After the first setup

Railway watches the branch you picked. Every time new code lands on that branch,
Railway **redeploys automatically** — you don't have to do anything.

## Keeping the data private (important for Nykaa)

- **The site is password-locked** when `SITE_PASSWORD` is set — every page and the
  upload endpoint require it. Always set it on Railway.
- **Only weekly summaries are stored, behind the password.** To show week-over-week
  change, the tool saves a small JSON summary per week (headline numbers, per-topic
  visibility/mentions) in the `WBR_DATA_DIR` Volume. The raw uploaded CSV files are
  **not** kept — they're processed in memory and discarded. You can delete any saved
  week from the **View saved weeks** panel. Untick **Save to history** to generate a
  report without storing anything.
- **Railway gives you HTTPS** automatically, so uploads are encrypted in transit.
- **Claude fallback:** only if you tick that box, the *topic names* the rules
  couldn't categorize are sent to Anthropic's API to be classified (Anthropic does
  not train on API data). Leave it **off** if you'd rather nothing leaves the box —
  the rules alone produce the full report.

## Common questions

- **Do I need the API key?** The Auditor's AI-judged signals (answer quality,
  off-page brand estimate, etc.) need `ANTHROPIC_API_KEY`. Without it the page
  still loads and the rule-based signals still score; the AI ones default to 50.
- **A URL won't audit ("bot-blocked / JS-rendered").** Some sites block crawlers.
  Use the **"Paste article"** tab and paste the article's HTML or text instead.
- **Will this touch my other Railway project?** No — a new Railway project is
  fully isolated. It has its own URL, build, and variables.
