import { processNostrIdentifiers } from '../nostrUtils';

/**
 * Normalizes a string for use as a d-tag by converting to lowercase,
 * replacing non-alphanumeric characters with dashes, and removing
 * leading/trailing dashes.
 */
function normalizeDTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Replaces wikilinks in the format [[target]] or [[target|display]] with
 * clickable links to the events page.
 */
function replaceWikilinks(html: string): string {
  // [[target page]] or [[target page|display text]]
  return html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const normalized = normalizeDTag(target.trim());
    const display = (label || target).trim();
    const url = `./events?d=${normalized}`;
    // Output as a clickable <a> with the [[display]] format and matching link colors
    return `<a class="wikilink text-primary-600 dark:text-primary-500 hover:underline" data-dtag="${normalized}" data-url="${url}" href="${url}">${display}</a>`;
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
    const lastOpenTag = before.lastIndexOf('<a');
    const lastCloseTag = before.lastIndexOf('</a>');
    
    // If we find an opening <a> tag after the last closing </a> tag, we're inside a link
    return lastOpenTag > lastCloseTag;
  }

  // Process nostr addresses that are not within existing links
  const nostrPattern = /nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g;
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
    processedHtml = processedHtml.slice(0, matchIndex) + 
                   processedMatch + 
                   processedHtml.slice(matchIndex + fullMatch.length);
  }
  
  return processedHtml;
}

/**
 * Post-processes asciidoctor HTML output to add wikilink and nostr address rendering.
 * This function should be called after asciidoctor.convert() to enhance the HTML output.
 */
export async function postProcessAsciidoctorHtml(html: string): Promise<string> {
  if (!html) return html;
  
  try {
    // First process wikilinks
    let processedHtml = replaceWikilinks(html);
    
    // Then process nostr addresses (but not those already in links)
    processedHtml = await processNostrAddresses(processedHtml);
    
    return processedHtml;
  } catch (error) {
    console.error('Error in postProcessAsciidoctorHtml:', error);
    return html; // Return original HTML if processing fails
  }
} 