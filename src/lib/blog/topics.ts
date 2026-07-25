// Shared topic <-> slug mapping for the blog's sub-navigation.
//
// Themes are free text in each post's frontmatter, so the slug has to be
// derived rather than hand-maintained, or a new theme silently gets no page.
export const topicSlug = (theme: string): string =>
  theme.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
