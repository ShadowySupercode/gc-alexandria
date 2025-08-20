import NDK from "@nostr-dev-kit/ndk";
import {
  createProfileLink,
  getUserMetadata,
  NOSTR_PROFILE_REGEX,
} from "../nostrUtils.ts";

import * as emoji from "node-emoji";

// Media URL patterns
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|gif|png|webp|svg)$/i;
const VIDEO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp4|webm|mov|avi)(?:[^\s<]*)?/i;
const AUDIO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|m4a)(?:[^\s<]*)?/i;
const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/;

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
      // Fallback when NDK is not available - just use the identifier
      metadata = { name: identifier.slice(0, 8) + "..." + identifier.slice(-4) };
    }
    const displayText = metadata.displayName || metadata.name;
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
