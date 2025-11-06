/**
 * Wiki link parsing and tag generation utilities
 * Supports [[term]], [[w:term]], and [[d:term]] syntax
 */

export interface WikiLink {
  fullMatch: string;
  type: 'w' | 'd' | 'auto'; // auto means [[term]] without explicit prefix
  term: string;
  displayText: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Extracts all wiki links from AsciiDoc content.
 * Supports three formats:
 * - [[term]] - Auto (will query both w and d tags)
 * - [[w:term]] - Explicit reference/mention (backward link)
 * - [[d:term]] - Explicit definition (forward link)
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const wikiLinks: WikiLink[] = [];

  // Match [[prefix:term]] or [[term]]
  // Captures: optional prefix (w: or d:), term, optional display text after |
  const regex = /\[\[(?:(w|d):)?([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const prefix = match[1]; // 'w', 'd', or undefined
    const term = match[2].trim();
    const customDisplay = match[3]?.trim();

    wikiLinks.push({
      fullMatch: match[0],
      type: prefix ? (prefix as 'w' | 'd') : 'auto',
      term,
      displayText: customDisplay || term,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return wikiLinks;
}

/**
 * Converts a term to a clean tag format (lowercase, hyphenated).
 * Example: "Knowledge Graphs" -> "knowledge-graphs"
 */
export function termToTag(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Generates Nostr event tags from wiki links.
 * Format: ['w', 'tag-slug', 'Display Text'] or ['d', 'tag-slug']
 */
export function wikiLinksToTags(wikiLinks: WikiLink[]): string[][] {
  const tags: string[][] = [];

  for (const link of wikiLinks) {
    const tagSlug = termToTag(link.term);

    if (link.type === 'w' || link.type === 'auto') {
      // Reference tag includes display text
      tags.push(['w', tagSlug, link.displayText]);
    }

    if (link.type === 'd') {
      // Definition tag (no display text, it IS the thing)
      tags.push(['d', tagSlug]);
    }
  }

  return tags;
}

/**
 * Replaces wiki link syntax with HTML for preview rendering.
 * Can be customized for different rendering styles.
 */
export function renderWikiLinksToHtml(
  content: string,
  options: {
    linkClass?: string;
    wLinkClass?: string;
    dLinkClass?: string;
    onClickHandler?: (type: 'w' | 'd' | 'auto', term: string) => string;
  } = {},
): string {
  const {
    linkClass = 'wiki-link',
    wLinkClass = 'wiki-link-reference',
    dLinkClass = 'wiki-link-definition',
    onClickHandler,
  } = options;

  return content.replace(
    /\[\[(?:(w|d):)?([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (match, prefix, term, customDisplay) => {
      const displayText = customDisplay?.trim() || term.trim();
      const type = prefix ? prefix : 'auto';
      const tagSlug = termToTag(term);

      // Determine CSS classes
      let classes = linkClass;
      if (type === 'w') classes += ` ${wLinkClass}`;
      else if (type === 'd') classes += ` ${dLinkClass}`;

      // Generate href or onclick
      const action = onClickHandler
        ? `onclick="${onClickHandler(type, tagSlug)}"`
        : `href="#wiki/${type}/${encodeURIComponent(tagSlug)}"`;

      // Add title attribute showing the type
      const title =
        type === 'w'
          ? 'Wiki reference (mentions this concept)'
          : type === 'd'
            ? 'Wiki definition (defines this concept)'
            : 'Wiki link (searches both references and definitions)';

      return `<a class="${classes}" ${action} title="${title}" data-wiki-type="${type}" data-wiki-term="${tagSlug}">${displayText}</a>`;
    },
  );
}

/**
 * Converts wiki links to plain text (for content storage).
 * Preserves the display text if custom, otherwise uses the term.
 */
export function wikiLinksToPlainText(content: string): string {
  return content.replace(
    /\[\[(?:w|d:)?([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (match, term, customDisplay) => {
      return customDisplay?.trim() || term.trim();
    },
  );
}
