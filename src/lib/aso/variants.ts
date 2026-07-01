// Custom / localized store-listing detector. Given one app's listing fetched
// across several markets, diff each market against a baseline to reveal whether
// the developer serves market-specific (custom) store listings.
import type { MarketListing } from './fetch';

const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

export interface VariantDiff {
  country: string; lang: string; ok: boolean; isBaseline: boolean;
  titleChanged: boolean; shortChanged: boolean; longChanged: boolean; shotsChanged: boolean;
  title: string; summary: string; screenshots: number; error?: string;
}
export interface AppVariants {
  appId: string;
  title: string;
  baseline: { country: string; lang: string } | null;
  markets: VariantDiff[];
  hasVariants: boolean; // any non-baseline market differs in title/short/long/shots
}

export function diffVariants(appId: string, listings: MarketListing[]): AppVariants {
  const base = listings.find((l) => l.ok) || listings[0] || null;
  const baseTitle = base ? norm(base.title) : '';
  const baseShort = base ? norm(base.summary) : '';
  const baseLong = base ? norm(base.description) : '';
  const baseShots = base ? base.screenshots : 0;

  const markets: VariantDiff[] = listings.map((l) => {
    const isBaseline = !!base && l.country === base.country && l.lang === base.lang;
    const comparable = l.ok && !!base && base.ok && !isBaseline;
    return {
      country: l.country, lang: l.lang, ok: l.ok, isBaseline,
      titleChanged: comparable && norm(l.title) !== baseTitle,
      shortChanged: comparable && norm(l.summary) !== baseShort,
      longChanged: comparable && norm(l.description) !== baseLong,
      shotsChanged: comparable && l.screenshots !== baseShots,
      title: l.title, summary: l.summary, screenshots: l.screenshots, error: l.error,
    };
  });

  const hasVariants = markets.some((m) => !m.isBaseline && (m.titleChanged || m.shortChanged || m.longChanged || m.shotsChanged));
  return {
    appId,
    title: base ? base.title : appId,
    baseline: base ? { country: base.country, lang: base.lang } : null,
    markets,
    hasVariants,
  };
}
