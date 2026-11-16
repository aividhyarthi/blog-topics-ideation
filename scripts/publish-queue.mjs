#!/usr/bin/env node
// Drains blog-queue/pending/*.json into the live site, one real POST per
// file, each a fully-written post with its own future publishDate. Scheduled
// visibility is handled entirely server-side already (listPublishedPosts()
// hides anything whose publish_date hasn't arrived) — this script's only
// job is to make sure each post EXISTS in the live DB before that date, not
// to time anything itself. Runs on a plain cron in .github/workflows/
// publish-blog-queue.yml, which has real internet access (unlike a sandboxed
// dev session), so it can reach the live site directly.
//
// No Anthropic/OpenAI call happens here or on the live site at publish
// time — every post in the queue is already fully written. That's the
// actual fix for the two earlier automation attempts, which both called an
// AI model live, at publish time, and broke when that key ran out of
// credit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pendingDir = path.join(root, 'blog-queue', 'pending');
const sentDir = path.join(root, 'blog-queue', 'sent');

const siteUrl = (process.env.BLOG_SITE_URL || '').replace(/\/+$/, '');
const token = process.env.BLOG_PUBLISH_TOKEN || '';
if (!siteUrl || !token) {
  console.error('BLOG_SITE_URL and BLOG_PUBLISH_TOKEN must both be set.');
  process.exit(1);
}

fs.mkdirSync(pendingDir, { recursive: true });
fs.mkdirSync(sentDir, { recursive: true });

const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json')).sort();
if (!files.length) {
  console.log('Queue is empty — nothing to publish.');
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const full = path.join(pendingDir, file);
  let post;
  try {
    post = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`${file}: invalid JSON, skipping — ${err.message}`);
    failed++;
    continue;
  }
  try {
    const res = await fetch(`${siteUrl}/api/admin/publish-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(post),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`${file}: ${res.status} ${data.error || 'failed'}`);
      failed++;
      continue;
    }
    fs.renameSync(full, path.join(sentDir, file));
    console.log(`${file}: published as ${data.slug} (goes live ${post.publishDate || 'now'})`);
  } catch (err) {
    console.error(`${file}: network error — ${err.message}`);
    failed++;
  }
}

console.log(`Done. ${files.length - failed} sent, ${failed} failed.`);
if (failed) process.exit(1);
