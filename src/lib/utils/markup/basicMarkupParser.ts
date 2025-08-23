import { nip19 } from "nostr-tools";
import {
  processBasicTextFormatting,
  processBlockquotes,
  processEmojiShortcodes,
  processHashtags,
  processImageWithReveal,
  processMediaUrl,
  processNostrIdentifiersInText,
  processAllNostrIdentifiers,
  processWebSocketUrls,
  processWikilinks,
  stripTrackingParams,
} from "./markupServices.ts";

/* Regex constants for basic markup parsing */

// Links and media
const MARKUP_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKUP_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
// AI-NOTE: 2025-01-24 - Added negative lookbehind (?<!\]\() to prevent processing URLs in markdown syntax
const DIRECT_LINK = /(?<!["'=])(?<!\]\()(https?:\/\/[^\s<>"]+)(?!["'])/g;

// Add this helper function near the top:
function replaceAlexandriaNostrLinks(text: string): string {
  // Regex for Alexandria/localhost URLs
  const alexandriaPattern =
    /^https?:\/\/((next-)?alexandria\.gitcitadel\.(eu|com)|localhost(:\d+)?)/i;
  // Regex for bech32 Nostr identifiers
  const bech32Pattern = /(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/;
  // Regex for 64-char hex
  const hexPattern = /\b[a-fA-F0-9]{64}\b/;

  // 1. Alexandria/localhost markup links
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (match, _label, url) => {
      if (alexandriaPattern.test(url)) {
        if (/[?&]d=/.test(url)) return match;
        const hexMatch = url.match(hexPattern);
        if (hexMatch) {
          try {
            const nevent = nip19.neventEncode({ id: hexMatch[0] });
            return `nostr:${nevent}`;
          } catch {
            return match;
          }
        }
        const bech32Match = url.match(bech32Pattern);
        if (bech32Match) {
          return `nostr:${bech32Match[0]}`;
        }
      }
      return match;
    },
  );

  // 2. Alexandria/localhost bare URLs and non-Alexandria/localhost URLs with Nostr identifiers
  text = text.replace(/https?:\/\/[^\s)\]]+/g, (url) => {
    if (alexandriaPattern.test(url)) {
      if (/[?&]d=/.test(url)) return url;
      const hexMatch = url.match(hexPattern);
      if (hexMatch) {
        try {
          const nevent = nip19.neventEncode({ id: hexMatch[0] });
          return `nostr:${nevent}`;
        } catch {
          return url;
        }
      }
      const bech32Match = url.match(bech32Pattern);
      if (bech32Match) {
        return `nostr:${bech32Match[0]}`;
      }
    }
    // For non-Alexandria/localhost URLs, just return the URL as-is
    return url;
  });

  return text;
}

function renderListGroup(lines: string[], typeHint?: "ol" | "ul"): string {
  function parseList(
    start: number,
    indent: number,
    type: "ol" | "ul",
  ): [string, number] {
    let html = "";
    let i = start;
    html += `<${type} class="${
      type === "ol" ? "list-decimal" : "list-disc"
    } ml-6 mb-2">`;
    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(/^([ \t]*)([*+-]|\d+\.)[ \t]+(.*)$/);
      if (!match) break;
      const lineIndent = match[1].replace(/\t/g, "    ").length;
      const isOrdered = /\d+\./.test(match[2]);
      const itemType = isOrdered ? "ol" : "ul";
      if (lineIndent > indent) {
        // Nested list
        const [nestedHtml, consumed] = parseList(i, lineIndent, itemType);
        html = html.replace(/<\/li>$/, "") + nestedHtml + "</li>";
        i = consumed;
        continue;
      }
      if (lineIndent < indent || itemType !== type) {
        break;
      }
      html += `<li class="mb-1">${match[3]}`;
      // Check for next line being a nested list
      if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/^([ \t]*)([*+-]|\d+\.)[ \t]+/);
        if (nextMatch) {
          const nextIndent = nextMatch[1].replace(/\t/g, "    ").length;
          const nextType = /\d+\./.test(nextMatch[2]) ? "ol" : "ul";
          if (nextIndent > lineIndent) {
            const [nestedHtml, consumed] = parseList(
              i + 1,
              nextIndent,
              nextType,
            );
            html += nestedHtml;
            i = consumed - 1;
          }
        }
      }
      html += "</li>";
      i++;
    }
    html += `</${type}>`;
    return [html, i];
  }
  if (!lines.length) return "";
  const firstLine = lines[0];
  const match = firstLine.match(/^([ \t]*)([*+-]|\d+\.)[ \t]+/);
  const indent = match ? match[1].replace(/\t/g, "    ").length : 0;
  const type = typeHint || (match && /\d+\./.test(match[2]) ? "ol" : "ul");
  const [html] = parseList(0, indent, type);
  return html;
}

function processBasicFormatting(content: string): string {
  if (!content) return "";

  let processedText = content;

  try {
    // Sanitize Alexandria Nostr links before further processing
    processedText = replaceAlexandriaNostrLinks(processedText);

    // Process markup images first
    processedText = processedText.replace(MARKUP_IMAGE, (match, alt, url) => {
      // Clean the URL and alt text
      const cleanUrl = url.trim();
      const cleanAlt = alt ? alt.trim() : "";
      return processImageWithReveal(cleanUrl, cleanAlt);
    });

    // Process markup links
    processedText = processedText.replace(
      MARKUP_LINK,
      (_match, text, url) =>
        `<a href="${
          stripTrackingParams(url)
        }" class="text-primary-600 dark:text-primary-500 hover:underline" target="_blank" rel="noopener noreferrer">${text}</a>`,
    );

    // Process WebSocket URLs using shared services
    processedText = processWebSocketUrls(processedText);

    // Process direct media URLs and auto-link all URLs
    processedText = processedText.replace(DIRECT_LINK, (match) => {
      return processMediaUrl(match);
    });

    // Process text formatting using shared services
    processedText = processBasicTextFormatting(processedText);

    // Process hashtags using shared services
    processedText = processHashtags(processedText);

    // --- Improved List Grouping and Parsing ---
    const lines = processedText.split("\n");
    let output = "";
    let buffer: string[] = [];
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^([ \t]*)([*+-]|\d+\.)[ \t]+/.test(line)) {
        buffer.push(line);
        inList = true;
      } else {
        if (inList) {
          const firstLine = buffer[0];
          const isOrdered = /^\s*\d+\.\s+/.test(firstLine);
          output += renderListGroup(buffer, isOrdered ? "ol" : "ul");
          buffer = [];
          inList = false;
        }
        output += (output && !output.endsWith("\n") ? "\n" : "") + line + "\n";
      }
    }
    if (buffer.length) {
      const firstLine = buffer[0];
      const isOrdered = /^\s*\d+\.\s+/.test(firstLine);
      output += renderListGroup(buffer, isOrdered ? "ol" : "ul");
    }
    processedText = output;
    // --- End Improved List Grouping and Parsing ---
  } catch (e: unknown) {
    console.error("Error in processBasicFormatting:", e);
  }

  return processedText;
}

export async function parseBasicmarkup(text: string): Promise<string> {
  if (!text) return "";

  try {
    // Process basic text formatting first
    let processedText = processBasicFormatting(text);

    // Process emoji shortcuts
    processedText = processEmojiShortcodes(processedText);

    // Process blockquotes
    processedText = processBlockquotes(processedText);

    // Process paragraphs - split by double newlines and wrap in p tags
    // Skip wrapping if content already contains block-level elements
    processedText = processedText
      .split(/\n\n+/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => {
        // AI-NOTE: 2025-01-24 - Added img tag to skip wrapping to prevent image rendering issues
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
    processedText = await processNostrIdentifiersInText(processedText);

    // Replace wikilinks
    processedText = processWikilinks(processedText);

    return processedText;
  } catch (e: unknown) {
    console.error("Error in parseBasicmarkup:", e);
    return `<div class="text-red-500">Error processing markup: ${
      (e as Error)?.message ?? "Unknown error"
    }</div>`;
  }
}
