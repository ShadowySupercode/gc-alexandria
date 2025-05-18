import { processNostrIdentifiers } from '../nostrUtils';
import * as emoji from 'node-emoji';
import { nip19 } from 'nostr-tools';

/* Regex constants for basic markup parsing */

// Text formatting
const BOLD_REGEX = /(\*\*|[*])((?:[^*\n]|\*(?!\*))+)\1/g;
const ITALIC_REGEX = /\b(_[^_\n]+_|\b__[^_\n]+__)\b/g;
const STRIKETHROUGH_REGEX = /~~([^~\n]+)~~|~([^~\n]+)~/g;
const HASHTAG_REGEX = /(?<![^\s])#([a-zA-Z0-9_]+)(?!\w)/g;

// Block elements
const BLOCKQUOTE_REGEX = /^([ \t]*>[ \t]?.*)(?:\n\1[ \t]*(?!>).*)*$/gm;

// Links and media
const MARKUP_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKUP_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const WSS_URL = /wss:\/\/[^\s<>"]+/g;
const DIRECT_LINK = /(?<!["'=])(https?:\/\/[^\s<>"]+)(?!["'])/g;

// Media URL patterns
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|gif|png|webp|svg)$/i;
const VIDEO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp4|webm|mov|avi)(?:[^\s<]*)?/i;
const AUDIO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|m4a)(?:[^\s<]*)?/i;
const YOUTUBE_URL_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/i;

// Add this helper function near the top:
function replaceAlexandriaNostrLinks(text: string): string {
  // Regex for Alexandria/localhost URLs
  const alexandriaPattern = /^https?:\/\/((next-)?alexandria\.gitcitadel\.(eu|com)|localhost(:\d+)?)/i;
  // Regex for bech32 Nostr identifiers
  const bech32Pattern = /(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/;
  // Regex for 64-char hex
  const hexPattern = /\b[a-fA-F0-9]{64}\b/;

  // 1. Alexandria/localhost markup links
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, _label, url) => {
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
  });

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
    // For non-Alexandria/localhost URLs, append (View here: nostr:<id>) if a Nostr identifier is present
    const hexMatch = url.match(hexPattern);
    if (hexMatch) {
      try {
        const nevent = nip19.neventEncode({ id: hexMatch[0] });
        return `${url} (View here: nostr:${nevent})`;
      } catch {
        return url;
      }
    }
    const bech32Match = url.match(bech32Pattern);
    if (bech32Match) {
      return `${url} (View here: nostr:${bech32Match[0]})`;
    }
    return url;
  });

  return text;
}

// Utility to strip tracking parameters from URLs
function stripTrackingParams(url: string): string {
  // List of tracking params to remove
  const trackingParams = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^tracking$/i, /^ref$/i];
  try {
    // Absolute URL
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      const parsed = new URL(url);
      trackingParams.forEach(pattern => {
        for (const key of Array.from(parsed.searchParams.keys())) {
          if (pattern.test(key)) {
            parsed.searchParams.delete(key);
          }
        }
      });
      const queryString = parsed.searchParams.toString();
      return parsed.origin + parsed.pathname + (queryString ? '?' + queryString : '') + (parsed.hash || '');
    } else {
      // Relative URL: parse query string manually
      const [path, queryAndHash = ''] = url.split('?');
      const [query = '', hash = ''] = queryAndHash.split('#');
      if (!query) return url;
      const params = query.split('&').filter(Boolean);
      const filtered = params.filter(param => {
        const [key] = param.split('=');
        return !trackingParams.some(pattern => pattern.test(key));
      });
      const queryString = filtered.length ? '?' + filtered.join('&') : '';
      const hashString = hash ? '#' + hash : '';
      return path + queryString + hashString;
    }
  } catch {
    return url;
  }
}

function normalizeDTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function replaceWikilinks(text: string): string {
  // [[target page]] or [[target page|display text]]
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const normalized = normalizeDTag(target.trim());
    const display = (label || target).trim();
    const url = `./wiki?d=${normalized}`;
    // Output as a clickable <a> with the [[display]] format and matching link colors
    return `<a class="wikilink text-primary-600 dark:text-primary-500 hover:underline" data-dtag="${normalized}" data-url="${url}" href="${url}">${display}</a>`;
  });
}

function renderListGroup(lines: string[], typeHint?: 'ol' | 'ul'): string {
  function parseList(start: number, indent: number, type: 'ol' | 'ul'): [string, number] {
    let html = '';
    let i = start;
    html += `<${type} class="${type === 'ol' ? 'list-decimal' : 'list-disc'} ml-6 mb-2">`;
    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(/^([ \t]*)([*+-]|\d+\.)[ \t]+(.*)$/);
      if (!match) break;
      const lineIndent = match[1].replace(/\t/g, '    ').length;
      const isOrdered = /\d+\./.test(match[2]);
      const itemType = isOrdered ? 'ol' : 'ul';
      if (lineIndent > indent) {
        // Nested list
        const [nestedHtml, consumed] = parseList(i, lineIndent, itemType);
        html = html.replace(/<\/li>$/, '') + nestedHtml + '</li>';
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
          const nextIndent = nextMatch[1].replace(/\t/g, '    ').length;
          const nextType = /\d+\./.test(nextMatch[2]) ? 'ol' : 'ul';
          if (nextIndent > lineIndent) {
            const [nestedHtml, consumed] = parseList(i + 1, nextIndent, nextType);
            html += nestedHtml;
            i = consumed - 1;
          }
        }
      }
      html += '</li>';
      i++;
    }
    html += `</${type}>`;
    return [html, i];
  }
  if (!lines.length) return '';
  const firstLine = lines[0];
  const match = firstLine.match(/^([ \t]*)([*+-]|\d+\.)[ \t]+/);
  const indent = match ? match[1].replace(/\t/g, '    ').length : 0;
  const type = typeHint || (match && /\d+\./.test(match[2]) ? 'ol' : 'ul');
  const [html] = parseList(0, indent, type);
  return html;
}

function processBasicFormatting(content: string): string {
  if (!content) return '';
  
  let processedText = content;
  
  try {
    // Sanitize Alexandria Nostr links before further processing
    processedText = replaceAlexandriaNostrLinks(processedText);

    // Process markup images first
    processedText = processedText.replace(MARKUP_IMAGE, (match, alt, url) => {
      url = stripTrackingParams(url);
      if (YOUTUBE_URL_REGEX.test(url)) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          return `<iframe class="w-full aspect-video rounded-lg shadow-lg my-4" src="https://www.youtube-nocookie.com/embed/${videoId}" title="${alt || 'YouTube video'}" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
        }
      }
      if (VIDEO_URL_REGEX.test(url)) {
        return `<video controls class="max-w-full rounded-lg shadow-lg my-4" preload="none" playsinline><source src="${url}">${alt || 'Video'}</video>`;
      }
      if (AUDIO_URL_REGEX.test(url)) {
        return `<audio controls class="w-full my-4" preload="none"><source src="${url}">${alt || 'Audio'}</audio>`;
      }
      // Only render <img> if the url ends with a direct image extension
      if (IMAGE_EXTENSIONS.test(url.split('?')[0])) {
        return `<img src="${url}" alt="${alt}" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async">`;
      }
      // Otherwise, render as a clickable link
      return `<a href="${url}" class="text-primary-600 dark:text-primary-500 hover:underline" target="_blank" rel="noopener noreferrer">${alt || url}</a>`;
    });

    // Process markup links
    processedText = processedText.replace(MARKUP_LINK, (match, text, url) => 
      `<a href="${stripTrackingParams(url)}" class="text-primary-600 dark:text-primary-500 hover:underline" target="_blank" rel="noopener noreferrer">${text}</a>`
    );

    // Process WebSocket URLs
    processedText = processedText.replace(WSS_URL, match => {
      // Remove 'wss://' from the start and any trailing slashes
      const cleanUrl = match.slice(6).replace(/\/+$/, '');
      return `<a href="https://nostrudel.ninja/#/r/wss%3A%2F%2F${cleanUrl}%2F" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-500 hover:underline">${match}</a>`;
    });

    // Process direct media URLs and auto-link all URLs
    processedText = processedText.replace(DIRECT_LINK, match => {
      const clean = stripTrackingParams(match);
      if (YOUTUBE_URL_REGEX.test(clean)) {
        const videoId = extractYouTubeVideoId(clean);
        if (videoId) {
          return `<iframe class="w-full aspect-video rounded-lg shadow-lg my-4" src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" class="text-primary-600 dark:text-primary-500 hover:underline"></iframe>`;
        }
      }
      if (VIDEO_URL_REGEX.test(clean)) {
        return `<video controls class="max-w-full rounded-lg shadow-lg my-4" preload="none" playsinline><source src="${clean}">Your browser does not support the video tag.</video>`;
      }
      if (AUDIO_URL_REGEX.test(clean)) {
        return `<audio controls class="w-full my-4" preload="none"><source src="${clean}">Your browser does not support the audio tag.</audio>`;
      }
      // Only render <img> if the url ends with a direct image extension
      if (IMAGE_EXTENSIONS.test(clean.split('?')[0])) {
        return `<img src="${clean}" alt="Embedded media" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async">`;
      }
      // Otherwise, render as a clickable link
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">${clean}</a>`;
    });
    
    // Process text formatting
    processedText = processedText.replace(BOLD_REGEX, '<strong>$2</strong>');
    processedText = processedText.replace(ITALIC_REGEX, match => {
      const text = match.replace(/^_+|_+$/g, '');
      return `<em>${text}</em>`;
    });
    processedText = processedText.replace(STRIKETHROUGH_REGEX, (match, doubleText, singleText) => {
      const text = doubleText || singleText;
      return `<del class="line-through">${text}</del>`;
    });

    // Process hashtags
    processedText = processedText.replace(HASHTAG_REGEX, '<span class="text-primary-600 dark:text-primary-500">#$1</span>');

    // --- Improved List Grouping and Parsing ---
    const lines = processedText.split('\n');
    let output = '';
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
          output += renderListGroup(buffer, isOrdered ? 'ol' : 'ul');
          buffer = [];
          inList = false;
        }
        output += (output && !output.endsWith('\n') ? '\n' : '') + line + '\n';
      }
    }
    if (buffer.length) {
      const firstLine = buffer[0];
      const isOrdered = /^\s*\d+\.\s+/.test(firstLine);
      output += renderListGroup(buffer, isOrdered ? 'ol' : 'ul');
    }
    processedText = output;
    // --- End Improved List Grouping and Parsing ---

  } catch (e: unknown) {
    console.error('Error in processBasicFormatting:', e);
  }

  return processedText;
}

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function processBlockquotes(content: string): string {
  try {
    if (!content) return '';
    
    return content.replace(BLOCKQUOTE_REGEX, match => {
      const lines = match.split('\n').map(line => {
        return line.replace(/^[ \t]*>[ \t]?/, '').trim();
      });
      
      return `<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">${
        lines.join('\n')
      }</blockquote>`;
    });
  } catch (e: unknown) {
    console.error('Error in processBlockquotes:', e);
    return content;
  }
}

function processEmojiShortcuts(content: string): string {
  try {
    return emoji.emojify(content, { fallback: (name: string) => {
      const emojiChar = emoji.get(name);
      return emojiChar || `:${name}:`;
    }});
  } catch (e: unknown) {
    console.error('Error in processEmojiShortcuts:', e);
    return content;
  }
}

export async function parseBasicmarkup(text: string): Promise<string> {
  if (!text) return '';
  
  try {
    // Process basic text formatting first
    let processedText = processBasicFormatting(text);

    // Process emoji shortcuts
    processedText = processEmojiShortcuts(processedText);
      
    // Process blockquotes
    processedText = processBlockquotes(processedText);
    
    // Process paragraphs - split by double newlines and wrap in p tags
    processedText = processedText
      .split(/\n\n+/)
      .map(para => para.trim())
      .filter(para => para.length > 0)
      .map(para => `<p class="my-4">${para}</p>`)
      .join('\n');

    // Process Nostr identifiers last
    processedText = await processNostrIdentifiers(processedText);

    // Replace wikilinks
    processedText = replaceWikilinks(processedText);

    return processedText;
  } catch (e: unknown) {
    console.error('Error in parseBasicmarkup:', e);
    return `<div class="text-red-500">Error processing markup: ${(e as Error)?.message ?? 'Unknown error'}</div>`;
  }
}