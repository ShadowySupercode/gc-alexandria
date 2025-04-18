/**
 * Markdown parser with special handling for nostr identifiers
 */

import { get } from 'svelte/store';
import { ndkInstance } from '$lib/ndk';
import { nip19 } from 'nostr-tools';

// Regular expressions for nostr identifiers - process these first
const NOSTR_NPUB_REGEX = /(?:nostr:)?(npub[a-zA-Z0-9]{59,60})/g;

// Regular expressions for markdown elements
const BLOCKQUOTE_REGEX = /^(?:>[ \t]*.+\n?(?:(?:>[ \t]*\n)*(?:>[ \t]*.+\n?))*)+/gm;
const ORDERED_LIST_REGEX = /^(\d+)\.[ \t]+(.+)$/gm;
const UNORDERED_LIST_REGEX = /^[-*][ \t]+(.+)$/gm;
const BOLD_REGEX = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
const ITALIC_REGEX = /_([^_]+)_/g;
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const HORIZONTAL_RULE_REGEX = /^(?:---|\*\*\*|___)$/gm;
const CODE_BLOCK_REGEX = /```([^\n]*)\n([\s\S]*?)```/gm;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HASHTAG_REGEX = /(?<!\S)#([a-zA-Z0-9_]+)(?!\S)/g;
const FOOTNOTE_REFERENCE_REGEX = /\[(\^[^\]]+)\]/g;
const FOOTNOTE_DEFINITION_REGEX = /^\[(\^[^\]]+)\]:\s*(.+?)(?:\n(?!\[)|\n\n|$)/gm;

// Cache for npub metadata
const npubCache = new Map<string, {name?: string, displayName?: string}>();

/**
 * Get user metadata for an npub
 */
async function getUserMetadata(npub: string): Promise<{name?: string, displayName?: string}> {
  if (npubCache.has(npub)) {
    return npubCache.get(npub)!;
  }

  const fallback = { name: `${npub.slice(0, 8)}...${npub.slice(-4)}` };

  try {
    const ndk = get(ndkInstance);
    if (!ndk) {
      npubCache.set(npub, fallback);
      return fallback;
    }

    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') {
      npubCache.set(npub, fallback);
      return fallback;
    }

    const user = ndk.getUser({ npub: npub });
    if (!user) {
      npubCache.set(npub, fallback);
      return fallback;
    }

    try {
      const profile = await user.fetchProfile();
      if (!profile) {
        npubCache.set(npub, fallback);
        return fallback;
      }

      const metadata = {
        name: profile.name || fallback.name,
        displayName: profile.displayName
      };
      
      npubCache.set(npub, metadata);
      return metadata;
    } catch (e) {
      npubCache.set(npub, fallback);
      return fallback;
    }
  } catch (e) {
    npubCache.set(npub, fallback);
    return fallback;
  }
}

/**
 * Process lists (ordered and unordered)
 */
function processLists(html: string): string {
  const lines = html.split('\n');
  let inList = false;
  let isOrdered = false;
  let currentList: string[] = [];
  const processed: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const orderedMatch = ORDERED_LIST_REGEX.exec(line);
    const unorderedMatch = UNORDERED_LIST_REGEX.exec(line);
    
    if (orderedMatch || unorderedMatch) {
      if (!inList) {
        inList = true;
        isOrdered = !!orderedMatch;
        currentList = [];
      }
      const content = orderedMatch ? orderedMatch[2] : unorderedMatch![1];
      currentList.push(content);
    } else {
      if (inList) {
        const listType = isOrdered ? 'ol' : 'ul';
        const listClass = isOrdered ? 'list-decimal' : 'list-disc';
        processed.push(`<${listType} class="${listClass} pl-6 my-4 space-y-1">`);
        currentList.forEach(item => {
          processed.push(`  <li class="ml-4">${item}</li>`);
        });
        processed.push(`</${listType}>`);
        inList = false;
        currentList = [];
      }
      processed.push(line);
    }
    
    // Reset regex lastIndex
    ORDERED_LIST_REGEX.lastIndex = 0;
    UNORDERED_LIST_REGEX.lastIndex = 0;
  }

  if (inList) {
    const listType = isOrdered ? 'ol' : 'ul';
    const listClass = isOrdered ? 'list-decimal' : 'list-disc';
    processed.push(`<${listType} class="${listClass} pl-6 my-4 space-y-1">`);
    currentList.forEach(item => {
      processed.push(`  <li class="ml-4">${item}</li>`);
    });
    processed.push(`</${listType}>`);
  }

  return processed.join('\n');
}

/**
 * Process blockquotes using placeholder approach
 */
function processBlockquotes(text: string): string {
  const blockquotes: Array<{id: string, content: string}> = [];
  let processedText = text;

  // Extract and save blockquotes
  processedText = processedText.replace(BLOCKQUOTE_REGEX, (match) => {
    const id = `BLOCKQUOTE_${blockquotes.length}`;
    const cleanContent = match
      .split('\n')
      .map(line => line.replace(/^>[ \t]*/, ''))
      .join('\n')
      .trim();

    blockquotes.push({
      id,
      content: `<blockquote class="pl-4 py-2 my-4 border-l-4 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 rounded-r">${cleanContent}</blockquote>`
    });
    return id;
  });

  // Restore blockquotes
  blockquotes.forEach(({id, content}) => {
    processedText = processedText.replace(id, content);
  });

  return processedText;
}

/**
 * Process code blocks and inline code before any HTML escaping
 */
function processCode(text: string): string {
  const blocks: Array<{id: string, content: string}> = [];
  const inlineCodes: Array<{id: string, content: string}> = [];
  let processedText = text;

  // First, extract and save code blocks
  processedText = processedText.replace(CODE_BLOCK_REGEX, (match, lang, code) => {
    const id = `CODE_BLOCK_${blocks.length}`;
    blocks.push({
      id,
      content: `<pre><code${lang ? ` class="language-${lang.trim()}"` : ''}>${escapeHtml(code)}</code></pre>`
    });
    return id;
  });

  // Then extract and save inline code
  processedText = processedText.replace(INLINE_CODE_REGEX, (match, code) => {
    const id = `INLINE_CODE_${inlineCodes.length}`;
    inlineCodes.push({
      id,
      content: `<code>${escapeHtml(code.trim())}</code>`
    });
    return id;
  });

  // Now escape HTML in the remaining text
  processedText = escapeHtml(processedText);

  // Restore code blocks
  blocks.forEach(({id, content}) => {
    processedText = processedText.replace(escapeHtml(id), content);
  });

  // Restore inline code
  inlineCodes.forEach(({id, content}) => {
    processedText = processedText.replace(escapeHtml(id), content);
  });

  return processedText;
}

/**
 * Process footnotes with minimal spacing
 */
function processFootnotes(text: string): { text: string, footnotes: Map<string, string> } {
  const footnotes = new Map<string, string>();
  let counter = 0;

  // Extract footnote definitions
  text = text.replace(FOOTNOTE_DEFINITION_REGEX, (match, id, content) => {
    const cleanId = id.replace('^', '');
    footnotes.set(cleanId, content.trim());
    return '';
  });

  // Replace references
  text = text.replace(FOOTNOTE_REFERENCE_REGEX, (match, id) => {
    const cleanId = id.replace('^', '');
    if (footnotes.has(cleanId)) {
      counter++;
      return `<sup><a href="#footnote-${cleanId}" id="ref-${cleanId}" class="text-blue-600 hover:underline scroll-mt-32">[${counter}]</a></sup>`;
    }
    return match;
  });

  // Add footnotes section if we have any
  if (footnotes.size > 0) {
    text += '\n<div class="footnotes mt-8 pt-4 border-t border-gray-300 dark:border-gray-600">';
    text += '<ol class="list-decimal pl-6 space-y-0.5">';
    counter = 0;
    
    for (const [id, content] of footnotes.entries()) {
      counter++;
      text += `<li id="footnote-${id}" class="text-sm text-gray-600 dark:text-gray-400 scroll-mt-32">${content}<a href="#ref-${id}" class="text-blue-600 hover:underline ml-1 scroll-mt-32">↩</a></li>`;
    }
    
    text += '</ol></div>';
  }

  return { text, footnotes };
}

/**
 * Parse markdown text to HTML with special handling for nostr identifiers
 */
export async function parseMarkdown(text: string): Promise<string> {
  if (!text) return '';

  // First, process code blocks (protect these from HTML escaping)
  let html = processCode(text); // still escape HTML *inside* code blocks

  // 👉 NEW: process blockquotes *before* the rest of HTML is escaped
  html = processBlockquotes(html);

  // Process nostr identifiers
  const npubMatches = Array.from(html.matchAll(NOSTR_NPUB_REGEX));
  const npubPromises = npubMatches.map(async match => {
    const [fullMatch, npub] = match;
    const metadata = await getUserMetadata(npub);
    const displayText = metadata.displayName || metadata.name || `${npub.slice(0, 8)}...${npub.slice(-4)}`;
    return { fullMatch, npub, displayText };
  });

  const npubResults = await Promise.all(npubPromises);
  for (const { fullMatch, npub, displayText } of npubResults) {
    html = html.replace(
      fullMatch,
      `<a href="https://njump.me/${npub}" target="_blank" class="text-blue-600 hover:underline" title="${npub}">@${displayText}</a>`
    );
  }

  // Process lists
  html = processLists(html);

  // Process footnotes
  const { text: processedHtml } = processFootnotes(html);
  html = processedHtml;

  // Process basic markdown elements
  html = html.replace(BOLD_REGEX, '<strong>$1$2</strong>');
  html = html.replace(ITALIC_REGEX, '<em>$1</em>');
  html = html.replace(HEADING_REGEX, (match, hashes, content) => {
    const level = hashes.length;
    const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs'];
    return `<h${level} class="${sizes[level-1]} font-bold mt-4 mb-2">${content.trim()}</h${level}>`;
  });

  // Process links and images
  html = html.replace(IMAGE_REGEX, '<img src="$2" alt="$1" class="max-w-full h-auto rounded">');
  html = html.replace(LINK_REGEX, '<a href="$2" target="_blank" class="text-blue-600 hover:underline">$1</a>');

  // Process hashtags
  html = html.replace(HASHTAG_REGEX, '<span class="text-gray-500 dark:text-gray-400">#$1</span>');

  // Process horizontal rules
  html = html.replace(HORIZONTAL_RULE_REGEX, '<hr class="my-6 border-t-2 border-gray-300 dark:border-gray-600">');

  // Handle paragraphs and line breaks
  html = html.replace(/\n{2,}/g, '</p><p class="my-4">');
  html = html.replace(/\n/g, '<br>');

  // Wrap content in paragraph if needed
  if (!html.startsWith('<')) {
    html = `<p class="my-4">${html}</p>`;
  }

  return html;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape special characters in a string for use in a regular expression
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
