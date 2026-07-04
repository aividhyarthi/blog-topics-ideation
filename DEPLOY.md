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
   - `RANK_DATA_DIR` → `/data`. This is where the Rank Tracker's **Saved
     Trackers** keep their config + daily rank history. Same Volume as
     `WBR_DATA_DIR` works fine (they write to different subfolders) — just
     point both at the same mount path.
   - **Do NOT add a `PORT` variable** — Railway sets that automatically.
7. **Add a Volume** (so saved weeks and saved trackers aren't lost on redeploy):
   open the service → **Variables/Settings → Volumes → New Volume**, and set the
   **mount path** to `/data` (matching `WBR_DATA_DIR` and `RANK_DATA_DIR`). One-time setup.
8. Railway builds and deploys. When it's done, open **Settings → Networking →
   Generate Domain** to get a public URL.

That's it. Visit (you'll be asked for the password once):

- `https://<your-domain>/` for the Topic Engine
- `https://<your-domain>/audit` for the AEO Auditor
- `https://<your-domain>/wbr` for the WBR Builder

---

## Connecting the Rank Tracker to Google Sheets (optional)

The **Rank Tracker** (`/rank`) can read keywords straight from a Google Sheet
and write the results back into it as new dated columns, instead of you
pasting keywords by hand. This needs a **Google service account** — a
headless robot identity, not your personal Google login — because the server
has no browser to show you a Google sign-in screen.

1. In **Google Cloud Console**, create (or reuse) a project, then enable the
   **Google Sheets API** for it (APIs & Services → Library → search "Google
   Sheets API" → Enable).
2. **IAM & Admin → Service Accounts → Create Service Account.** Any name is
   fine (e.g. `rank-tracker`). No project roles are needed — access is
   granted per-sheet in step 4, not at the project level.
3. Open the new service account → **Keys → Add Key → Create new key → JSON**.
   This downloads a `.json` file — treat it like a password.
4. **Share every Google Sheet you want the tracker to read/write** with the
   service account's email (it looks like
   `rank-tracker@your-project.iam.gserviceaccount.com`, shown on the service
   account's page) — same as sharing a sheet with a coworker. Give it
   **Editor** access since it writes rank columns back.
5. Back in **Railway → your service → Variables**, add:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` → paste the **entire contents** of the
     downloaded JSON file as one variable. (Alternatively, set
     `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
     separately if you'd rather not paste a JSON blob.)
6. Redeploy. Open `/rank` — the "From Google Sheet" tab shows a green
   "✓ Sheets connected" badge once the variable is picked up.

Without this variable, `/rank` still works fully in **paste-keywords mode** —
the Sheets connection is optional, only needed for the "From Google Sheet" tab.

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
