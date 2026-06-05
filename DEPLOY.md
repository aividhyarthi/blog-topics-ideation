# Deploying to Railway (plain-English guide)

This repo contains **one app with two tools**:

- `/` — the **Blog Topic Engine**
- `/audit` — the **AEO Auditor**

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
6. Open the service → **Variables** → **New Variable**:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic key (`sk-ant-...`)
   - **Do NOT add a `PORT` variable** — Railway sets that automatically.
7. Railway builds and deploys. When it's done, open **Settings → Networking →
   Generate Domain** to get a public URL.

That's it. Visit:

- `https://<your-domain>/` for the Topic Engine
- `https://<your-domain>/audit` for the AEO Auditor

---

## After the first setup

Railway watches the branch you picked. Every time new code lands on that branch,
Railway **redeploys automatically** — you don't have to do anything.

## Common questions

- **Do I need the API key?** The Auditor's AI-judged signals (answer quality,
  off-page brand estimate, etc.) need `ANTHROPIC_API_KEY`. Without it the page
  still loads and the rule-based signals still score; the AI ones default to 50.
- **A URL won't audit ("bot-blocked / JS-rendered").** Some sites block crawlers.
  Use the **"Paste article"** tab and paste the article's HTML or text instead.
- **Will this touch my other Railway project?** No — a new Railway project is
  fully isolated. It has its own URL, build, and variables.
