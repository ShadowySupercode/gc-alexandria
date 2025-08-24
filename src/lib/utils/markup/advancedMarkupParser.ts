import { parseBasicMarkup } from "./basicMarkupParser.ts";
import hljs from "highlight.js";
import "highlight.js/lib/common"; // Import common languages
import "highlight.js/styles/github-dark.css"; // Dark theme only

// Register common languages
hljs.configure({
  ignoreUnescapedHTML: true,
});

// Escapes HTML characters for safe display
function escapeHtml(text: string): string {
  const div = typeof document !== "undefined"
    ? document.createElement("div")
    : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Fallback for non-browser environments
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Regular expressions for advanced markup elements
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const ALTERNATE_HEADING_REGEX = /^([^\n]+)\n(=+|-+)\n/gm;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const MULTILINE_CODE_REGEX = /`([\s\S]*?)`/g;
const HORIZONTAL_RULE_REGEX = /^(?:[-*_]\s*){3,}$/gm;
const FOOTNOTE_REFERENCE_REGEX = /\[\^([^\]]+)\]/g;
const FOOTNOTE_DEFINITION_REGEX = /^\[\^([^\]]+)\]:\s*(.+)$/gm;
const CODE_BLOCK_REGEX = /^```(\w*)$/;

// LaTeX math regex patterns
// const INLINE_MATH_REGEX = /\$([^$\n]+?)\$/g;
// const DISPLAY_MATH_REGEX = /\$\$([\s\S]*?)\$\$/g;
// const LATEX_BLOCK_REGEX = /\\\[([\s\S]*?)\\\]/g;
// const LATEX_INLINE_REGEX = /\\\(([^)]+?)\\\)/g;
// Add regex for LaTeX display math environments (e.g., \begin{pmatrix}...\end{pmatrix})
// Improved regex: match optional whitespace/linebreaks before and after, and allow for indented environments
// const LATEX_ENV_BLOCK_REGEX =
//   /(?:^|\n)\s*\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}\s*(?=\n|$)/gm;

/**
 * Process headings (both styles)
 */
function processHeadings(content: string): string {
  // Tailwind classes for each heading level
  const headingClasses = [
    "text-4xl font-bold mt-6 mb-4 text-gray-800 dark:text-gray-300", // h1
    "text-3xl font-bold mt-6 mb-4 text-gray-800 dark:text-gray-300", // h2
    "text-2xl font-bold mt-6 mb-4 text-gray-800 dark:text-gray-300", // h3
    "text-xl font-bold mt-6 mb-4 text-gray-800 dark:text-gray-300", // h4
    "text-lg font-semibold mt-6 mb-4 text-gray-800 dark:text-gray-300", // h5
    "text-base font-semibold mt-6 mb-4 text-gray-800 dark:text-gray-300", // h6
  ];

  // Process ATX-style headings (# Heading)
  let processedContent = content.replace(HEADING_REGEX, (_, level, text) => {
    const headingLevel = Math.min(level.length, 6);
    const classes = headingClasses[headingLevel - 1];
    return `<h${headingLevel} class="${classes}">${text.trim()}</h${headingLevel}>`;
  });

  // Process Setext-style headings (Heading\n====)
  processedContent = processedContent.replace(
    ALTERNATE_HEADING_REGEX,
    (_, text, level) => {
      const headingLevel = level[0] === "=" ? 1 : 2;
      const classes = headingClasses[headingLevel - 1];
      return `<h${headingLevel} class="${classes}">${text.trim()}</h${headingLevel}>`;
    },
  );

  return processedContent;
}

/**
 * Process tables
 */
function processTables(content: string): string {
  try {
    if (!content) return "";

    return content.replace(/^\|(.*(?:\n\|.*)*)/gm, (match) => {
      try {
        // Split into rows and clean up
        const rows = match.split("\n").filter((row) => row.trim());
        if (rows.length < 1) return match;

        // Helper to process a row into cells
        const processCells = (row: string): string[] => {
          return row
            .split("|")
            .slice(1, -1) // Remove empty cells from start/end
            .map((cell) => cell.trim());
        };

        // Check if second row is a delimiter row (only hyphens)
        const hasHeader = rows.length > 1 &&
          rows[1].trim().match(/^\|[-\s|]+\|$/);

        // Extract header and body rows
        let headerCells: string[] = [];
        let bodyRows: string[] = [];

        if (hasHeader) {
          // If we have a header, first row is header, skip delimiter, rest is body
          headerCells = processCells(rows[0]);
          bodyRows = rows.slice(2);
        } else {
          // No header, all rows are body
          bodyRows = rows;
        }

        // Build table HTML
        let html = '<div class="overflow-x-auto my-4">\n';
        html += '<table class="min-w-full border-collapse">\n';

        // Add header if exists
        if (hasHeader) {
          html += "<thead>\n<tr>\n";
          headerCells.forEach((cell) => {
            html +=
              `<th class="py-2 px-4 text-left border-b-2 border-gray-200 dark:border-gray-700 font-semibold">${cell}</th>\n`;
          });
          html += "</tr>\n</thead>\n";
        }

        // Add body
        html += "<tbody>\n";
        bodyRows.forEach((row) => {
          const cells = processCells(row);
          html += "<tr>\n";
          cells.forEach((cell) => {
            html +=
              `<td class="py-2 px-4 text-left border-b border-gray-200 dark:border-gray-700">${cell}</td>\n`;
          });
          html += "</tr>\n";
        });

        html += "</tbody>\n</table>\n</div>";
        return html;
      } catch (e: unknown) {
        console.error("Error processing table row:", e);
        return match;
      }
    });
  } catch (e: unknown) {
    console.error("Error in processTables:", e);
    return content;
  }
}

/**
 * Process horizontal rules
 */
function processHorizontalRules(content: string): string {
  return content.replace(
    HORIZONTAL_RULE_REGEX,
    '<hr class="my-8 h-px border-0 bg-gray-200 dark:bg-gray-700">',
  );
}

/**
 * Process footnotes
 */
function processFootnotes(content: string): string {
  try {
    if (!content) return "";

    // Collect all footnote definitions (but do not remove them from the text yet)
    const footnotes = new Map<string, string>();
    content.replace(FOOTNOTE_DEFINITION_REGEX, (match, id, text) => {
      footnotes.set(id, text.trim());
      return match;
    });

    // Remove all footnote definition lines from the main content
    let processedContent = content.replace(FOOTNOTE_DEFINITION_REGEX, "");

    // Track all references to each footnote
    const referenceOrder: { id: string; refNum: number; label: string }[] = [];
    const referenceMap = new Map<string, number[]>(); // id -> [refNum, ...]
    let globalRefNum = 1;
    processedContent = processedContent.replace(
      FOOTNOTE_REFERENCE_REGEX,
      (match, id) => {
        if (!footnotes.has(id)) {
          console.warn(
            `Footnote reference [^${id}] found but no definition exists`,
          );
          return match;
        }
        const refNum = globalRefNum++;
        if (!referenceMap.has(id)) referenceMap.set(id, []);
        referenceMap.get(id)!.push(refNum);
        referenceOrder.push({ id, refNum, label: id });
        return `<sup><a href="#fn-${id}" id="fnref-${id}-${
          referenceMap.get(id)!.length
        }" class="text-primary-600 hover:underline">[${refNum}]</a></sup>`;
      },
    );

    // Only render footnotes section if there are actual definitions and at least one reference
    if (footnotes.size > 0 && referenceOrder.length > 0) {
      processedContent +=
        '\n\n<h2 class="text-xl font-bold mt-8 mb-4">Footnotes</h2>\n<ol class="list-decimal list-inside footnotes-ol" style="list-style-type:decimal !important;">\n';
      // Only include each unique footnote once, in order of first reference
      const seen = new Set<string>();
      for (const { id, label } of referenceOrder) {
        if (seen.has(id)) continue;
        seen.add(id);
        const text = footnotes.get(id) || "";
        // List of backrefs for this footnote
        const refs = referenceMap.get(id) || [];
        const backrefs = refs
          .map(
            (num, i) =>
              `<a href=\"#fnref-${id}-${
                i + 1
              }\" class=\"text-primary-600 hover:underline footnote-backref\">↩${num}</a>`,
          )
          .join(" ");
        // If label is not a number, show it after all backrefs
        const labelSuffix = isNaN(Number(label)) ? ` ${label}` : "";
        processedContent +=
          `<li id=\"fn-${id}\"><span class=\"marker\">${text}</span> ${backrefs}${labelSuffix}</li>\n`;
      }
      processedContent += "</ol>";
    }

    return processedContent;
  } catch (error) {
    console.error("Error processing footnotes:", error);
    return content;
  }
}

/**
 * Process code blocks by finding consecutive code lines and preserving their content
 */
function processCodeBlocks(text: string): {
  text: string;
  blocks: Map<string, string>;
} {
  const lines = text.split("\n");
  const processedLines: string[] = [];
  const blocks = new Map<string, string>();
  let inCodeBlock = false;
  let currentCode: string[] = [];
  let currentLanguage = "";
  let blockCount = 0;
  let lastWasCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codeBlockStart = line.match(CODE_BLOCK_REGEX);

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
        const code = currentCode.join("\n");

        // Try to format JSON if specified
        let formattedCode = code;
        if (currentLanguage.toLowerCase() === "json") {
          try {
            formattedCode = JSON.stringify(JSON.parse(code), null, 2);
          } catch {
            formattedCode = code;
          }
        }

        blocks.set(
          id,
          JSON.stringify({
            code: formattedCode,
            language: currentLanguage,
            raw: true,
          }),
        );

        processedLines.push(""); // Add spacing before code block
        processedLines.push(id);
        processedLines.push(""); // Add spacing after code block
        inCodeBlock = false;
        currentCode = [];
        currentLanguage = "";
      }
    } else if (inCodeBlock) {
      currentCode.push(line);
    } else {
      if (lastWasCodeBlock && line.trim()) {
        processedLines.push("");
        lastWasCodeBlock = false;
      }
      processedLines.push(line);
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && currentCode.length > 0) {
    blockCount++;
    const id = `CODE_BLOCK_${blockCount}`;
    const code = currentCode.join("\n");

    // Try to format JSON if specified
    let formattedCode = code;
    if (currentLanguage.toLowerCase() === "json") {
      try {
        formattedCode = JSON.stringify(JSON.parse(code), null, 2);
      } catch {
        formattedCode = code;
      }
    }

    blocks.set(
      id,
      JSON.stringify({
        code: formattedCode,
        language: currentLanguage,
        raw: true,
      }),
    );
    processedLines.push("");
    processedLines.push(id);
    processedLines.push("");
  }

  return {
    text: processedLines.join("\n"),
    blocks,
  };
}

/**
 * Restore code blocks with proper formatting
 */
function restoreCodeBlocks(text: string, blocks: Map<string, string>): string {
  let result = text;

  for (const [id, blockData] of blocks) {
    try {
      const { code, language } = JSON.parse(blockData);

      let html;
      if (language && hljs.getLanguage(language)) {
        try {
          const highlighted = hljs.highlight(code, {
            language,
            ignoreIllegals: true,
          }).value;
          html =
            `<pre class="code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
        } catch (e: unknown) {
          console.warn("Failed to highlight code block:", e);
          html = `<pre class="code-block"><code class="hljs ${
            language ? `language-${language}` : ""
          }">${code}</code></pre>`;
        }
      } else {
        html =
          `<pre class="code-block"><code class="hljs">${code}</code></pre>`;
      }

      result = result.replace(id, html);
    } catch (e: unknown) {
      console.error("Error restoring code block:", e);
      result = result.replace(
        id,
        '<pre class="code-block"><code class="hljs">Error processing code block</code></pre>',
      );
    }
  }

  return result;
}

/**
 * Process math expressions inside inline code blocks
 * Only processes math that is inside backticks and contains $...$ or $$...$$ markings
 */
function processInlineCodeMath(content: string): string {
  return content.replace(MULTILINE_CODE_REGEX, (match, codeContent) => {
    // Check if the code content contains math expressions
    const hasInlineMath = /\$((?:[^$\\]|\\.)*?)\$/.test(codeContent);
    const hasDisplayMath = /\$\$[\s\S]*?\$\$/.test(codeContent);
    
    if (!hasInlineMath && !hasDisplayMath) {
      // No math found, return the original inline code
      return match;
    }
    
      // Process display math ($$...$$) first to avoid conflicts with inline math
  let processedContent = codeContent.replace(/\$\$([\s\S]*?)\$\$/g, (mathMatch: string, mathContent: string) => {
    // Skip empty math expressions
    if (!mathContent.trim()) {
      return mathMatch;
    }
    return `<span class="math-display">\\[${mathContent}\\]</span>`;
  });
  
  // Process inline math ($...$) after display math
  // Use a more sophisticated regex that handles escaped dollar signs
  processedContent = processedContent.replace(/\$((?:[^$\\]|\\.)*?)\$/g, (mathMatch: string, mathContent: string) => {
    // Skip empty math expressions
    if (!mathContent.trim()) {
      return mathMatch;
    }
    return `<span class="math-inline">\\(${mathContent}\\)</span>`;
  });
    
    return `\`${processedContent}\``;
  });
}

/**
 * Parse markup text with advanced formatting
 */
export async function parseAdvancedmarkup(text: string): Promise<string> {
  if (!text) return "";

  try {
    // Step 1: Extract and save code blocks first
    const { text: withoutCode, blocks } = processCodeBlocks(text);
    let processedText = withoutCode;

    // Step 2: Process math inside inline code blocks
    processedText = processInlineCodeMath(processedText);

    // Step 4: Process block-level elements (tables, headings, horizontal rules)
    // AI-NOTE:  Removed duplicate processBlockquotes call to fix image rendering issues
    // Blockquotes are now processed only by parseBasicMarkup to avoid double-processing conflicts
    processedText = processTables(processedText);
    processedText = processHeadings(processedText);
    processedText = processHorizontalRules(processedText);

    // Step 5: Process footnotes (only references, not definitions)
    processedText = processFootnotes(processedText);

    // Step 6: Process basic markup (which will also handle Nostr identifiers)
    // This includes paragraphs, inline code, links, lists, etc.
    processedText = await parseBasicMarkup(processedText);

    // Step 7: Restore code blocks
    processedText = restoreCodeBlocks(processedText, blocks);

    return processedText;
  } catch (e: unknown) {
    console.error("Error in parseAdvancedmarkup:", e);
    return `<div class="text-red-500">Error processing markup: ${
      (e as Error)?.message ?? "Unknown error"
    }</div>`;
  }
}
