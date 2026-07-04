/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Set in product mode (AppRankr) by the middleware. */
    productMode?: boolean;
    user?: import('./lib/saas/db').User | null;
    access?: import('./lib/saas/plans').AccessCheck;
  }
}
