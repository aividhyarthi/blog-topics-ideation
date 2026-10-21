// Converts a post's raw markdown body into the plain text schema.org's
// BlogPosting.articleBody expects — the full copy, not just the frontmatter
// description, but with markdown syntax (headers, bold, links, tables,
// blockquotes, list markers) stripped rather than leaked into the JSON-LD
// as literal asterisks and pipes.
export function markdownToPlainText(markdown: string): string {
  return markdown
    // Fenced code blocks first, so nothing inside them gets mangled by the
    // rules below.
    .replace(/```[\s\S]*?```/g, ' ')
    // Headers: "## Heading" -> "Heading"
    .replace(/^#{1,6}\s+/gm, '')
    // Blockquote markers: "> text" -> "text" (the bold-strip rule below
    // still handles "> **Real-world scenario:** ...")
    .replace(/^>\s?/gm, '')
    // List markers: "- item" / "1. item" -> "item"
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Table rows: "| a | b |" -> "a. b." — and drop the header-separator
    // row ("|---|---|") entirely rather than turning it into noise.
    .replace(/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/gm, '')
    .replace(/^\|(.+)\|$/gm, (_m, row) =>
      row.split('|').map((cell: string) => cell.trim()).filter(Boolean).join('. ') + '.')
    // Links/images: "[text](url)" -> "text", "![alt](url)" -> "alt"
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Bold/italic: **text**, __text__, *text*, _text_ -> text
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    // Inline code: `text` -> text
    .replace(/`([^`]*)`/g, '$1')
    // Collapse blank-line-separated blocks into single spaces, then
    // collapse any remaining run of whitespace.
    .split(/\n\s*\n/).map((block) => block.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ')
    .trim();
}
