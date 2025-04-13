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
 * - Footnotes (with [^1] and [^1]: footnote text)
 */

/**
 * Parse Markdown text to HTML
 * @param text The Markdown text to parse
 * @returns HTML string
 */
export function parseMarkdown(text: string): string {
  if (!text) return '';
  
  // Extract footnote definitions
  const footnoteDefinitions = new Map<string, string>();
  const footnoteDefRegex = /\[\^(\w+)\]:\s*(.*?)(?=\n\[\^|$)/gs;
  let footnoteDefMatch;
  
  // Find all footnote definitions and store them
  while ((footnoteDefMatch = footnoteDefRegex.exec(text)) !== null) {
    const id = footnoteDefMatch[1];
    const content = footnoteDefMatch[2].trim();
    footnoteDefinitions.set(id, content);
  }
  
  // Remove footnote definitions from the text
  text = text.replace(/\[\^(\w+)\]:\s*(.*?)(?=\n\[\^|$)/gs, '');
  
  // Process the text line by line for block elements
  const lines = text.split('\n');
  let inList = false;
  let listType = '';
  let listLevel = 0;
  let inQuote = false;
  
  // Track footnote references
  const footnoteReferences = new Set<string>();
  
  const processedLines = lines.map((line, index) => {
    // Headers
    if (line.startsWith('# ')) {
      return `<h1>${processInlineMarkdown(line.substring(2), footnoteDefinitions, footnoteReferences)}</h1>`;
    } else if (line.startsWith('## ')) {
      return `<h2>${processInlineMarkdown(line.substring(3), footnoteDefinitions, footnoteReferences)}</h2>`;
    } else if (line.startsWith('### ')) {
      return `<h3>${processInlineMarkdown(line.substring(4), footnoteDefinitions, footnoteReferences)}</h3>`;
    } else if (line.startsWith('#### ')) {
      return `<h4>${processInlineMarkdown(line.substring(5), footnoteDefinitions, footnoteReferences)}</h4>`;
    } else if (line.startsWith('##### ')) {
      return `<h5>${processInlineMarkdown(line.substring(6), footnoteDefinitions, footnoteReferences)}</h5>`;
    } else if (line.startsWith('###### ')) {
      return `<h6>${processInlineMarkdown(line.substring(7), footnoteDefinitions, footnoteReferences)}</h6>`;
    }
    
    // Quotes
    if (line.startsWith('> ')) {
      const quoteContent = processInlineMarkdown(line.substring(2), footnoteDefinitions, footnoteReferences);
      if (!inQuote) {
        inQuote = true;
        return `<blockquote>${quoteContent}`;
      } else {
        return quoteContent;
      }
    } else if (inQuote) {
      inQuote = false;
      return `</blockquote>${processInlineMarkdown(line, footnoteDefinitions, footnoteReferences)}`;
    }
    
    // Lists
    const bulletMatch = line.match(/^(\s*)[-*+]\s(.+)$/);
    const numberedMatch = line.match(/^(\s*)\d+\.\s(.+)$/);
    
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const content = processInlineMarkdown(bulletMatch[2], footnoteDefinitions, footnoteReferences);
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
      const content = processInlineMarkdown(numberedMatch[2], footnoteDefinitions, footnoteReferences);
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
      return endTags.repeat(listLevel) + processInlineMarkdown(line, footnoteDefinitions, footnoteReferences);
    }
    
    // Regular paragraph
    if (line.trim() === '') {
      return line; // Keep empty lines
    } else {
      return processInlineMarkdown(line, footnoteDefinitions, footnoteReferences);
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
  
  // Add footnotes section if there are any references
  if (footnoteReferences.size > 0) {
    result += '\n<div class="footnotes">\n<hr>\n<ol>';
    
    // Sort footnote references to ensure they appear in order
    const sortedReferences = Array.from(footnoteReferences).sort();
    
    for (const id of sortedReferences) {
      const content = footnoteDefinitions.get(id) || 'No footnote content provided';
      result += `\n<li id="fn-${id}"><p>${content} <a href="#fnref-${id}" class="footnote-backref">↩</a></p></li>`;
    }
    
    result += '\n</ol>\n</div>';
  }
  
  return result;
}

/**
 * Process inline Markdown elements
 * @param text The text to process
 * @param footnoteDefinitions Map of footnote IDs to their content
 * @param footnoteReferences Set to track which footnotes are referenced
 * @returns Processed HTML string
 */
function processInlineMarkdown(
  text: string, 
  footnoteDefinitions: Map<string, string>,
  footnoteReferences: Set<string>
): string {
  if (!text) return '';
  
  // Images - process these first to avoid conflicts with links
  text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="rounded-lg max-w-full h-auto my-2">');
  
  // Links
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">$1</a>');
  
  // Footnote references
  text = text.replace(/\[\^(\w+)\]/g, (match, id) => {
    // Add to the set of referenced footnotes
    footnoteReferences.add(id);
    
    // Create the footnote reference HTML
    return `<sup id="fnref-${id}"><a href="#fn-${id}" class="footnote-ref">${id}</a></sup>`;
  });
  
  // Hashtags - make them lighter in color than hyperlinks
  text = text.replace(/(^|\s)#(\w+)/g, '$1<span class="text-primary-300 dark:text-primary-300">#$2</span>');
  
  // Bold (** or *)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  
  // Italic (_)
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');
  
  return text;
}
