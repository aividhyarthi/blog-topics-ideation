// Read-only app sharing ("give my client a login that only shows their app").
//
// The tracker is otherwise strictly one-workspace-per-user: all rank data
// lives under RANK_DATA_DIR/users/<userId>/ and nothing crosses that line. A
// grant is the single exception — it lets a GUEST account read a specific
// slice of an OWNER's workspace, and only read it.
//
// One rule keeps the model unambiguous, enforced when a grant is created
// (see assertCanGrant) rather than papered over at read time: a guest may
// hold grants from exactly ONE owner, so "whose workspace am I looking at?"
// always has a single answer.
//
// An account CAN have both its own apps and apps shared with it. Those are
// two separate workspaces and the session views one at a time, chosen by
// `mode` (the UI shows a switcher). Write permission is therefore a property
// of the workspace being viewed, never of the account.
import { listGrantsForEmail, listGrantsByOwner, findUserById, findUserByEmail } from './db';
import { loadConfig } from '../rank/store';
import type { TrackedApp } from '../rank/types';

export type WorkspaceMode = 'own' | 'shared';

export interface Workspace {
  /** Whose data directory to read. For an owner this is their own id. */
  ownerId: string;
  /** Restrict the workspace to these app keys; null = the whole workspace. */
  appKeys: string[] | null;
  /** Guests can read, never write. */
  readOnly: boolean;
  /** Owner's email, shown to the guest so they know whose data this is. */
  sharedByEmail: string | null;
  /** Which of the two workspaces this is. */
  mode: WorkspaceMode;
  /** True when the account has both, so the UI should offer a switcher. */
  canSwitch: boolean;
  /** Whose grants scoped this workspace; null when viewing your own. */
  granteeEmail: string | null;
}

function ownsApps(userId: string): boolean {
  try { return loadConfig(userId).apps.length > 0; } catch { return false; }
}

/**
 * Which workspace this logged-in user sees. `mode` picks between their own
 * apps and apps shared with them; an unavailable or missing mode falls back
 * to their own workspace whenever they have one, so a share can never
 * silently replace an existing customer's dashboard.
 */
export function resolveWorkspace(user: { id: string; email: string }, mode?: WorkspaceMode): Workspace {
  const grants = listGrantsForEmail(user.email);
  const own = (canSwitch: boolean): Workspace =>
    ({ ownerId: user.id, appKeys: null, readOnly: false, sharedByEmail: null, mode: 'own', canSwitch, granteeEmail: null });
  if (!grants.length) return own(false);

  // Rule above means every grant shares one owner; take it from the first.
  const ownerId = grants[0].ownerId;
  const hasOwn = ownsApps(user.id);
  if (hasOwn && mode !== 'shared') return own(true);

  const owner = findUserById(ownerId);
  return {
    ownerId,
    appKeys: grants.filter((g) => g.ownerId === ownerId).map((g) => g.appKey),
    readOnly: true,
    sharedByEmail: owner ? owner.email : null,
    mode: 'shared',
    canSwitch: hasOwn,
    granteeEmail: user.email.toLowerCase(),
  };
}

/**
 * True when this session is CURRENTLY viewing a shared workspace. Depends on
 * the active mode, not just on holding grants — an account with its own apps
 * is a full owner while viewing its own workspace, and only read-only after
 * switching to the shared one.
 */
export function isGuest(user: { id: string; email: string } | null | undefined, mode?: WorkspaceMode): boolean {
  return !!user && resolveWorkspace(user, mode).readOnly;
}

/**
 * Whose billing status decides whether this session may open the paid tools.
 * A guest is riding on the owner's subscription — they never bought
 * anything, so gating them on their own (long-expired) trial would lock a
 * client out of a dashboard the owner is actively paying for.
 */
export function billingUserFor<T extends { id: string; email: string; status: string; trialEndsAt: string | null }>(user: T, mode?: WorkspaceMode): T {
  const ws = resolveWorkspace(user, mode);
  if (ws.ownerId === user.id) return user; // viewing their own workspace
  return (findUserById(ws.ownerId) as unknown as T) || user;
}

/**
 * A granted app is useless in the Compare tab without the competitors it is
 * compared against, so those come along with it. Only apps explicitly marked
 * `competitorOf: <granted key>` are pulled in — never another primary app,
 * which is what keeps one client's dashboard out of another client's view.
 */
export function expandWithCompetitors(apps: TrackedApp[], appKeys: string[], sharedWithOthers: string[] = []): string[] {
  const granted = new Set(appKeys);
  // An app the owner has shared with someone ELSE is a client's app in its
  // own right, not merely a rival to compare against. Marking one client's
  // app as a competitor of another's must never hand the second client a
  // view of the first — so those are excluded from the implicit pull-in and
  // only ever appear when granted explicitly.
  const protectedKeys = new Set(sharedWithOthers.filter((k) => !granted.has(k)));
  for (const app of apps) {
    if (app.competitorOf && granted.has(app.competitorOf) && !protectedKeys.has(app.key)) granted.add(app.key);
  }
  return [...granted];
}

/**
 * Apply a workspace's app filter to a tracked-app list. Needs the owner's
 * full grant table (not just this guest's) to know which apps belong to
 * another client — see expandWithCompetitors.
 */
export function visibleApps(apps: TrackedApp[], ws: Workspace): TrackedApp[] {
  if (!ws.appKeys) return apps;
  const sharedWithOthers = ws.granteeEmail
    ? listGrantsByOwner(ws.ownerId).filter((g) => g.granteeEmail !== ws.granteeEmail).map((g) => g.appKey)
    : [];
  const allowed = new Set(expandWithCompetitors(apps, ws.appKeys, sharedWithOthers));
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

  // An account that tracks its own apps is fine to share with — it keeps its
  // own workspace and gets a switcher for the shared one (see
  // resolveWorkspace), so nothing of theirs is hidden.
  const grantee = findUserByEmail(email);
  if (grantee && grantee.id === ownerId) return 'That\'s your own account — you already have full access.';
  return null;
}
