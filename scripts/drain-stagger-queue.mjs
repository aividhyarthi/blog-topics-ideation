#!/usr/bin/env node
// Drains publish-queue/pending.txt: each line is a commit already sitting in
// this branch's own history, waiting for its scheduled time, which just
// needs pushing to the live deploy branch at the right moment. Runs on a
// GitHub Actions cron (see the workflow file on the repo's default branch),
// so the actual "wait until time X" step lives on GitHub's own
// infrastructure instead of depending on any Claude session being awake and
// its tool calls succeeding.
//
// Line format: "<sha> <iso8601-publish-at> <target-branch>"
// A due line (publish-at has passed) gets pushed with
// `git push origin <sha>:<target-branch>` and removed from pending.txt.
// A line whose time hasn't come yet is left alone for the next run.
//
// Queued commits are each built independently off an older base, not
// chained on top of each other, so a plain `git push <sha>:<branch>` only
// ever works for the first one due in a run - every later one is rejected
// as non-fast-forward because the target branch has already moved past
// their shared base (seen in practice: 2 due posts stuck for hours this
// way). When that happens, fall back to cherry-picking the commit onto
// whatever the target branch's tip actually is right now, in a scratch
// worktree, and push that instead - this preserves each post's content
// and due-order without disturbing this script's own checkout.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pendingPath = path.join(root, 'publish-queue', 'pending.txt');

function pushByCherryPick(sha, targetBranch) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'drain-cherry-'));
  try {
    execSync(`git fetch origin ${targetBranch}`, { cwd: root, stdio: 'inherit' });
    execSync(`git worktree add --detach "${wt}" origin/${targetBranch}`, { cwd: root, stdio: 'inherit' });
    execSync(`git cherry-pick ${sha}`, { cwd: wt, stdio: 'inherit' });
    execSync(`git push origin HEAD:${targetBranch}`, { cwd: wt, stdio: 'inherit' });
  } finally {
    execSync(`git worktree remove --force "${wt}"`, { cwd: root, stdio: 'inherit' });
  }
}

fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
if (!fs.existsSync(pendingPath)) fs.writeFileSync(pendingPath, '');

const lines = fs.readFileSync(pendingPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
if (!lines.length) {
  console.log('Queue is empty — nothing due.');
  process.exit(0);
}

const now = Date.now();
const remaining = [];
let pushedAny = false;

for (const line of lines) {
  const [sha, publishAt, targetBranch] = line.split(/\s+/);
  if (!sha || !publishAt || !targetBranch) {
    console.error(`Malformed line, dropping: "${line}"`);
    continue;
  }
  const dueTime = Date.parse(publishAt);
  if (Number.isNaN(dueTime)) {
    console.error(`Unparseable publish-at "${publishAt}" on line "${line}", keeping for manual review.`);
    remaining.push(line);
    continue;
  }
  if (dueTime > now) {
    console.log(`${sha} not due yet (publishes ${publishAt}).`);
    remaining.push(line);
    continue;
  }
  try {
    execSync(`git push origin ${sha}:${targetBranch}`, { cwd: root, stdio: 'inherit' });
    console.log(`${sha}: pushed to ${targetBranch} (was due ${publishAt}).`);
    pushedAny = true;
    continue;
  } catch (directPushErr) {
    console.log(`${sha}: direct push to ${targetBranch} was rejected (likely non-fast-forward); retrying by cherry-pick onto the branch's current tip.`);
  }
  try {
    pushByCherryPick(sha, targetBranch);
    console.log(`${sha}: cherry-picked onto ${targetBranch} and pushed (was due ${publishAt}).`);
    pushedAny = true;
  } catch (err) {
    console.error(`${sha}: push failed (direct and cherry-pick), keeping in queue for retry — ${err.message}`);
    remaining.push(line);
  }
}

fs.writeFileSync(pendingPath, remaining.length ? remaining.join('\n') + '\n' : '');
console.log(`Done. ${lines.length - remaining.length} pushed, ${remaining.length} still queued.`);
if (!pushedAny) process.exit(0);
