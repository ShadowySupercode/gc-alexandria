import { processNostrIdentifiers } from "../nostrUtils";

/**
 * Normalizes a string for use as a d-tag by converting to lowercase,
 * replacing non-alphanumeric characters with dashes, and removing
 * leading/trailing dashes.
 */
function normalizeDTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Replaces wikilinks in the format [[target]] or [[target|display]] with
 * clickable links to the events page.
 */
function replaceWikilinks(html: string): string {
  // [[target page]] or [[target page|display text]]
  return html.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target, label) => {
      const normalized = normalizeDTag(target.trim());
      const display = (label || target).trim();
      const url = `/events?d=${normalized}`;
      // Output as a clickable <a> with the [[display]] format and matching link colors
      // Use onclick to bypass SvelteKit routing and navigate directly
      return `<a class="wikilink text-primary-600 dark:text-primary-500 hover:underline" data-dtag="${normalized}" data-url="${url}" href="${url}" onclick="window.location.href='${url}'; return false;">${display}</a>`;
    },
  );
}

/**
 * Replaces AsciiDoctor-generated empty anchor tags <a id="..."></a> with clickable wikilink-style <a> tags.
 */
function replaceAsciiDocAnchors(html: string): string {
  return html.replace(/<a id="([^"]+)"><\/a>/g, (_match, id) => {
    const normalized = normalizeDTag(id.trim());
    const url = `/events?d=${normalized}`;
    // Use onclick to bypass SvelteKit routing and navigate directly
    return `<a class="wikilink text-primary-600 dark:text-primary-500 hover:underline" data-dtag="${normalized}" data-url="${url}" href="${url}" onclick="window.location.href='${url}'; return false;">${id}</a>`;
  });
}

/**
 * Processes nostr addresses in HTML content, but skips addresses that are
 * already within hyperlink tags.
 */
async function processNostrAddresses(html: string): Promise<string> {
  // Helper to check if a match is within an existing <a> tag
  function isWithinLink(text: string, index: number): boolean {
    // Look backwards from the match position to find the nearest <a> tag
    const before = text.slice(0, index);
    const lastOpenTag = before.lastIndexOf("<a");
    const lastCloseTag = before.lastIndexOf("</a>");

    // If we find an opening <a> tag after the last closing </a> tag, we're inside a link
    return lastOpenTag > lastCloseTag;
  }

  // Process nostr addresses that are not within existing links
  const nostrPattern =
    /nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g;
  let processedHtml = html;

  // Find all nostr addresses
  const matches = Array.from(processedHtml.matchAll(nostrPattern));

  // Process them in reverse order to avoid index shifting issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    // Skip if already within a link
    if (isWithinLink(processedHtml, matchIndex)) {
      continue;
    }

    // Process the nostr identifier
    const processedMatch = await processNostrIdentifiers(fullMatch);

    // Replace the match in the HTML
    processedHtml =
      processedHtml.slice(0, matchIndex) +
      processedMatch +
      processedHtml.slice(matchIndex + fullMatch.length);
  }

  return processedHtml;
}

/**
 * Fixes AsciiDoctor stem blocks for MathJax rendering.
 * Joins split spans and wraps content in $$...$$ for block math.
 */
function fixStemBlocks(html: string): string {
  // Replace <div class="stemblock"><div class="content"><span>$</span>...<span>$</span></div></div>
  // with <div class="stemblock"><div class="content">$$...$$</div></div>
  return html.replace(
    /<div class="stemblock">\s*<div class="content">\s*<span>\$<\/span>([\s\S]*?)<span>\$<\/span>\s*<\/div>\s*<\/div>/g,
    (_match, mathContent) => {
      // Remove any extra tags inside mathContent
      const cleanMath = mathContent.replace(/<\/?span[^>]*>/g, "").trim();
      return `<div class="stemblock"><div class="content">$$${cleanMath}$$</div></div>`;
    },
  );
}

/**
 * Post-processes asciidoctor HTML output to add wikilink and nostr address rendering.
 * This function should be called after asciidoctor.convert() to enhance the HTML output.
 */
export async function postProcessAsciidoctorHtml(
  html: string,
): Promise<string> {
  if (!html) return html;

  try {
    // First process AsciiDoctor-generated anchors
    let processedHtml = replaceAsciiDocAnchors(html);
    // Then process wikilinks in [[...]] format (if any remain)
    processedHtml = replaceWikilinks(processedHtml);
    // Then process nostr addresses (but not those already in links)
    processedHtml = await processNostrAddresses(processedHtml);
    processedHtml = fixStemBlocks(processedHtml); // Fix math blocks for MathJax

    return processedHtml;
  } catch (error) {
    console.error("Error in postProcessAsciidoctorHtml:", error);
    return html; // Return original HTML if processing fails
  }
}
