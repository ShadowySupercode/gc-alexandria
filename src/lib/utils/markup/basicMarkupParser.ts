import NDK from "@nostr-dev-kit/ndk";
import {
  processBasicFormatting,
  processBlockquotes,
  processEmojiShortcodes,
  processNostrIdentifiersInText,
  processWikilinks,
} from "./markupUtils.ts";



export function preProcessBasicMarkup(text: string): string {
  try {
    // Process basic text formatting first
    let processedText = processBasicFormatting(text);

    // Process emoji shortcuts
    processedText = processEmojiShortcodes(processedText);

    // Process blockquotes
    processedText = processBlockquotes(processedText);

    return processedText;
  } catch (e) {
    throw new Error(`[preProcessBasicMarkup] Error: ${e}`);
  }
}

export async function postProcessBasicMarkup(text: string, ndk?: NDK): Promise<string> {
  try {
    // Process Nostr identifiers last
    let processedText = await processNostrIdentifiersInText(text, ndk);

    // Replace wikilinks
    processedText = processWikilinks(processedText);

    return processedText;
  } catch (e) {
    throw new Error(`[postProcessBasicMarkup] Error: ${e}`);
  }
}

export async function parseBasicMarkup(text: string, ndk?: NDK): Promise<string> {
  if (!text) return "";

  try {
    let processedText = preProcessBasicMarkup(text);

    // Process paragraphs - split by double newlines and wrap in p tags
    // Skip wrapping if content already contains block-level elements
    processedText = processedText
      .split(/\n\n+/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => {
        // AI-NOTE:  Added img tag to skip wrapping to prevent image rendering issues
        // Skip wrapping if para already contains block-level elements, math blocks, or images
        if (
          /(<div[^>]*class=["'][^"']*math-block[^"']*["'])|<(div|h[1-6]|blockquote|table|pre|ul|ol|hr|img)/i
            .test(
              para,
            )
        ) {
          return para;
        }
        return `<p class="my-4 no-indent">${para}</p>`;
      })
      .join("\n");

    // Process Nostr identifiers last
    processedText = await postProcessBasicMarkup(processedText, ndk);

    return processedText;
  } catch (e) {
    throw new Error(`Error in parseBasicMarkup: ${e}`);
  }
}
