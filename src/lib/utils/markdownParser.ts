/**
 * Markdown parser with special handling for nostr identifiers
 */

import { get } from 'svelte/store';
import { ndkInstance } from '$lib/ndk';
import { nip19 } from 'nostr-tools';

// Regular expressions for nostr identifiers - process these first
const NOSTR_PROFILE_REGEX = /(?:nostr:)?((?:npub|nprofile)[a-zA-Z0-9]{20,})/g;
const NOSTR_NOTE_REGEX = /(?:nostr:)?((?:nevent|note|naddr)[a-zA-Z0-9]{20,})/g;

// Regular expressions for markdown elements
const BOLD_REGEX = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
const ITALIC_REGEX = /_([^_]+)_/g;
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const HORIZONTAL_RULE_REGEX = /^(?:---|\*\*\*|___)$/gm;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HASHTAG_REGEX = /(?<!\S)#([a-zA-Z0-9_]+)(?!\S)/g;
const FOOTNOTE_REFERENCE_REGEX = /\[(\^[^\]]+)\]/g;
const FOOTNOTE_DEFINITION_REGEX = /^\[(\^[^\]]+)\]:\s*(.+?)(?:\n(?!\[)|\n\n|$)/gm;

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
 * Format code based on language
 */
function formatCodeByLanguage(code: string, lang: string): string {
  const language = lang.trim().toLowerCase();
  
  // Remove any trailing whitespace or empty lines at start/end
  let formattedCode = code.trim();

  switch (language) {
    case 'json':
      try {
        return JSON.stringify(JSON.parse(formattedCode), null, 2);
      } catch (e) {
        return formattedCode;
      }

    case 'javascript':
    case 'js':
    case 'typescript':
    case 'ts':
      try {
        // Basic indentation for JS/TS
        formattedCode = formattedCode
          .split('\n')
          .map(line => line.trim())
          .join('\n');
        
        // Add line breaks after certain characters
        formattedCode = formattedCode
          .replace(/([{([])\s*/g, '$1\n')
          .replace(/\s*([\]})])/g, '\n$1')
          .replace(/;\s*/g, ';\n')
          .replace(/,\s*([^\s])/g, ',\n$1');

        // Indent based on brackets
        let indent = 0;
        return formattedCode
          .split('\n')
          .map(line => {
            line = line.trim();
            if (line.match(/[}\])]$/)) indent--;
            const formatted = '  '.repeat(Math.max(0, indent)) + line;
            if (line.match(/[{([]\s*$/)) indent++;
            return formatted;
          })
          .filter(line => line.trim())
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    case 'html':
    case 'xml':
      try {
        // Basic indentation for HTML/XML
        let indent = 0;
        return formattedCode
          .replace(/></g, '>\n<')
          .split('\n')
          .map(line => {
            line = line.trim();
            if (line.match(/<\/[^>]+>$/)) indent--;
            const formatted = '  '.repeat(Math.max(0, indent)) + line;
            if (line.match(/<[^/][^>]*>$/) && !line.match(/<[^>]+\/>/)) indent++;
            return formatted;
          })
          .filter(line => line.trim())
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    case 'css':
      try {
        // Basic indentation for CSS
        return formattedCode
          .replace(/\s*{\s*/g, ' {\n')
          .replace(/;\s*/g, ';\n')
          .replace(/\s*}\s*/g, '\n}\n')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .map(line => line.startsWith('}') ? line : '  ' + line)
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    case 'python':
    case 'py':
      try {
        // Basic indentation for Python
        let indent = 0;
        return formattedCode
          .split('\n')
          .map(line => {
            line = line.trim();
            if (line.match(/^(return|break|continue|pass|else|elif|except|finally)\b/)) indent--;
            const formatted = '    '.repeat(Math.max(0, indent)) + line;
            if (line.match(/:\s*$/)) indent++;
            return formatted;
          })
          .filter(line => line.trim())
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    case 'cpp':
    case 'c':
    case 'rust':
      try {
        // Basic indentation for C/C++/Rust
        let indent = 0;
        return formattedCode
          .split('\n')
          .map(line => {
            line = line.trim();
            if (line.match(/^[}\])]/) || line.match(/^(public|private|protected):/)) indent--;
            const formatted = '    '.repeat(Math.max(0, indent)) + line;
            if (line.match(/[{[]$/)) indent++;
            return formatted;
          })
          .filter(line => line.trim())
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    case 'php':
      try {
        // Basic indentation for PHP
        let indent = 0;
        return formattedCode
          .split('\n')
          .map(line => {
            line = line.trim();
            if (line.match(/^[}\])]/) || line.match(/^(case|default):/)) indent--;
            const formatted = '    '.repeat(Math.max(0, indent)) + line;
            if (line.match(/[{[]$/) || line.match(/^(case|default):/)) indent++;
            return formatted;
          })
          .filter(line => line.trim())
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    case 'bash':
    case 'shell':
    case 'sh':
      try {
        // Basic formatting for shell scripts
        return formattedCode
          .split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .map(line => {
            if (line.startsWith('#')) return line;
            if (line.endsWith('\\')) return line + '\n';
            if (line.match(/^(if|while|for|case)/)) return line;
            if (line.match(/^(then|do|else|elif)/)) return '  ' + line;
            if (line.match(/^(fi|done|esac)/)) return line;
            return '  ' + line;
          })
          .join('\n');
      } catch (e) {
        return formattedCode;
      }

    default:
      return formattedCode;
  }
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
  let lastWasCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codeBlockStart = line.match(/^```(\w*)$/);
    
    if (codeBlockStart) {
      if (!inCodeBlock) {
        // Starting a new code block
        inCodeBlock = true;
        currentLanguage = codeBlockStart[1];
        currentCode = [];
        lastWasCodeBlock = true;
      } else {
        // Ending current code block
        blockCount++;
        const id = `CODE_BLOCK_${blockCount}`;
        const code = currentCode.join('\n');
        
        blocks.set(id, JSON.stringify({
          code,
          language: currentLanguage,
          raw: true
        }));
        
        processedLines.push('');  // Add spacing before code block
        processedLines.push(id);
        processedLines.push('');  // Add spacing after code block
        inCodeBlock = false;
        currentCode = [];
        currentLanguage = '';
      }
    } else if (inCodeBlock) {
      currentCode.push(line);
    } else {
      if (lastWasCodeBlock && line.trim()) {
        processedLines.push('');
        lastWasCodeBlock = false;
      }
      processedLines.push(line);
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && currentCode.length > 0) {
    blockCount++;
    const id = `CODE_BLOCK_${blockCount}`;
    blocks.set(id, JSON.stringify({
      code: currentCode.join('\n'),
      language: currentLanguage,
      raw: true
    }));
    processedLines.push('');
    processedLines.push(id);
    processedLines.push('');
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
  
  for (const [id, blockData] of blocks) {
    const { code, language } = JSON.parse(blockData);
    
    // Preserve code exactly as it was written
    const html = `<div class="w-full my-4">
      <pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto"><code${language ? ` class="language-${language}"` : ''}>${code}</code></pre>
    </div>`;

    result = result.replace(id, html);
  }

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
      .replace(/'/g, '&#039;')
      .replace(/\\n/g, '&#92;n');
    
    return `<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">${escapedCode}</code>`;
  });
}

/**
 * Process other markdown elements (excluding code)
 */
function processOtherElements(content: string): string {
  // Process blockquotes first
  content = processBlockquotes(content);

  // Process basic markdown elements
  content = content.replace(BOLD_REGEX, '<strong>$1$2</strong>');
  content = content.replace(ITALIC_REGEX, '<em>$1</em>');
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
    .map(para => para.trim())
    .filter(para => para)
    .map(para => para.startsWith('<') ? para : `<p class="my-4 break-words">${para}</p>`)
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
