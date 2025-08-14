import { processNostrIdentifiers } from "../nostrUtils.ts";
import * as emoji from "node-emoji";

// Media URL patterns
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|gif|png|webp|svg)$/i;
const VIDEO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp4|webm|mov|avi)(?:[^\s<]*)?/i;
const AUDIO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|m4a)(?:[^\s<]*)?/i;
const YOUTUBE_URL_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/;

/**
 * Shared service for processing images with reveal/enlarge functionality
 */
export function processImageWithReveal(src: string, alt: string = "Image"): string {
  if (!src || !IMAGE_EXTENSIONS.test(src.split("?")[0])) {
    return `<img src="${src}" alt="${alt}">`;
  }

  return `<div class="relative inline-block w-[300px] my-4 group">
    <!-- Pastel placeholder background -->
    <div class="image-bg-placeholder w-full h-48 bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 dark:from-pink-900 dark:via-purple-900 dark:to-blue-900 rounded-lg shadow-lg flex items-center justify-center border border-pink-200 dark:border-pink-700">
      <!-- Decorative pattern -->
      <div class="absolute inset-0 opacity-20">
        <div class="w-full h-full bg-gradient-to-br from-pink-200/30 via-purple-200/30 to-blue-200/30 dark:from-pink-800/30 dark:via-purple-800/30 dark:to-blue-800/30 rounded-lg"></div>
      </div>
      <!-- Reveal button -->
      <button class="relative z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-200 font-medium px-4 py-2 rounded-lg shadow-md hover:bg-white dark:hover:bg-gray-700 hover:shadow-lg transition-all duration-300 border border-gray-200 dark:border-gray-600 hover:scale-105" 
              onclick="const container = this.closest('.group'); const img = container.querySelector('img'); const placeholder = container.querySelector('.image-bg-placeholder'); const expandBtn = container.querySelector('button[title]'); img.style.opacity='1'; img.style.position='relative'; img.style.zIndex='1'; placeholder.style.display='none'; this.style.display='none'; expandBtn.style.display='flex'; expandBtn.style.opacity='1'; expandBtn.style.pointerEvents='auto'; expandBtn.style.zIndex='20';">
        <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
        </svg>
        Reveal Image
      </button>
    </div>
    
    <!-- Hidden image that will be revealed -->
    <img src="${src}" alt="${alt}" class="absolute inset-0 w-full h-48 object-contain rounded-lg shadow-lg opacity-0 transition-opacity duration-500" loading="lazy" decoding="async">
    
    <!-- Expand button (initially hidden) -->
    <button class="absolute top-2 right-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white rounded-full w-8 h-8 flex items-center justify-center transition-all duration-300 opacity-0 pointer-events-none shadow-lg hover:scale-110 z-20" 
            onclick="window.open('${src}', '_blank')" 
            title="Open image in full size"
            style="display: none;">
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
      return `<iframe class="w-full aspect-video rounded-lg shadow-lg my-4" src="https://www.youtube-nocookie.com/embed/${videoId}" title="${alt || "YouTube video"}" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
    }
  }
  
  if (VIDEO_URL_REGEX.test(clean)) {
    return `<video controls class="max-w-full rounded-lg shadow-lg my-4" preload="none" playsinline><source src="${clean}">${alt || "Video"}</video>`;
  }
  
  if (AUDIO_URL_REGEX.test(clean)) {
    return `<audio controls class="w-full my-4" preload="none"><source src="${clean}">${alt || "Audio"}</audio>`;
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
export async function processNostrIdentifiersInText(text: string): Promise<string> {
  const nostrPattern = /nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g;
  let processedText = text;
  
  // Find all nostr addresses
  const matches = Array.from(processedText.matchAll(nostrPattern));
  
  // Process them in reverse order to avoid index shifting issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;
    
    // Process the nostr identifier
    const processedMatch = await processNostrIdentifiers(fullMatch);
    
    // Replace the match in the text
    processedText = processedText.slice(0, matchIndex) + processedMatch + processedText.slice(matchIndex + fullMatch.length);
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
  return text.replace(hashtagRegex, '<button class="text-primary-600 dark:text-primary-500 hover:underline cursor-pointer" onclick="window.location.href=\'/events?t=$1\'">#$1</button>');
}

/**
 * Shared service for processing basic text formatting
 */
export function processBasicTextFormatting(text: string): string {
  // Bold: **text** or *text*
  text = text.replace(/(\*\*|[*])((?:[^*\n]|\*(?!\*))+)\1/g, "<strong>$2</strong>");
  
  // Italic: _text_ or __text__
  text = text.replace(/\b(_[^_\n]+_|\b__[^_\n]+__)\b/g, (match) => {
    const text = match.replace(/^_+|_+$/g, "");
    return `<em>${text}</em>`;
  });
  
  // Strikethrough: ~~text~~ or ~text~
  text = text.replace(/~~([^~\n]+)~~|~([^~\n]+)~/g, (_match, doubleText, singleText) => {
    const text = doubleText || singleText;
    return `<del class="line-through">${text}</del>`;
  });
  
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
    return `<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">${lines.join("\n")}</blockquote>`;
  });
}

// Helper functions
export function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url;
  }
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
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
