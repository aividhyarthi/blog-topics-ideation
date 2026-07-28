// Read-only app sharing ("give my client a login that only shows their app").
//
// The tracker is otherwise strictly one-workspace-per-user: all rank data
// lives under RANK_DATA_DIR/users/<userId>/ and nothing crosses that line. A
// grant is the single exception — it lets a GUEST account read a specific
// slice of an OWNER's workspace, and only read it.
//
// Two rules keep the model unambiguous, both enforced when a grant is
// created (see assertCanGrant) rather than papered over at read time:
//   1. A guest may hold grants from exactly ONE owner. Otherwise "whose
//      workspace am I looking at?" has no single answer, and the dashboard
//      would need a workspace switcher to be honest about it.
//   2. A guest may not own tracked apps. If an account with its own apps
//      were granted access, resolveWorkspace would have to choose between
//      showing its own data and the shared data, and either choice silently
//      hides something the user expects to see.
import { listGrantsForEmail, findUserById, findUserByEmail } from './db';
import { loadConfig } from '../rank/store';
import type { TrackedApp } from '../rank/types';

export interface Workspace {
  /** Whose data directory to read. For an owner this is their own id. */
  ownerId: string;
  /** Restrict the workspace to these app keys; null = the whole workspace. */
  appKeys: string[] | null;
  /** Guests can read, never write. */
  readOnly: boolean;
  /** Owner's email, shown to the guest so they know whose data this is. */
  sharedByEmail: string | null;
}

/**
 * Which workspace this logged-in user actually sees. An account with no
 * grants is always its own owner — sharing never changes what an existing
 * customer sees on their own dashboard.
 */
export function resolveWorkspace(user: { id: string; email: string }): Workspace {
  const grants = listGrantsForEmail(user.email);
  if (!grants.length) {
    return { ownerId: user.id, appKeys: null, readOnly: false, sharedByEmail: null };
  }
  // Rule 1 above means every grant shares one owner; take it from the first.
  const ownerId = grants[0].ownerId;
  const owner = findUserById(ownerId);
  return {
    ownerId,
    appKeys: grants.filter((g) => g.ownerId === ownerId).map((g) => g.appKey),
    readOnly: true,
    sharedByEmail: owner ? owner.email : null,
  };
}

/** True when this account is a guest (reads someone else's workspace). */
export function isGuest(user: { id: string; email: string } | null | undefined): boolean {
  return !!user && listGrantsForEmail(user.email).length > 0;
}

/**
 * Whose billing status decides whether this session may open the paid tools.
 * A guest is riding on the owner's subscription — they never bought
 * anything, so gating them on their own (long-expired) trial would lock a
 * client out of a dashboard the owner is actively paying for.
 */
export function billingUserFor<T extends { id: string; email: string; status: string; trialEndsAt: string | null }>(user: T): T {
  const grants = listGrantsForEmail(user.email);
  if (!grants.length) return user;
  const owner = findUserById(grants[0].ownerId);
  return (owner as unknown as T) || user;
}

/**
 * A granted app is useless in the Compare tab without the competitors it is
 * compared against, so those come along with it. Only apps explicitly marked
 * `competitorOf: <granted key>` are pulled in — never another primary app,
 * which is what keeps one client's dashboard out of another client's view.
 */
export function expandWithCompetitors(apps: TrackedApp[], appKeys: string[]): string[] {
  const granted = new Set(appKeys);
  for (const app of apps) {
    if (app.competitorOf && granted.has(app.competitorOf)) granted.add(app.key);
  }
  return [...granted];
}

/** Apply a workspace's app filter to a tracked-app list. */
export function visibleApps(apps: TrackedApp[], ws: Workspace): TrackedApp[] {
  if (!ws.appKeys) return apps;
  const allowed = new Set(expandWithCompetitors(apps, ws.appKeys));
  return apps.filter((a) => allowed.has(a.key));
}

/**
 * Validates a new grant, returning an error string the API can surface
 * verbatim. Returns null when the grant is allowed.
 */
export function assertCanGrant(ownerId: string, ownerEmail: string, granteeEmail: string): string | null {
  const email = granteeEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That doesn\'t look like a valid email address.';
  if (email === ownerEmail.toLowerCase()) return 'That\'s your own account — you already have full access.';

  // Rule 1: no split-brain workspace.
  const existing = listGrantsForEmail(email);
  const otherOwner = existing.find((g) => g.ownerId !== ownerId);
  if (otherOwner) return 'That email already has shared access from another account, and an account can only be a guest of one workspace.';

  // Rule 2: never hide an existing customer's own apps behind a share.
  const grantee = findUserByEmail(email);
  if (grantee) {
    if (grantee.id === ownerId) return 'That\'s your own account — you already have full access.';
    let ownsApps = false;
    try { ownsApps = loadConfig(grantee.id).apps.length > 0; } catch { ownsApps = false; }
    if (ownsApps) return 'That account already tracks its own apps, so it can\'t also be a read-only guest. Use a separate email for shared access.';
  }
  return null;
}
