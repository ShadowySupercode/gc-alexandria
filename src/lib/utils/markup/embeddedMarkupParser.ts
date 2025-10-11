import {
  postProcessBasicMarkup,
  preProcessBasicMarkup,
} from "./basicMarkupParser.ts";
import { processNostrIdentifiersWithEmbeddedEvents } from "./markupUtils.ts";

/**
 * Parse markup with support for embedded Nostr events
 * AI-NOTE:  Enhanced markup parser that supports nested Nostr event embedding
 * Up to 3 levels of nesting are supported, after which events are shown as links
 */
export async function parseEmbeddedMarkup(
  text: string,
  nestingLevel: number = 0,
): Promise<string> {
  if (!text) return "";

  try {
    let processedText = preProcessBasicMarkup(text);

    // Process paragraphs - split by double newlines and wrap in p tags
    // Skip wrapping if content already contains block-level elements
    const blockLevelEls =
      /(<div[^>]*class=["'][^"']*math-block[^"']*["'])|<(div|h[1-6]|blockquote|table|pre|ul|ol|hr|img)/i;
    processedText = processedText
      .split(/\n\n+/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => {
        // Skip wrapping if para already contains block-level elements, math blocks, or images
        if (blockLevelEls.test(para)) {
          return para;
        }

        return `<p class="my-1 no-indent">${para}</p>`;
      })
      .join("\n");

    // Process event identifiers with embedded events (only event-related identifiers)
    processedText = processNostrIdentifiersWithEmbeddedEvents(
      processedText,
      nestingLevel,
    );

    // Process profile identifiers (npub, nprofile) using the regular processor
    processedText = await postProcessBasicMarkup(processedText);

    return processedText;
  } catch (e: unknown) {
    console.error("Error in parseEmbeddedMarkup:", e);
    return `<div class="text-red-500">Error processing markup: ${
      (e as Error)?.message ?? "Unknown error"
    }</div>`;
  }
}
