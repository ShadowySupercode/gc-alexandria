/**
 * Markup conversion utilities for HTML ↔ Markdown conversion
 */

export interface MarkupConverterConfig {
  enableLaTeX?: boolean;
  enableTables?: boolean;
  enableFootnotes?: boolean;
  enableWikilinks?: boolean;
}

export class MarkupConverter {
  private config: Required<MarkupConverterConfig>;

  constructor(config: MarkupConverterConfig = {}) {
    this.config = {
      enableLaTeX: config.enableLaTeX ?? true,
      enableTables: config.enableTables ?? true,
      enableFootnotes: config.enableFootnotes ?? true,
      enableWikilinks: config.enableWikilinks ?? true,
    };
  }

  /**
   * Convert HTML to Markdown
   */
  convertHtmlToMarkup(html: string): string {
    if (!html) return "";
    
    let markup = html;
    
    // Handle mentions (nostr:npub...)
    markup = this.convertMentionsToMarkup(markup);
    
    // Handle wikilinks
    if (this.config.enableWikilinks) {
      markup = this.convertWikilinksToMarkup(markup);
    }
    
    // Handle regular links
    markup = this.convertLinksToMarkup(markup);
    
    // Handle images
    markup = this.convertImagesToMarkup(markup);
    
    // Handle text formatting
    markup = this.convertTextFormattingToMarkup(markup);
    
    // Handle LaTeX math
    if (this.config.enableLaTeX) {
      markup = this.convertLaTeXToMarkup(markup);
    }
    
    // Handle blockquotes
    markup = this.convertBlockquotesToMarkup(markup);
    
    // Handle lists
    markup = this.convertListsToMarkup(markup);
    
    // Handle headings
    markup = this.convertHeadingsToMarkup(markup);
    
    // Handle horizontal rules
    markup = this.convertHorizontalRulesToMarkup(markup);
    
    // Handle tables
    if (this.config.enableTables) {
      markup = this.convertTablesToMarkup(markup);
    }
    
    // Handle footnotes
    if (this.config.enableFootnotes) {
      markup = this.convertFootnotesToMarkup(markup);
    }
    
    // Handle paragraphs
    markup = this.convertParagraphsToMarkup(markup);
    
    // Clean up extra whitespace and newlines
    markup = this.cleanupMarkup(markup);
    
    return markup;
  }

  /**
   * Convert Markdown to HTML
   */
  convertMarkupToHtml(markup: string): string {
    if (!markup || markup.trim() === "") {
      return "<p></p>";
    }
    
    let html = markup;
    
    // Handle mentions (nostr:npub...)
    html = this.convertMentionsToHtml(html);
    
    // Handle wikilinks
    if (this.config.enableWikilinks) {
      html = this.convertWikilinksToHtml(html);
    }
    
    // Handle images (process before links)
    html = this.convertImagesToHtml(html);
    
    // Handle regular links
    html = this.convertLinksToHtml(html);
    
    // Handle LaTeX math (process before text formatting)
    if (this.config.enableLaTeX) {
      html = this.convertLaTeXToHtml(html);
    }
    
    // Handle text formatting
    html = this.convertTextFormattingToHtml(html);
    
    // Handle blockquotes
    html = this.convertBlockquotesToHtml(html);
    
    // Handle lists
    html = this.convertListsToHtml(html);
    
    // Handle headings
    html = this.convertHeadingsToHtml(html);
    
    // Handle horizontal rules
    html = this.convertHorizontalRulesToHtml(html);
    
    // Handle tables
    if (this.config.enableTables) {
      html = this.convertTablesToHtml(html);
    }
    
    // Handle footnotes
    if (this.config.enableFootnotes) {
      html = this.convertFootnotesToHtml(html);
    }
    
    // Handle paragraphs
    html = this.convertParagraphsToHtml(html);
    
    // Handle empty content
    if (!html.trim()) {
      return "<p class=\"my-4\"></p>";
    }
    
    return html;
  }

  // Private conversion methods
  private convertMentionsToMarkup(html: string): string {
    return html.replace(/<a href="nostr:([^"]+)"[^>]*>nostr:([^<]+)<\/a>/g, 'nostr:$2');
  }

  private convertMentionsToHtml(markup: string): string {
    return markup.replace(/nostr:([a-zA-Z0-9]+)/g, '<a href="nostr:$1" class="text-primary-600 dark:text-primary-500 hover:underline">nostr:$1</a>');
  }

  private convertWikilinksToMarkup(html: string): string {
    // First handle the case where the link text is the same as the target
    html = html.replace(/<a href="\[\[([^\]]+?)\]\]"[^>]*>\[\[([^\]]+?)\]\]<\/a>/g, '[[$1]]');
    // Then handle the case where the link text is different from the target
    return html.replace(/<a href="\[\[([^\]]+?)\]\]"[^>]*>([^<]+?)<\/a>/g, '[[$1|$2]]');
  }

  private convertWikilinksToHtml(markup: string): string {
    return markup.replace(/\[\[([^\]]+?)(?:\|([^\]]+?))?\]\]/g, (match, target, text) => {
      const linkText = text || `[[${target}]]`;
      return `<a href="[[${target}]]" class="text-primary-600 dark:text-primary-500 hover:underline">${linkText}</a>`;
    });
  }

  private convertLinksToMarkup(html: string): string {
    return html.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '[$2]($1)');
  }

  private convertLinksToHtml(markup: string): string {
    return markup.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">$1</a>');
  }

  private convertImagesToMarkup(html: string): string {
    html = html.replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g, '![$2]($1)');
    return html.replace(/<img[^>]+alt="([^"]*)"[^>]*src="([^"]+)"[^>]*>/g, '![$1]($2)');
  }

  private convertImagesToHtml(markup: string): string {
    return markup.replace(/!\[([^\]]*?)\]\(([^)]+?)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async">');
  }

  private convertTextFormattingToMarkup(html: string): string {
    html = html.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    html = html.replace(/<em>(.*?)<\/em>/g, '_$1_');
    html = html.replace(/<u>(.*?)<\/u>/g, '<u>$1</u>');
    html = html.replace(/<del[^>]*>(.*?)<\/del>/g, '~~$1~~');
    return html.replace(/<code[^>]*>(.*?)<\/code>/g, '`$1`');
  }

  private convertTextFormattingToHtml(markup: string): string {
    markup = markup.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    markup = markup.replace(/_(.*?)_/g, '<em>$1</em>');
    markup = markup.replace(/~~(.*?)~~/g, '<del class="line-through">$1</del>');
    return markup.replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">$1</code>');
  }

  private convertLaTeXToMarkup(html: string): string {
    // Handle display math
    html = html.replace(
      /<div[^>]*class="[^"]*font-mono[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
      (_match, math) => `$$${math.trim()}$$`
    );
    // Handle inline math
    return html.replace(
      /<span[^>]*class="[^"]*font-mono[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
      (_match, math) => `$${math.trim()}$`
    );
  }

  private convertLaTeXToHtml(markup: string): string {
    // Process display math first to avoid conflicts with inline math
    markup = markup.replace(/\$\$([^$]+?)\$\$/g, '<div class="font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded my-2 text-center">$1</div>');
    return markup.replace(/\$([^$\n]+?)\$/g, '<span class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">$1</span>');
  }

  private convertBlockquotesToMarkup(html: string): string {
    return html.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gs, (match, content) => {
      return content.split('\n').map((line: string) => `> ${line.trim()}`).join('\n');
    });
  }

  private convertBlockquotesToHtml(markup: string): string {
    return markup.replace(/^>\s*(.*)$/gm, '<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">$1</blockquote>');
  }

  private convertListsToMarkup(html: string): string {
    html = html.replace(/<ul[^>]*>(.*?)<\/ul>/gs, (match, content) => {
      return content.replace(/<li[^>]*>(.*?)<\/li>/g, '• $1').split('• ').filter((item: string) => item.trim()).map((item: string) => '• ' + item.trim()).join('\n');
    });
    return html.replace(/<ol[^>]*>(.*?)<\/ol>/gs, (match, content) => {
      let counter = 1;
      return content.replace(/<li[^>]*>(.*?)<\/li>/g, () => `${counter++}. $1`).split(/\d+\. /).filter((item: string) => item.trim()).map((item: string, index: number) => `${index + 1}. ${item.trim()}`).join('\n');
    });
  }

  private convertListsToHtml(markup: string): string {
    markup = markup.replace(/^•\s*(.*)$/gm, '<li class="list-disc ml-4">$1</li>');
    markup = markup.replace(/^\d+\.\s*(.*)$/gm, '<li class="list-decimal ml-4">$1</li>');
    return markup.replace(/(<li[^>]*>.*?<\/li>)/gs, '<ul class="list-disc ml-6 mb-2">$1</ul>');
  }

  private convertHeadingsToMarkup(html: string): string {
    return html.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/g, (match, level, text) => {
      return '#'.repeat(parseInt(level)) + ' ' + text.trim() + '\n';
    });
  }

  private convertHeadingsToHtml(markup: string): string {
    const headingClasses = [
      "text-4xl font-bold mt-6 mb-4", // h1
      "text-3xl font-bold mt-6 mb-4", // h2
      "text-2xl font-bold mt-6 mb-4", // h3
      "text-xl font-bold mt-6 mb-4", // h4
      "text-lg font-semibold mt-6 mb-4", // h5
      "text-base font-semibold mt-6 mb-4", // h6
    ];
    
    return markup.replace(/^(#{1,6})\s+(.+)$/gm, (match, level, text) => {
      const headingLevel = Math.min(level.length, 6);
      const classes = headingClasses[headingLevel - 1];
      return `<h${headingLevel} class="${classes}">${text.trim()}</h${headingLevel}>`;
    });
  }

  private convertHorizontalRulesToMarkup(html: string): string {
    return html.replace(/<hr[^>]*>/g, '\n---\n');
  }

  private convertHorizontalRulesToHtml(markup: string): string {
    return markup.replace(/^---$/gm, '<hr class="my-8 h-px border-0 bg-gray-200 dark:bg-gray-700">');
  }

  private convertTablesToMarkup(html: string): string {
    return html.replace(/<table[^>]*>(.*?)<\/table>/gs, (match, content) => {
      const rows = content.match(/<tr[^>]*>(.*?)<\/tr>/gs) || [];
      let tableMarkup = '';
      
      rows.forEach((row: string, index: number) => {
        const cells = row.match(/<(th|td)[^>]*>(.*?)<\/\1>/gs) || [];
        const cellTexts = cells.map((cell: string) => {
          const text = cell.replace(/<(th|td)[^>]*>(.*?)<\/\1>/s, '$2').trim();
          return text;
        });
        
        if (cellTexts.length > 0) {
          tableMarkup += '| ' + cellTexts.join(' | ') + ' |\n';
          
          if (index === 0) {
            tableMarkup += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
          }
        }
      });
      
      return tableMarkup;
    });
  }

  private convertTablesToHtml(markup: string): string {
    return markup.replace(/^\|(.*(?:\n\|.*)*)/gm, (match) => {
      const rows = match.split('\n').filter(row => row.trim());
      if (rows.length < 1) return match;
      
      const processCells = (row: string): string[] => {
        return row.split('|').slice(1, -1).map(cell => cell.trim());
      };
      
      const hasHeader = rows.length > 1 && rows[1].trim().match(/^\|[-\s|]+\|$/);
      
      let headerCells: string[] = [];
      let bodyRows: string[] = [];
      
      if (hasHeader) {
        headerCells = processCells(rows[0]);
        bodyRows = rows.slice(2);
      } else {
        bodyRows = rows;
      }
      
      let tableHtml = '<div class="overflow-x-auto my-4">\n<table class="min-w-full border-collapse">\n';
      
      if (hasHeader) {
        tableHtml += '<thead>\n<tr>\n';
        headerCells.forEach(cell => {
          tableHtml += `<th class="py-2 px-4 text-left border-b-2 border-gray-200 dark:border-gray-700 font-semibold">${cell}</th>\n`;
        });
        tableHtml += '</tr>\n</thead>\n';
      }
      
      tableHtml += '<tbody>\n';
      bodyRows.forEach(row => {
        const cells = processCells(row);
        tableHtml += '<tr>\n';
        cells.forEach(cell => {
          tableHtml += `<td class="py-2 px-4 text-left border-b border-gray-200 dark:border-gray-700">${cell}</td>\n`;
        });
        tableHtml += '</tr>\n';
      });
      
      tableHtml += '</tbody>\n</table>\n</div>';
      return tableHtml;
    });
  }

  private convertFootnotesToMarkup(html: string): string {
    html = html.replace(/<sup><a[^>]*href="#fn-([^"]+)"[^>]*>\[([^\]]+)\]<\/a><\/sup>/g, '[^$1]');
    return html.replace(/<li id="fn-([^"]+)">[^<]*<span[^>]*>([^<]+)<\/span>[^<]*<\/li>/g, '[^$1]: $2');
  }

  private convertFootnotesToHtml(markup: string): string {
    // Extract footnote definitions before paragraph processing
    const footnoteDefs: string[] = [];
    markup = markup.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_match, id, content) => {
      footnoteDefs.push(`<li id="fn-${id}"><span class="marker">${content}</span></li>`);
      return '';
    });

    // Handle footnote references
    markup = markup.replace(/\[\^([^\]]+)\]/g, '<sup><a href="#fn-$1" class="text-primary-600 hover:underline">[$1]</a></sup>');

    // Append footnote list if any
    if (footnoteDefs.length > 0) {
      markup += '\n' + footnoteDefs.join('\n') + '\n';
    }

    return markup;
  }

  private convertParagraphsToMarkup(html: string): string {
    // Convert paragraphs to double newlines
    let markup = html.replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n');
    
    // Convert div tags to newlines (handle empty divs and divs with br)
    markup = markup.replace(/<div[^>]*>\s*<\/div>/g, '\n');
    markup = markup.replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/g, '\n');
    markup = markup.replace(/<div[^>]*>(.*?)<\/div>/g, '$1\n');
    
    // Convert br tags to newlines
    markup = markup.replace(/<br\s*\/?>/g, '\n');
    
    // Clean up multiple newlines and trim
    markup = markup.replace(/\n\s*\n\s*\n/g, '\n\n');
    markup = markup.replace(/^\s+|\s+$/g, ''); // Trim leading/trailing whitespace
    
    return markup;
  }

  private convertParagraphsToHtml(markup: string): string {
    return markup
      .split(/\n\n+/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => {
        if (
          /(<div[^>]*class=["'][^"']*math-block[^"']*["'])|<(div|h[1-6]|blockquote|table|pre|ul|ol|hr|li)/i.test(
            para,
          )
        ) {
          return para;
        }
        return `<p class="my-4">${para}</p>`;
      })
      .join("\n");
  }

  private cleanupMarkup(markup: string): string {
    return markup.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  }
}

// Create a default instance
export const defaultMarkupConverter = new MarkupConverter(); 