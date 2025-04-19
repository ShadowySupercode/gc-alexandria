/**
 * Markdown parser with special handling for nostr identifiers
 */

import { get } from 'svelte/store';
import { ndkInstance } from '$lib/ndk';
import { nip19 } from 'nostr-tools';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

// Regular expressions for nostr identifiers - process these first
const NOSTR_PROFILE_REGEX = /(?:nostr:)?((?:npub|nprofile)[a-zA-Z0-9]{20,})/g;
const NOSTR_NOTE_REGEX = /(?:nostr:)?((?:nevent|note|naddr)[a-zA-Z0-9]{20,})/g;

// Regular expressions for markdown elements
const BOLD_REGEX = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
const ITALIC_REGEX = /_([^_]+)_/g;
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const ALTERNATE_HEADING_REGEX = /^(.+)\n([=]{3,}|-{3,})$/gm;
const HORIZONTAL_RULE_REGEX = /^(?:---|\*\*\*|___)$/gm;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HASHTAG_REGEX = /(?<!\S)#([a-zA-Z0-9_]+)(?!\S)/g;
const FOOTNOTE_REFERENCE_REGEX = /\[(\^[^\]]+)\]/g;
const FOOTNOTE_DEFINITION_REGEX = /^\[(\^[^\]]+)\]:\s*(.+?)(?:\n(?!\[)|\n\n|$)/gm;
const TABLE_REGEX = /^\|(.+)\|\r?\n\|([-|\s]+)\|\r?\n((?:\|.+\|\r?\n?)+)$/gm;
const TABLE_ROW_REGEX = /^\|(.+)\|$/gm;
const TABLE_DELIMITER_REGEX = /^[\s-]+$/;

// Cache for npub metadata
const npubCache = new Map<string, {name?: string, displayName?: string}>();

/**
 * Get user metadata for a nostr identifier (npub or nprofile)
 */
async function getUserMetadata(identifier: string): Promise<{name?: string, displayName?: string}> {
  if (npubCache.has(identifier)) {
    return npubCache.get(identifier)!;
  }

  const fallback = { name: `${identifier.slice(0, 8)}...${identifier.slice(-4)}` };

  try {
    const ndk = get(ndkInstance);
    if (!ndk) {
      npubCache.set(identifier, fallback);
      return fallback;
    }

    const decoded = nip19.decode(identifier);
    if (!decoded) {
      npubCache.set(identifier, fallback);
      return fallback;
    }

    // Handle different identifier types
    let pubkey: string;
    if (decoded.type === 'npub') {
      pubkey = decoded.data;
    } else if (decoded.type === 'nprofile') {
      pubkey = decoded.data.pubkey;
    } else {
      npubCache.set(identifier, fallback);
      return fallback;
    }

    const user = ndk.getUser({ pubkey: pubkey });
    if (!user) {
      npubCache.set(identifier, fallback);
      return fallback;
    }

    try {
      const profile = await user.fetchProfile();
      if (!profile) {
        npubCache.set(identifier, fallback);
        return fallback;
      }

      const metadata = {
        name: profile.name || fallback.name,
        displayName: profile.displayName
      };
      
      npubCache.set(identifier, metadata);
      return metadata;
    } catch (e) {
      npubCache.set(identifier, fallback);
      return fallback;
    }
  } catch (e) {
    npubCache.set(identifier, fallback);
    return fallback;
  }
}

/**
 * Process lists (ordered and unordered)
 */
function processLists(content: string): string {
  const lines = content.split('\n');
  let inList = false;
  let isOrdered = false;
  let currentList: string[] = [];
  const processed: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const orderedMatch = line.match(/^(\d+)\.[ \t]+(.+)$/);
    const unorderedMatch = line.match(/^\*[ \t]+(.+)$/);
    
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
 * Process blockquotes by finding consecutive quote lines and preserving their structure
 */
function processBlockquotes(text: string): string {
  const lines = text.split('\n');
  const processedLines: string[] = [];
  let currentQuote: string[] = [];
  let quoteCount = 0;
  let lastLineWasQuote = false;
  const blockquotes: Array<{id: string, content: string}> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isQuoteLine = line.startsWith('> ');
    
    if (isQuoteLine) {
      // If we had a gap between quotes, this is a new quote
      if (!lastLineWasQuote && currentQuote.length > 0) {
        quoteCount++;
        const id = `BLOCKQUOTE_${quoteCount}`;
        const quoteContent = currentQuote.join('<br>');
        blockquotes.push({
          id,
          content: `<div class="my-4 border-l-2 border-gray-300 dark:border-gray-600 pl-4 bg-gray-50 dark:bg-gray-800/50 rounded-r py-2"><p class="my-2">${quoteContent}</p></div>`
        });
        processedLines.push(id);
        currentQuote = [];
      }
      
      // Add to current quote
      currentQuote.push(line.substring(2));
      lastLineWasQuote = true;
    } else {
      // If we were in a quote and now we're not, process it
      if (currentQuote.length > 0) {
        quoteCount++;
        const id = `BLOCKQUOTE_${quoteCount}`;
        const quoteContent = currentQuote.join('<br>');
        blockquotes.push({
          id,
          content: `<div class="my-4 border-l-2 border-gray-300 dark:border-gray-600 pl-4 bg-gray-50 dark:bg-gray-800/50 rounded-r py-2"><p class="my-2">${quoteContent}</p></div>`
        });
        processedLines.push(id);
        currentQuote = [];
      }
      processedLines.push(line);
      lastLineWasQuote = false;
    }
  }

  // Handle any remaining quote
  if (currentQuote.length > 0) {
    quoteCount++;
    const id = `BLOCKQUOTE_${quoteCount}`;
    const quoteContent = currentQuote.join('<br>');
    blockquotes.push({
      id,
      content: `<div class="my-4 border-l-2 border-gray-300 dark:border-gray-600 pl-4 bg-gray-50 dark:bg-gray-800/50 rounded-r py-2"><p class="my-2">${quoteContent}</p></div>`
    });
    processedLines.push(id);
  }

  let result = processedLines.join('\n');

  // Restore blockquotes
  blockquotes.forEach(({id, content}) => {
    result = result.replace(id, content);
  });

  return result;
}

/**
 * Process code blocks by finding consecutive code lines and preserving their content
 */
function processCodeBlocks(text: string): { text: string; blocks: Map<string, string> } {
  const lines = text.split('\n');
  const processedLines: string[] = [];
  const blocks = new Map<string, string>();
  let inCodeBlock = false;
  let currentCode: string[] = [];
  let currentLanguage = '';
  let blockCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codeBlockStart = line.match(/^```(\w*)$/);
    
    if (codeBlockStart) {
      if (!inCodeBlock) {
        // Starting a new code block
        inCodeBlock = true;
        currentLanguage = codeBlockStart[1];
        currentCode = [];
      } else {
        // Ending current code block
        blockCount++;
        const id = `CODE-BLOCK-${blockCount}`;
        const code = currentCode.join('\n');
        
        // Store the raw code and language for later processing
        blocks.set(id, JSON.stringify({
          code,
          language: currentLanguage
        }));
        
        processedLines.push(id);
        inCodeBlock = false;
        currentLanguage = '';
        currentCode = [];
      }
    } else if (inCodeBlock) {
      currentCode.push(line);
    } else {
      processedLines.push(line);
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && currentCode.length > 0) {
    blockCount++;
    const id = `CODE-BLOCK-${blockCount}`;
    const code = currentCode.join('\n');
    
    blocks.set(id, JSON.stringify({
      code,
      language: currentLanguage
    }));
    processedLines.push(id);
  }

  return {
    text: processedLines.join('\n'),
    blocks
  };
}

/**
 * Restore code blocks with proper formatting
 */
function restoreCodeBlocks(text: string, blocks: Map<string, string>): string {
  let result = text;
  blocks.forEach((blockContent, id) => {
    const { code, language } = JSON.parse(blockContent);
    let processedCode = code;
    
    // First escape HTML characters
    processedCode = processedCode
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Format and highlight based on language
    if (language === 'json') {
      try {
        // Parse and format JSON
        const parsed = JSON.parse(code);
        processedCode = JSON.stringify(parsed, null, 2)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        // Apply JSON syntax highlighting
        processedCode = processedCode
          // Match JSON keys (including colons)
          .replace(/(&quot;[^&quot;]+&quot;):/g, '<span class="json-key">$1</span>:')
          // Match string values (after colons and in arrays)
          .replace(/: (&quot;[^&quot;]+&quot;)/g, ': <span class="json-string">$1</span>')
          .replace(/\[(&quot;[^&quot;]+&quot;)/g, '[<span class="json-string">$1</span>')
          .replace(/, (&quot;[^&quot;]+&quot;)/g, ', <span class="json-string">$1</span>')
          // Match numbers
          .replace(/: (-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
          .replace(/\[(-?\d+\.?\d*)/g, '[<span class="json-number">$1</span>')
          .replace(/, (-?\d+\.?\d*)/g, ', <span class="json-number">$1</span>')
          // Match booleans
          .replace(/: (true|false)\b/g, ': <span class="json-boolean">$1</span>')
          // Match null
          .replace(/: (null)\b/g, ': <span class="json-null">$1</span>');
      } catch (e) {
        // If JSON parsing fails, use the original escaped code
        console.warn('Failed to parse JSON:', e);
      }
    } else if (language) {
      // Use highlight.js for other languages
      try {
        if (hljs.getLanguage(language)) {
          const highlighted = hljs.highlight(processedCode, { language });
          processedCode = highlighted.value;
        }
      } catch (e) {
        console.warn('Failed to apply syntax highlighting:', e);
      }
    }

    const languageClass = language ? ` language-${language}` : '';
    const replacement = `<pre class="code-block" data-language="${language || ''}"><code class="hljs${languageClass}">${processedCode}</code></pre>`;
    result = result.replace(id, replacement);
  });
  return result;
}

/**
 * Process inline code
 */
function processInlineCode(text: string): string {
  return text.replace(INLINE_CODE_REGEX, (match, code) => {
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    return `<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">${escapedCode}</code>`;
  });
}

/**
 * Process markdown tables
 */
function processTables(content: string): string {
  return content.replace(TABLE_REGEX, (match, headerRow, delimiterRow, bodyRows) => {
    // Process header row
    const headers: string[] = headerRow
      .split('|')
      .map((cell: string) => cell.trim())
      .filter((cell: string) => cell.length > 0);

    // Validate delimiter row (should contain only dashes and spaces)
    const delimiters: string[] = delimiterRow
      .split('|')
      .map((cell: string) => cell.trim())
      .filter((cell: string) => cell.length > 0);

    if (!delimiters.every(d => TABLE_DELIMITER_REGEX.test(d))) {
      return match;
    }

    // Process body rows
    const rows: string[][] = bodyRows
      .trim()
      .split('\n')
      .map((row: string) => {
        return row
          .split('|')
          .map((cell: string) => cell.trim())
          .filter((cell: string) => cell.length > 0);
      })
      .filter((row: string[]) => row.length > 0);

    // Generate HTML table with leather theme styling and thicker grid lines
    let table = '<div class="my-6 overflow-x-auto rounded-lg border-2 border-gray-300 dark:border-gray-600">\n';
    table += '<table class="min-w-full border-collapse">\n';
    
    // Add header with leather theme styling
    table += '<thead class="bg-gray-100 dark:bg-gray-800">\n<tr>\n';
    headers.forEach((header: string) => {
      table += `<th class="px-6 py-3 text-left text-sm font-semibold text-gray-800 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600">${header}</th>\n`;
    });
    table += '</tr>\n</thead>\n';
    
    // Add body with leather theme styling
    table += '<tbody class="bg-primary-0 dark:bg-primary-1000">\n';
    rows.forEach((row: string[], index: number) => {
      table += `<tr class="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">\n`;
      row.forEach((cell: string) => {
        table += `<td class="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap border-2 border-gray-300 dark:border-gray-600">${cell}</td>\n`;
      });
      table += '</tr>\n';
    });
    table += '</tbody>\n</table>\n</div>';
    
    return table;
  });
}

/**
 * Process other markdown elements (excluding code)
 */
function processOtherElements(content: string): string {
  // Process blockquotes first
  content = processBlockquotes(content);

  // Process tables before other elements
  content = processTables(content);

  // Process basic markdown elements
  content = content.replace(BOLD_REGEX, '<strong>$1$2</strong>');
  content = content.replace(ITALIC_REGEX, '<em>$1</em>');
  
  // Process alternate heading syntax first (=== or ---)
  content = content.replace(ALTERNATE_HEADING_REGEX, (match, content, level) => {
    const headingLevel = level.startsWith('=') ? 1 : 2;
    const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs'];
    return `<h${headingLevel} class="${sizes[headingLevel-1]} font-bold mt-4 mb-2">${content.trim()}</h${headingLevel}>`;
  });
  
  // Process standard heading syntax (#)
  content = content.replace(HEADING_REGEX, (match, hashes, content) => {
    const level = hashes.length;
    const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs'];
    return `<h${level} class="${sizes[level-1]} font-bold mt-4 mb-2">${content.trim()}</h${level}>`;
  });

  // Process links and images with standardized styling
  content = content.replace(IMAGE_REGEX, '<img src="$2" alt="$1" class="max-w-full h-auto rounded">');
  content = content.replace(LINK_REGEX, '<a href="$2" target="_blank" class="hover:underline text-primary-600 dark:text-primary-500">$1</a>');

  // Process hashtags with standardized styling
  content = content.replace(HASHTAG_REGEX, '<span class="text-gray-500 dark:text-gray-400">#$1</span>');
  
  // Process horizontal rules
  content = content.replace(HORIZONTAL_RULE_REGEX, '<hr class="my-6 border-t-2 border-gray-300 dark:border-gray-600">');

  return content;
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

  // Replace references with standardized styling
  text = text.replace(FOOTNOTE_REFERENCE_REGEX, (match, id) => {
    const cleanId = id.replace('^', '');
    if (footnotes.has(cleanId)) {
      counter++;
      return `<sup><a href="#footnote-${cleanId}" id="ref-${cleanId}" class="hover:underline text-primary-600 dark:text-primary-500 scroll-mt-32">[${counter}]</a></sup>`;
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
      text += `<li id="footnote-${id}" class="text-sm text-gray-600 dark:text-gray-400 scroll-mt-32">${content}<a href="#ref-${id}" class="hover:underline text-primary-600 dark:text-primary-500 ml-1 scroll-mt-32">↩</a></li>`;
    }
    
    text += '</ol></div>';
  }

  return { text, footnotes };
}

/**
 * Process nostr identifiers
 */
async function processNostrIdentifiers(content: string): Promise<string> {
  let processedContent = content;

  // Process profiles (npub and nprofile)
  const profileMatches = Array.from(content.matchAll(NOSTR_PROFILE_REGEX));
  for (const match of profileMatches) {
    const [fullMatch, identifier] = match;
    const metadata = await getUserMetadata(identifier);
    const displayText = metadata.displayName || metadata.name || `${identifier.slice(0, 8)}...${identifier.slice(-4)}`;
    const escapedId = identifier
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const escapedDisplayText = displayText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // Create a link with standardized styling
    const link = `<a href="https://njump.me/${escapedId}" target="_blank" class="hover:underline text-primary-600 dark:text-primary-500 items-center" title="${escapedId}">@${escapedDisplayText}</a>`;
    
    // Replace only the exact match to preserve surrounding text
    processedContent = processedContent.replace(fullMatch, link);
  }

  // Process notes (nevent, note, naddr)
  const noteMatches = Array.from(processedContent.matchAll(NOSTR_NOTE_REGEX));
  for (const match of noteMatches) {
    const [fullMatch, identifier] = match;
    const shortId = identifier.slice(0, 12) + '...' + identifier.slice(-8);
    const escapedId = identifier
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // Create a link with standardized styling
    const link = `<a href="https://njump.me/${escapedId}" target="_blank" class="hover:underline text-primary-600 dark:text-primary-500 break-all items-center" title="${escapedId}">${shortId}</a>`;
    
    // Replace only the exact match to preserve surrounding text
    processedContent = processedContent.replace(fullMatch, link);
  }

  return processedContent;
}

/**
 * Parse markdown text to content with special handling for nostr identifiers
 */
export async function parseMarkdown(text: string): Promise<string> {
  if (!text) return '';

  // First extract and save code blocks
  const { text: withoutCode, blocks } = processCodeBlocks(text);

  // Process nostr identifiers
  let content = await processNostrIdentifiers(withoutCode);

  // Process blockquotes
  content = processBlockquotes(content);

  // Process lists
  content = processLists(content);

  // Process other markdown elements
  content = processOtherElements(content);

  // Process inline code (after other elements to prevent conflicts)
  content = processInlineCode(content);

  // Process footnotes
  const { text: processedContent } = processFootnotes(content);
  content = processedContent;

  // Handle paragraphs and line breaks, preserving existing HTML
  content = content
    .split(/\n{2,}/)
    .map((para: string) => para.trim())
    .filter((para: string) => para)
    .map((para: string) => para.startsWith('<') ? para : `<p class="my-4 break-words">${para}</p>`)
    .join('\n\n');

  // Finally, restore code blocks
  content = restoreCodeBlocks(content, blocks);

  return content;
}

/**
 * Escape special characters in a string for use in a regular expression
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processCode(text: string): string {
  // Process code blocks with language specification
  text = text.replace(/```(\w+)?\n([\s\S]+?)\n```/g, (match, lang, code) => {
    if (lang === 'json') {
      try {
        const parsed = JSON.parse(code.trim());
        code = JSON.stringify(parsed, null, 2);
        // Add syntax highlighting classes for JSON
        code = code.replace(/"([^"]+)":/g, '"<span class="json-key">$1</span>":') // keys
          .replace(/"([^"]+)"/g, '"<span class="json-string">$1</span>"') // strings
          .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>') // booleans
          .replace(/\b(null)\b/g, '<span class="json-null">$1</span>') // null
          .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-number">$1</span>'); // numbers
      } catch (e) {
        // If JSON parsing fails, use the original code
      }
    }
    return `<div class="code-block" data-language="${lang || ''}">${code}</div>`;
  });

  // Process inline code
  text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  return text;
}
