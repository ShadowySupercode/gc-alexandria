import { processNostrIdentifiers } from './nostrUtils';

// Regular expressions for basic markdown elements
const BOLD_REGEX = /(\*\*|[*])((?:[^*\n]|\*(?!\*))+)\1/g;
const ITALIC_REGEX = /\b(_[^_\n]+_|\b__[^_\n]+__)\b/g;
const STRIKETHROUGH_REGEX = /~~([^~\n]+)~~|~([^~\n]+)~/g;
const HASHTAG_REGEX = /(?<![^\s])#([a-zA-Z0-9_]+)(?!\w)/g;
const BLOCKQUOTE_REGEX = /^([ \t]*>[ \t]?.*)(?:\n\1[ \t]*(?!>).*)*$/gm;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;

interface ListItem {
  type: 'ul' | 'ol';
  indent: number;
  content: string;
  marker: string;
}

// HTML escape function
function escapeHtml(text: string): string {
  const htmlEscapes: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Process paragraphs and line breaks
 */
function processParagraphs(content: string): string {
  try {
    if (!content) return '';
    
    // Split content into paragraphs (double line breaks)
    const paragraphs = content.split(/\n\s*\n/);
    
    // Process each paragraph
    return paragraphs.map(para => {
      if (!para.trim()) return '';
      
      // Handle single line breaks within paragraphs
      const lines = para.split('\n');
      
      // Join lines with normal line breaks and add br after paragraph
      return `<p>${lines.join('\n')}</p><br>`;
    }).filter(Boolean).join('\n');
  } catch (error) {
    console.error('Error in processParagraphs:', error);
    return content;
  }
}

/**
 * Process basic text formatting (bold, italic, strikethrough, hashtags, inline code)
 */
function processBasicFormatting(content: string): string {
  try {
    if (!content) return '';
    
    // Process bold first to avoid conflicts
    content = content.replace(BOLD_REGEX, '<strong>$2</strong>');
    
    // Then process italic, handling both single and double underscores
    content = content.replace(ITALIC_REGEX, match => {
      const text = match.replace(/^_+|_+$/g, '');
      return `<em>${text}</em>`;
    });
    
    // Then process strikethrough, handling both single and double tildes
    content = content.replace(STRIKETHROUGH_REGEX, (match, doubleText, singleText) => {
      const text = doubleText || singleText;
      return `<del class="line-through">${text}</del>`;
    });
    
    // Finally process hashtags - style them with a lighter color
    content = content.replace(HASHTAG_REGEX, '<span class="text-gray-500 dark:text-gray-400">#$1</span>');
    
    // Process inline code
    content = content.replace(INLINE_CODE_REGEX, '<code class="bg-gray-200 dark:bg-gray-800/80 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700">$1</code>');
    
    return content;
  } catch (error) {
    console.error('Error in processBasicFormatting:', error);
    return content;
  }
}

/**
 * Process blockquotes
 */
function processBlockquotes(content: string): string {
  try {
    if (!content) return '';
    
    return content.replace(BLOCKQUOTE_REGEX, match => {
      // Split into lines and process each line
      const lines = match.split('\n').map(line => {
        // Remove the '>' marker and trim any whitespace after it
        return line.replace(/^[ \t]*>[ \t]?/, '').trim();
      });
      
      // Join the lines with proper spacing and wrap in blockquote
      return `<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">${
        lines.join('\n')
      }</blockquote>`;
    });
  } catch (error) {
    console.error('Error in processBlockquotes:', error);
    return content;
  }
}

/**
 * Calculate indentation level from spaces
 */
function getIndentLevel(spaces: string): number {
  return Math.floor(spaces.length / 2);
}

/**
 * Process lists (ordered and unordered)
 */
function processLists(content: string): string {
  const lines = content.split('\n');
  const processed: string[] = [];
  const listStack: { type: 'ol' | 'ul', items: string[], level: number }[] = [];
  
  function closeList() {
    if (listStack.length > 0) {
      const list = listStack.pop()!;
      const listType = list.type;
      const listClass = listType === 'ol' ? 'list-decimal' : 'list-disc';
      const indentClass = list.level > 0 ? 'ml-6' : 'ml-4';
      let listHtml = `<${listType} class="${listClass} ${indentClass} my-2 space-y-2">`;
      list.items.forEach(item => {
        listHtml += `\n  <li class="pl-1">${item}</li>`;
      });
      listHtml += `\n</${listType}>`;
      
      if (listStack.length > 0) {
        // If we're in a nested list, add this as an item to the parent
        const parentList = listStack[listStack.length - 1];
        const lastItem = parentList.items.pop()!;
        parentList.items.push(lastItem + '\n' + listHtml);
      } else {
        processed.push(listHtml);
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Count leading spaces to determine nesting level
    const leadingSpaces = line.match(/^(\s*)/)?.[0]?.length ?? 0;
    const effectiveLevel = Math.floor(leadingSpaces / 2); // 2 spaces per level
    
    // Trim the line and check for list markers
    const trimmedLine = line.trim();
    const orderedMatch = trimmedLine.match(/^(\d+)\.[ \t]+(.+)$/);
    const unorderedMatch = trimmedLine.match(/^[-*][ \t]+(.+)$/);

    if (orderedMatch || unorderedMatch) {
      const content = orderedMatch ? orderedMatch[2] : (unorderedMatch && unorderedMatch[1]) || '';
      const type = orderedMatch ? 'ol' : 'ul';

      // Close any lists that are at a deeper level
      while (listStack.length > 0 && listStack[listStack.length - 1].level > effectiveLevel) {
        closeList();
      }

      // If we're at a new level, start a new list
      if (listStack.length === 0 || listStack[listStack.length - 1].level < effectiveLevel) {
        listStack.push({ type, items: [], level: effectiveLevel });
      }
      // If we're at the same level but different type, close the current list and start a new one
      else if (listStack[listStack.length - 1].type !== type && listStack[listStack.length - 1].level === effectiveLevel) {
        closeList();
        listStack.push({ type, items: [], level: effectiveLevel });
      }

      // Add the item to the current list
      listStack[listStack.length - 1].items.push(content);
    } else {
      // Not a list item - close all open lists and add the line
      while (listStack.length > 0) {
        closeList();
      }
      processed.push(line);
    }
  }

  // Close any remaining open lists
  while (listStack.length > 0) {
    closeList();
  }

  return processed.join('\n');
}

/**
 * Parse markdown text with basic formatting
 */
export async function parseBasicMarkdown(text: string): Promise<string> {
  try {
    if (!text) return '';
    
    let processedText = text;

    // Process lists first to handle indentation properly
    processedText = processLists(processedText);

    // Process blockquotes next
    processedText = processBlockquotes(processedText);

    // Process paragraphs
    processedText = processParagraphs(processedText);

    // Process basic text formatting
    processedText = processBasicFormatting(processedText);

    // Process Nostr identifiers last
    processedText = await processNostrIdentifiers(processedText);

    return processedText;
  } catch (error) {
    console.error('Error in parseBasicMarkdown:', error);
    if (error instanceof Error) {
      return `<div class="text-red-500">Error processing markdown: ${error.message}</div>`;
    }
    return '<div class="text-red-500">An error occurred while processing the markdown</div>';
  }
} 