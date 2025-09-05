import NDK from "@nostr-dev-kit/ndk";
import {
  createProfileLink,
  getUserMetadata,
  nip19,
  NOSTR_PROFILE_REGEX,
} from "../nostrUtils.ts";
import { getBestDisplayName } from "../profile_parsing";

import * as emoji from "node-emoji";

// Media URL patterns
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|gif|png|webp|svg)$/i;
const VIDEO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp4|webm|mov|avi)(?:[^\s<]*)?/i;
const AUDIO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|m4a)(?:[^\s<]*)?/i;
const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/;

// Links and media
const MARKUP_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKUP_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
// AI-NOTE: Added negative lookbehind (?<!\]\() to prevent processing URLs in markdown syntax
const DIRECT_LINK = /(?<!["'=])(?<!\]\()(https?:\/\/[^\s<>"]+)(?!["'])/g;

// Add this helper function near the top:
export function replaceAlexandriaNostrLinks(text: string): string {
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

export function renderListGroup(lines: string[], typeHint?: "ol" | "ul"): string {
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

export function processBasicFormatting(content: string): string {
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

/**
 * Shared service for processing images with expand functionality
 */
export function processImageWithReveal(
  src: string,
  alt: string = "Image",
): string {
  if (!src || !IMAGE_EXTENSIONS.test(src.split("?")[0])) {
    return `<img src="${src}" alt="${alt}">`;
  }

  return `<div class="relative inline-block w-[300px] h-48 my-2 group">
    <img 
      src="${src}" 
      alt="${alt}" 
      class="w-full h-full object-contain rounded-lg shadow-lg" 
      loading="lazy" 
      decoding="async"
    />
    
    <!-- Expand button -->
    <button class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-110 z-20" 
            onclick="window.open('${src}', '_blank')" 
            title="Open image in full size"
            aria-label="Open image in full size">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
      </svg>
    </button>
  </div>`;
}

/**
 * Shared service for processing media URLs
 */
export function processMediaUrl(url: string, alt?: string): string {
  const clean = stripTrackingParams(url);

  if (YOUTUBE_URL_REGEX.test(clean)) {
    const videoId = extractYouTubeVideoId(clean);
    if (videoId) {
      return `<iframe class="w-full aspect-video rounded-lg shadow-lg my-2" src="https://www.youtube-nocookie.com/embed/${videoId}" title="${
        alt || "YouTube video"
      }" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
    }
  }

  if (VIDEO_URL_REGEX.test(clean)) {
    return `<video controls class="max-w-full rounded-lg shadow-lg my-2" preload="none" playsinline><source src="${clean}">${
      alt || "Video"
    }</video>`;
  }

  if (AUDIO_URL_REGEX.test(clean)) {
    return `<audio controls class="w-full my-2" preload="none"><source src="${clean}">${
      alt || "Audio"
    }</audio>`;
  }

  if (IMAGE_EXTENSIONS.test(clean.split("?")[0])) {
    return processImageWithReveal(clean, alt || "Embedded media");
  }

  // Default to clickable link
  return `<a href="${clean}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">${clean}</a>`;
}

/**
 * Shared service for processing nostr identifiers
 */
export async function processNostrIdentifiersInText(
  text: string,
  ndk?: NDK,
): Promise<string> {
  let processedText = text;

  // Find all profile-related nostr addresses (only npub and nprofile)
  const matches = Array.from(processedText.matchAll(NOSTR_PROFILE_REGEX));

  // Process them in reverse order to avoid index shifting issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    // Skip if part of a URL
    const before = processedText.slice(
      Math.max(0, matchIndex - 12),
      matchIndex,
    );
    if (/https?:\/\/$|www\.$/i.test(before)) {
      continue;
    }

    // Process the nostr identifier directly
    let identifier = fullMatch;
    if (!identifier.startsWith("nostr:")) {
      identifier = "nostr:" + identifier;
    }

    // Get user metadata and create link
    let metadata;
    if (ndk) {
      metadata = await getUserMetadata(identifier, ndk);
    } else {
      // Fallback when NDK is not available - just use the clean identifier
      const cleanId = identifier.replace(/^nostr:/, "");
      metadata = { name: [cleanId.slice(0, 8) + "..." + cleanId.slice(-4)] };
    }
    const displayText = getBestDisplayName(metadata);
    const link = createProfileLink(identifier, displayText);

    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + link +
      processedText.slice(matchIndex + fullMatch.length);
  }

  return processedText;
}

/**
 * Shared service for processing nostr identifiers with embedded events
 * Replaces nostr: links with embedded event placeholders
 * Only processes event-related identifiers (nevent, naddr, note), not profile identifiers (npub, nprofile)
 */
export function processNostrIdentifiersWithEmbeddedEvents(
  text: string,
  nestingLevel: number = 0,
): string {
  const eventPattern = /nostr:(note|nevent|naddr)[a-zA-Z0-9]{20,}/g;
  let processedText = text;

  // Maximum nesting level allowed
  const MAX_NESTING_LEVEL = 3;

  // Find all event-related nostr addresses
  const matches = Array.from(processedText.matchAll(eventPattern));

  // Process them in reverse order to avoid index shifting issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    let replacement: string;

    if (nestingLevel >= MAX_NESTING_LEVEL) {
      // At max nesting level, just show the link
      replacement =
        `<a href="/events?id=${fullMatch}" class="text-primary-600 dark:text-primary-500 hover:underline break-all">${fullMatch}</a>`;
    } else {
      // Create a placeholder for embedded event
      const componentId = `embedded-event-${
        Math.random().toString(36).substr(2, 9)
      }`;
      replacement =
        `<div class="embedded-event-placeholder" data-nostr-id="${fullMatch}" data-nesting-level="${nestingLevel}" id="${componentId}"></div>`;
    }

    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + replacement +
      processedText.slice(matchIndex + fullMatch.length);
  }

  return processedText;
}

/**
 * Shared service for processing all nostr identifiers (both profiles and events)
 * Creates clickable links for all nostr identifiers
 */
export function processAllNostrIdentifiers(text: string): string {
  let processedText = text;

  // Pattern for prefixed nostr identifiers (nostr:npub1, nostr:note1, etc.)
  // This handles both full identifiers and partial ones that might appear in content
  const prefixedNostrPattern = /nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g;
  
  // Pattern for bare nostr identifiers (npub1, note1, nevent1, naddr1)
  // Exclude matches that are part of URLs to avoid breaking existing links
  const bareNostrPattern = /(?<!https?:\/\/[^\s]*)(?<!wss?:\/\/[^\s]*)(?<!nostr:)(npub1|note1|nevent1|naddr1)[a-zA-Z0-9]{20,}/g;

  // Process prefixed nostr identifiers first
  const prefixedMatches = Array.from(processedText.matchAll(prefixedNostrPattern));
  
  // Process them in reverse order to avoid index shifting issues
  for (let i = prefixedMatches.length - 1; i >= 0; i--) {
    const match = prefixedMatches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    // Create shortened display text
    const identifier = fullMatch.replace('nostr:', '');
    const displayText = `${identifier.slice(0, 8)}...${identifier.slice(-4)}`;
    
    // Create clickable link
    const replacement = `<a href="/events?id=${fullMatch}" class="text-primary-600 dark:text-primary-500 hover:underline break-all" title="${fullMatch}">${displayText}</a>`;

    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + replacement +
      processedText.slice(matchIndex + fullMatch.length);
  }

  // Process bare nostr identifiers
  const bareMatches = Array.from(processedText.matchAll(bareNostrPattern));
  
  // Process them in reverse order to avoid index shifting issues
  for (let i = bareMatches.length - 1; i >= 0; i--) {
    const match = bareMatches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    // Create shortened display text
    const displayText = `${fullMatch.slice(0, 8)}...${fullMatch.slice(-4)}`;
    
    // Create clickable link with nostr: prefix for the href
    const replacement = `<a href="/events?id=nostr:${fullMatch}" class="text-primary-600 dark:text-primary-500 hover:underline break-all" title="nostr:${fullMatch}">${displayText}</a>`;

    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + replacement +
      processedText.slice(matchIndex + fullMatch.length);
  }

  // Also handle any remaining truncated prefixed identifiers that might be cut off or incomplete
  const truncatedPrefixedPattern = /nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{8,}/g;
  const truncatedPrefixedMatches = Array.from(processedText.matchAll(truncatedPrefixedPattern));
  
  for (let i = truncatedPrefixedMatches.length - 1; i >= 0; i--) {
    const match = truncatedPrefixedMatches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    // Skip if this was already processed by the main pattern
    if (fullMatch.length >= 30) continue; // Full identifiers are at least 30 chars

    // Create display text for truncated identifiers
    const identifier = fullMatch.replace('nostr:', '');
    const displayText = identifier.length > 12 ? `${identifier.slice(0, 8)}...${identifier.slice(-4)}` : identifier;
    
    // Create clickable link
    const replacement = `<a href="/events?id=${fullMatch}" class="text-primary-600 dark:text-primary-500 hover:underline break-all" title="${fullMatch}">${displayText}</a>`;

    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + replacement +
      processedText.slice(matchIndex + fullMatch.length);
  }

  // Handle truncated bare identifiers
  const truncatedBarePattern = /(?<!https?:\/\/[^\s]*)(?<!wss?:\/\/[^\s]*)(?<!nostr:)(npub1|note1|nevent1|naddr1)[a-zA-Z0-9]{8,}/g;
  const truncatedBareMatches = Array.from(processedText.matchAll(truncatedBarePattern));
  
  for (let i = truncatedBareMatches.length - 1; i >= 0; i--) {
    const match = truncatedBareMatches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;

    // Skip if this was already processed by the main pattern
    if (fullMatch.length >= 30) continue; // Full identifiers are at least 30 chars

    // Create display text for truncated identifiers
    const displayText = fullMatch.length > 12 ? `${fullMatch.slice(0, 8)}...${fullMatch.slice(-4)}` : fullMatch;
    
    // Create clickable link
    const replacement = `<a href="/events?id=nostr:${fullMatch}" class="text-primary-600 dark:text-primary-500 hover:underline break-all" title="nostr:${fullMatch}">${displayText}</a>`;

    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + replacement +
      processedText.slice(matchIndex + fullMatch.length);
  }

  return processedText;
}

/**
 * Shared service for processing emoji shortcodes
 */
export function processEmojiShortcodes(text: string): string {
  return emoji.emojify(text);
}

/**
 * Shared service for processing WebSocket URLs
 */
export function processWebSocketUrls(text: string): string {
  const wssUrlRegex = /wss:\/\/[^\s<>"]+/g;
  return text.replace(wssUrlRegex, (match) => {
    const cleanUrl = match.slice(6).replace(/\/+$/, "");
    return `<a href="https://nostrudel.ninja/#/r/wss%3A%2F%2F${cleanUrl}%2F" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-500 hover:underline">${match}</a>`;
  });
}

/**
 * Shared service for processing hashtags
 */
export function processHashtags(text: string): string {
  const hashtagRegex = /(?<![^\s])#([a-zA-Z0-9_]+)(?!\w)/g;
  return text.replace(
    hashtagRegex,
    '<button class="text-primary-600 dark:text-primary-500 hover:underline cursor-pointer" onclick="window.location.href=\'/events?t=$1\'">#$1</button>',
  );
}

/**
 * Shared service for processing basic text formatting
 */
export function processBasicTextFormatting(text: string): string {
  // Bold: **text** or *text*
  text = text.replace(
    /(\*\*|[*])((?:[^*\n]|\*(?!\*))+)\1/g,
    "<strong>$2</strong>",
  );

  // Italic: _text_ or __text__
  text = text.replace(/\b(_[^_\n]+_|\b__[^_\n]+__)\b/g, (match) => {
    const text = match.replace(/^_+|_+$/g, "");
    return `<em>${text}</em>`;
  });

  // Strikethrough: ~~text~~ or ~text~
  text = text.replace(
    /~~([^~\n]+)~~|~([^~\n]+)~/g,
    (_match, doubleText, singleText) => {
      const text = doubleText || singleText;
      return `<del class="line-through">${text}</del>`;
    },
  );

  return text;
}

/**
 * Shared service for processing blockquotes
 */
export function processBlockquotes(text: string): string {
  const blockquoteRegex = /^([ \t]*>[ \t]?.*)(?:\n\1[ \t]*(?!>).*)*$/gm;
  return text.replace(blockquoteRegex, (match) => {
    const lines = match.split("\n").map((line) => {
      return line.replace(/^[ \t]*>[ \t]?/, "").trim();
    });
    return `<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">${
      lines.join("\n")
    }</blockquote>`;
  });
}

// Helper functions
export function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove common tracking parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ];
    trackingParams.forEach((param) => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url;
  }
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

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
 * Shared service for processing wikilinks in the format [[target]] or [[target|display]]
 */
export function processWikilinks(text: string): string {
  // [[target page]] or [[target page|display text]]
  return text.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target, label) => {
      const normalized = normalizeDTag(target.trim());
      const display = (label || target).trim();
      const url = `/events?d=${normalized}`;
      return `<a class="wikilink text-primary-600 dark:text-primary-500 hover:underline" data-dtag="${normalized}" data-url="${url}" href="${url}">${display}</a>`;
    },
  );
}

/**
 * Shared service for processing AsciiDoc anchor tags
 */
export function processAsciiDocAnchors(text: string): string {
  return text.replace(/<a id="([^"]+)"><\/a>/g, (_match, id) => {
    const normalized = normalizeDTag(id.trim());
    const url = `/events?d=${normalized}`;
    return `<a class="wikilink text-primary-600 dark:text-primary-500 hover:underline" data-dtag="${normalized}" data-url="${url}" href="${url}">${id}</a>`;
  });
}
