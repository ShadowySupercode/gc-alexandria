import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import emoji from 'markdown-it-emoji';
import { processNostrIdentifiers } from '../nostrUtils';
import hljs from 'highlight.js';
import 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';
import asciidoc from 'highlight.js/lib/languages/asciidoc';
import { getUnicodeEmoji } from '../emoticons';

// Configure highlight.js
hljs.configure({
  ignoreUnescapedHTML: true
});

hljs.registerLanguage('asciidoc', asciidoc);

// URL patterns for custom rendering
const WSS_URL = /wss:\/\/[^\s<>"]+/g;
const IMAGE_URL_REGEX = /https?:\/\/[^\s<]+\.(?:jpg|jpeg|gif|png|webp)(?:[^\s<]*)?/i;
const VIDEO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp4|webm|mov|avi)(?:[^\s<]*)?/i;
const AUDIO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|m4a)(?:[^\s<]*)?/i;
const YOUTUBE_URL_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/i;

// Tracking parameters to remove
const TRACKING_PARAMS = new Set([
  // Common tracking parameters
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source', 'campaign', 'si', 't', 'v', 'ab_channel',
  // YouTube specific
  'feature', 'hl', 'gl', 'app', 'persist_app', 'app-arg',
  'autoplay', 'loop', 'controls', 'modestbranding', 'rel',
  'showinfo', 'iv_load_policy', 'fs', 'playsinline'
]);

/**
 * Clean URL by removing tracking parameters
 */
function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    
    // Remove tracking parameters
    for (const param of TRACKING_PARAMS) {
      params.delete(param);
    }
    
    // For YouTube URLs, only keep the video ID
    if (YOUTUBE_URL_REGEX.test(url)) {
      const videoId = url.match(YOUTUBE_URL_REGEX)?.[1];
      if (videoId) {
        return `https://www.youtube-nocookie.com/embed/${videoId}`;
      }
    }
    
    // Reconstruct URL without tracking parameters
    urlObj.search = params.toString();
    return urlObj.toString();
  } catch (e) {
    // If URL parsing fails, return original URL
    return url;
  }
}

// Create markdown-it instance with plugins
const md = new MarkdownIt({
  html: true,        // Enable HTML tags in source
  xhtmlOut: true,    // Use '/' to close single tags (<br />)
  breaks: true,      // Convert '\n' in paragraphs into <br>
  linkify: true,     // Autoconvert URL-like text to links
  typographer: true, // Enable some language-neutral replacement + quotes beautification
  highlight: function (str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      } catch (__) {}
    }
    return ''; // use external default escaping
  }
})
.use(footnote)
.use(emoji);

// Enable strikethrough using markdown-it's built-in rule
md.inline.ruler.after('emphasis', 'strikethrough', (state, silent) => {
  let found = false, token, pos = state.pos, max = state.posMax, start = pos, marker = state.src.charCodeAt(pos);

  if (silent) return false;

  if (marker !== 0x7E/* ~ */) return false;

  let scan = pos, mem = pos;
  while (scan < max && state.src.charCodeAt(scan) === 0x7E/* ~ */) { scan++; }
  let len = scan - mem;
  if (len < 2) return false;

  let markup = state.src.slice(mem, scan);
  let end = scan;

  while (end < max) {
    if (state.src.charCodeAt(end) === marker) {
      if (state.src.slice(end, end + len) === markup) {
        found = true;
        break;
      }
    }
    end++;
  }

  if (!found) {
    state.pos = scan;
    return false;
  }

  if (!silent) {
    state.pos = mem + len;
    token = state.push('s_open', 's', 1);
    token.markup = markup;

    token = state.push('text', '', 0);
    token.content = state.src.slice(mem + len, end);

    token = state.push('s_close', 's', -1);
    token.markup = markup;
  }

  state.pos = end + len;
  return true;
});

// Custom renderer rules for Nostr identifiers
const NOSTR_PROFILE_REGEX = /(?<![\w/])((nostr:)?(npub|nprofile)[a-zA-Z0-9]{20,})(?![\w/])/g;
const NOSTR_NOTE_REGEX = /(?<![\w/])((nostr:)?(note|nevent|naddr)[a-zA-Z0-9]{20,})(?![\w/])/g;

// Add custom rule for hashtags
md.inline.ruler.after('emphasis', 'hashtag', (state, silent) => {
  const match = /^#([a-zA-Z0-9_]+)(?!\w)/.exec(state.src.slice(state.pos));
  if (!match) return false;
  
  if (silent) return true;
  
  const tag = match[1];
  state.pos += match[0].length;
  
  const token = state.push('hashtag', '', 0);
  token.content = tag;
  token.markup = '#';
  
  return true;
});

md.renderer.rules.hashtag = (tokens, idx) => {
  const tag = tokens[idx].content;
  return `<span class="text-secondary">#${tag}</span>`;
};

// Override the default link renderer to handle Nostr identifiers and special URLs
const defaultRender = md.renderer.rules.link_open || function(tokens: any[], idx: number, options: any, env: any, self: any): string {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.link_open = function(tokens: any[], idx: number, options: any, env: any, self: any): string {
  const token = tokens[idx];
  const hrefIndex = token.attrIndex('href');
  
  if (hrefIndex >= 0) {
    const href = token.attrs![hrefIndex][1];
    const cleanedHref = cleanUrl(href);
    
    // Handle Nostr identifiers
    if ((NOSTR_PROFILE_REGEX.test(cleanedHref) || NOSTR_NOTE_REGEX.test(cleanedHref)) && !cleanedHref.startsWith('nostr:')) {
      token.attrs![hrefIndex][1] = `nostr:${cleanedHref}`;
    }
    // Handle WebSocket URLs
    else if (WSS_URL.test(cleanedHref)) {
      const cleanUrl = cleanedHref.slice(6).replace(/\/+$/, '');
      token.attrs![hrefIndex][1] = `https://nostrudel.ninja/#/r/wss%3A%2F%2F${cleanUrl}%2F`;
    }
    // Handle media URLs
    else if (YOUTUBE_URL_REGEX.test(cleanedHref)) {
      const videoId = cleanedHref.match(YOUTUBE_URL_REGEX)?.[1];
      if (videoId) {
        return `<div class="videoblock"><div class="content"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe></div></div>`;
      }
    }
    else if (VIDEO_URL_REGEX.test(cleanedHref)) {
      return `<div class="videoblock"><div class="content"><video controls preload="none" playsinline><source src="${cleanedHref}">Your browser does not support the video tag.</video></div></div>`;
    }
    else if (AUDIO_URL_REGEX.test(cleanedHref)) {
      return `<div class="audioblock"><div class="content"><audio controls preload="none"><source src="${cleanedHref}">Your browser does not support the audio tag.</audio></div></div>`;
    }
    else if (IMAGE_URL_REGEX.test(cleanedHref)) {
      return `<div class="imageblock"><div class="content"><img src="${cleanedHref}" alt="Embedded media" loading="lazy" decoding="async"></div></div>`;
    }
    else {
      // Update the href with cleaned URL
      token.attrs![hrefIndex][1] = cleanedHref;
    }
  }
  
  return defaultRender(tokens, idx, options, env, self);
};

// Override image renderer to handle media URLs
const defaultImageRender = md.renderer.rules.image || function(tokens: any[], idx: number, options: any, env: any, self: any): string {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.image = function(tokens: any[], idx: number, options: any, env: any, self: any): string {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  
  if (srcIndex >= 0) {
    const src = token.attrs![srcIndex][1];
    const cleanedSrc = cleanUrl(src);
    const alt = token.attrs![token.attrIndex('alt')]?.[1] || '';
    
    if (YOUTUBE_URL_REGEX.test(cleanedSrc)) {
      const videoId = cleanedSrc.match(YOUTUBE_URL_REGEX)?.[1];
      if (videoId) {
        return `<div class="videoblock"><div class="content"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${alt || 'YouTube video'}" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe></div></div>`;
      }
    }
    
    if (VIDEO_URL_REGEX.test(cleanedSrc)) {
      return `<div class="videoblock"><div class="content"><video controls preload="none" playsinline><source src="${cleanedSrc}">${alt || 'Video'}</video></div></div>`;
    }
    
    if (AUDIO_URL_REGEX.test(cleanedSrc)) {
      return `<div class="audioblock"><div class="content"><audio controls preload="none"><source src="${cleanedSrc}">${alt || 'Audio'}</audio></div></div>`;
    }
    
    // Update the src with cleaned URL
    token.attrs![srcIndex][1] = cleanedSrc;
  }
  
  return defaultImageRender(tokens, idx, options, env, self);
};

// Add custom rule for alternate heading style
md.block.ruler.before('heading', 'alternate_heading', (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const content = state.src.slice(start, max).trim();
  
  // Check if this line is followed by = or - underline
  if (startLine + 1 >= endLine) return false;
  
  const nextStart = state.bMarks[startLine + 1] + state.tShift[startLine + 1];
  const nextMax = state.eMarks[startLine + 1];
  const nextContent = state.src.slice(nextStart, nextMax).trim();
  
  // Check if next line is all = or -
  if (!/^[=-]+$/.test(nextContent)) return false;
  
  // Determine heading level (h1 for =, h2 for -)
  const level = nextContent[0] === '=' ? 1 : 2;
  
  if (silent) return true;
  
  // Create heading token
  state.line = startLine + 2;
  
  const openToken = state.push('heading_open', 'h' + level, 1);
  openToken.markup = '#'.repeat(level);
  
  const inlineToken = state.push('inline', '', 0);
  inlineToken.content = content;
  inlineToken.map = [startLine, startLine + 2];
  
  const closeToken = state.push('heading_close', 'h' + level, -1);
  closeToken.markup = '#'.repeat(level);
  
  return true;
});

// Override the default code inline rule to only support single backticks
md.inline.ruler.after('backticks', 'code_inline', (state, silent) => {
  let start = state.pos;
  let max = state.posMax;
  let marker = state.src.charCodeAt(start);
  
  // Check for single backtick
  if (marker !== 0x60/* ` */) return false;
  
  // Find the end of the code span
  let pos = start + 1;
  
  // Find the closing backtick
  while (pos < max) {
    if (state.src.charCodeAt(pos) === 0x60/* ` */) {
      pos++;
      break;
    }
    pos++;
  }
  
  if (pos >= max) return false;
  
  const content = state.src.slice(start + 1, pos - 1);
  
  if (!content) return false;
  
  if (silent) return true;
  
  state.pos = pos;
  
  const token = state.push('code_inline', 'code', 0);
  token.content = content;
  token.markup = '`';
  
  return true;
});

/**
 * Replace emoji shortcodes in text with Unicode wrapped in <span class="emoji-muted">...</span>
 */
export function replaceEmojisWithUnicode(text: string): string {
  return text.replace(/(:[a-z0-9_\-]+:)/gi, (match) => {
    const unicode = getUnicodeEmoji(match);
    if (unicode) {
      return `<span class=\"emoji-muted\">${unicode}</span>`;
    }
    return match;
  });
}

/**
 * Parse markdown text with markdown-it and custom processing
 */
export async function parseMarkdown(text: string): Promise<string> {
  if (!text) return '';
  
  try {
    // First pass: Process with markdown-it
    let processedText = md.render(text);
    
    // Second pass: Process Nostr identifiers
    processedText = await processNostrIdentifiers(processedText);
    
    // Third pass: Replace emoji shortcodes with Unicode
    processedText = replaceEmojisWithUnicode(processedText);
    
    // Add custom classes to elements
    processedText = processedText
      // Add classes to headings
      .replace(/<h1>/g, '<h1 class="h1-leather">')
      .replace(/<h2>/g, '<h2 class="h2-leather">')
      .replace(/<h3>/g, '<h3 class="h3-leather">')
      .replace(/<h4>/g, '<h4 class="h4-leather">')
      .replace(/<h5>/g, '<h5 class="h5-leather">')
      .replace(/<h6>/g, '<h6 class="h6-leather">')
      // Add classes to paragraphs
      .replace(/<p>/g, '<p class="text-primary">')
      // Add classes to blockquotes
      .replace(/<blockquote>/g, '<blockquote class="quoteblock">')
      // Add classes to code blocks
      .replace(/<pre>/g, '<pre class="listingblock">')
      // Add classes to inline code
      .replace(/<code>/g, '<code class="literalblock">')
      // Add classes to links
      .replace(/<a href=/g, '<a class="link" href=')
      // Add classes to lists
      .replace(/<ul>/g, '<ul class="ulist">')
      .replace(/<ol>/g, '<ol class="olist arabic">')
      // Add classes to list items
      .replace(/<li>/g, '<li class="text-primary">')
      // Add classes to horizontal rules
      .replace(/<hr>/g, '<hr class="border-b border-gray-300 dark:border-gray-600">')
      // Add classes to footnotes
      .replace(/<div class="footnotes">/g, '<div class="footnotes mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">')
      .replace(/<a href="#fnref/g, '<a class="link" href="#fnref')
      .replace(/<a href="#fn-/g, '<a class="link" href="#fn-')
      .replace(/<sup id="fnref/g, '<sup id="fnref" class="text-sm-secondary">')
      .replace(/<li id="fn-/g, '<li id="fn-" class="text-sm-secondary">')
      // Add classes to images
      .replace(/<img/g, '<img class="imageblock"')
      // Add classes to tables
      .replace(/<table>/g, '<table class="tableblock">')
      .replace(/<thead>/g, '<thead class="text-primary">')
      .replace(/<tbody>/g, '<tbody class="text-primary">')
      .replace(/<th>/g, '<th class="text-primary font-semibold">')
      .replace(/<td>/g, '<td class="text-primary">');

    return processedText;
  } catch (error) {
    console.error('Error in parseMarkdown:', error);
    return `<div class="text-red-500">Error processing markdown: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
  }
} 