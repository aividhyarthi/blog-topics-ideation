/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Set in product mode (AppRankr) by the middleware. */
    productMode?: boolean;
    user?: import('./lib/saas/db').User | null;
    access?: import('./lib/saas/plans').AccessCheck;
    /** Which workspace this request is viewing when the account has both its
     * own apps and apps shared with it — see lib/saas/grants.ts. */
    wsMode?: import('./lib/saas/grants').WorkspaceMode;
  }
}
