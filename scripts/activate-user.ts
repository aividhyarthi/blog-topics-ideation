// Manual billing activation — billing is UPI/WhatsApp, not a payment
// gateway (see src/lib/saas/plans.ts), so there is no webhook to flip a
// user's status automatically. Run this after you see their payment:
//
//   npx tsx scripts/activate-user.ts user@example.com pro       # activate
//   npx tsx scripts/activate-user.ts user@example.com starter   # activate on a different plan
//   npx tsx scripts/activate-user.ts user@example.com cancel    # cancel
//
// Needs the same RANK_DATA_DIR the live app uses (so it edits the real DB,
// not a fresh empty one) — e.g. on Railway, run it in a shell attached to
// the running service, or set RANK_DATA_DIR to the mounted Volume path.
import { findUserByEmail, updateUserBilling } from '../src/lib/saas/db';
import type { PlanId } from '../src/lib/saas/plans';

const [, , email, arg] = process.argv;
if (!email || !arg) {
  console.error('Usage: npx tsx scripts/activate-user.ts <email> <starter|pro|cancel>');
  process.exit(1);
}

const user = findUserByEmail(email);
if (!user) {
  console.error(`No user found with email "${email}".`);
  process.exit(1);
}

if (arg === 'cancel') {
  updateUserBilling(user.id, { status: 'canceled' });
  console.log(`${email} → canceled.`);
} else if (arg === 'starter' || arg === 'pro') {
  updateUserBilling(user.id, { status: 'active', plan: arg as PlanId });
  console.log(`${email} → active on the ${arg} plan.`);
} else {
  console.error(`Unknown argument "${arg}" — expected "starter", "pro", or "cancel".`);
  process.exit(1);
}
