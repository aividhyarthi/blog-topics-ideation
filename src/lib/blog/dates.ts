// Blog posts are dated in frontmatter as a plain "YYYY-MM-DD" (e.g.
// publishDate: 2026-10-20), which Astro's content-collection schema parses
// as UTC midnight of that date. Calling .toISOString() on that Date is
// technically correct but mislabels an IST-business date as UTC — AppRankr
// publishes on IST time, so a schema/meta timestamp claiming "Z" (UTC)
// reports the wrong clock time to anything that reads it, even though the
// calendar date itself is right.
//
// This re-labels the same Y-M-D as IST midnight (+05:30) instead of
// reinterpreting or shifting it — the date a post was written in frontmatter
// is the IST date the author meant, so the fix is the offset, not the
// calendar math.
export function toISTISOString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00:00+05:30`;
}
