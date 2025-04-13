/**
 * Basic Markdown parser for Nostr notes
 * Supports:
 * - Bold (with * or **)
 * - Italic (with _)
 * - Bullet points and numbered lists (including nesting)
 * - Headers (with #)
 * - Hyperlinks (with []()), preserving Nostr URLs
 * - Images (with ![]()), rendering as img tags
 * - Quotes (with >)
 */

/**
 * Parse Markdown text to HTML
 * @param text The Markdown text to parse
 * @returns HTML string
 */
export function parseMarkdown(text: string): string {
  if (!text) return '';
  
  // Process the text line by line for block elements
  const lines = text.split('\n');
  let inList = false;
  let listType = '';
  let listLevel = 0;
  let inQuote = false;
  
  const processedLines = lines.map((line, index) => {
    // Headers
    if (line.startsWith('# ')) {
      return `<h1>${processInlineMarkdown(line.substring(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      return `<h2>${processInlineMarkdown(line.substring(3))}</h2>`;
    } else if (line.startsWith('### ')) {
      return `<h3>${processInlineMarkdown(line.substring(4))}</h3>`;
    } else if (line.startsWith('#### ')) {
      return `<h4>${processInlineMarkdown(line.substring(5))}</h4>`;
    } else if (line.startsWith('##### ')) {
      return `<h5>${processInlineMarkdown(line.substring(6))}</h5>`;
    } else if (line.startsWith('###### ')) {
      return `<h6>${processInlineMarkdown(line.substring(7))}</h6>`;
    }
    
    // Quotes
    if (line.startsWith('> ')) {
      const quoteContent = processInlineMarkdown(line.substring(2));
      if (!inQuote) {
        inQuote = true;
        return `<blockquote>${quoteContent}`;
      } else {
        return quoteContent;
      }
    } else if (inQuote) {
      inQuote = false;
      return `</blockquote>${processInlineMarkdown(line)}`;
    }
    
    // Lists
    const bulletMatch = line.match(/^(\s*)[-*+]\s(.+)$/);
    const numberedMatch = line.match(/^(\s*)\d+\.\s(.+)$/);
    
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const content = processInlineMarkdown(bulletMatch[2]);
      const newLevel = Math.floor(indent / 2) + 1;
      
      let result = '';
      
      if (!inList) {
        // Start a new list
        inList = true;
        listType = 'ul';
        listLevel = newLevel;
        result = `<ul><li>${content}`;
      } else if (listType === 'ul') {
        // Continue the unordered list
        if (newLevel > listLevel) {
          // Nested list
          result = `<ul><li>${content}`;
          listLevel = newLevel;
        } else if (newLevel < listLevel) {
          // End nested list
          result = `</li></ul>`.repeat(listLevel - newLevel) + `</li><li>${content}`;
          listLevel = newLevel;
        } else {
          // Same level
          result = `</li><li>${content}`;
        }
      } else {
        // Switch from ordered to unordered list
        result = `</li></ol><ul><li>${content}`;
        listType = 'ul';
        listLevel = newLevel;
      }
      
      return result;
    } else if (numberedMatch) {
      const indent = numberedMatch[1].length;
      const content = processInlineMarkdown(numberedMatch[2]);
      const newLevel = Math.floor(indent / 2) + 1;
      
      let result = '';
      
      if (!inList) {
        // Start a new list
        inList = true;
        listType = 'ol';
        listLevel = newLevel;
        result = `<ol><li>${content}`;
      } else if (listType === 'ol') {
        // Continue the ordered list
        if (newLevel > listLevel) {
          // Nested list
          result = `<ol><li>${content}`;
          listLevel = newLevel;
        } else if (newLevel < listLevel) {
          // End nested list
          result = `</li></ol>`.repeat(listLevel - newLevel) + `</li><li>${content}`;
          listLevel = newLevel;
        } else {
          // Same level
          result = `</li><li>${content}`;
        }
      } else {
        // Switch from unordered to ordered list
        result = `</li></ul><ol><li>${content}`;
        listType = 'ol';
        listLevel = newLevel;
      }
      
      return result;
    } else if (inList) {
      // End the list if we're not in a list item anymore
      inList = false;
      const endTags = listType === 'ul' ? '</li></ul>' : '</li></ol>';
      return endTags.repeat(listLevel) + processInlineMarkdown(line);
    }
    
    // Regular paragraph
    if (line.trim() === '') {
      return line; // Keep empty lines
    } else {
      return processInlineMarkdown(line);
    }
  });
  
  // Close any open lists or quotes
  let result = processedLines.join('\n');
  if (inList) {
    const endTags = listType === 'ul' ? '</li></ul>' : '</li></ol>';
    result += endTags.repeat(listLevel);
  }
  if (inQuote) {
    result += '</blockquote>';
  }
  
  return result;
}

/**
 * Process inline Markdown elements
 * @param text The text to process
 * @returns Processed HTML string
 */
function processInlineMarkdown(text: string): string {
  if (!text) return '';
  
  // Images - process these first to avoid conflicts with links
  text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="rounded-lg max-w-full h-auto my-2">');
  
  // Links
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">$1</a>');
  
  // Hashtags - make them lighter in color than hyperlinks
  text = text.replace(/(^|\s)#(\w+)/g, '$1<span class="text-primary-300 dark:text-primary-300">#$2</span>');
  
  // Bold (** or *)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  
  // Italic (_)
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');
  
  return text;
}
