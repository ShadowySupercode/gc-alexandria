import { parseBasicmarkup } from "./basicMarkupParser.ts";
import hljs from "highlight.js";
import "highlight.js/lib/common"; // Import common languages
import "highlight.js/styles/github-dark.css"; // Dark theme only

// Register common languages
hljs.configure({
  ignoreUnescapedHTML: true,
});

// Escapes HTML characters for safe display
function escapeHtml(text: string): string {
  const div =
    typeof document !== "undefined" ? document.createElement("div") : null;
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
        const hasHeader =
          rows.length > 1 && rows[1].trim().match(/^\|[-\s|]+\|$/);

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
            html += `<th class="py-2 px-4 text-left border-b-2 border-gray-200 dark:border-gray-700 font-semibold">${cell}</th>\n`;
          });
          html += "</tr>\n</thead>\n";
        }

        // Add body
        html += "<tbody>\n";
        bodyRows.forEach((row) => {
          const cells = processCells(row);
          html += "<tr>\n";
          cells.forEach((cell) => {
            html += `<td class="py-2 px-4 text-left border-b border-gray-200 dark:border-gray-700">${cell}</td>\n`;
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
        return `<sup><a href="#fn-${id}" id="fnref-${id}-${referenceMap.get(id)!.length}" class="text-primary-600 hover:underline">[${refNum}]</a></sup>`;
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
              `<a href=\"#fnref-${id}-${i + 1}\" class=\"text-primary-600 hover:underline footnote-backref\">↩${num}</a>`,
          )
          .join(" ");
        // If label is not a number, show it after all backrefs
        const labelSuffix = isNaN(Number(label)) ? ` ${label}` : "";
        processedContent += `<li id=\"fn-${id}\"><span class=\"marker\">${text}</span> ${backrefs}${labelSuffix}</li>\n`;
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
 * Process blockquotes
 */
function processBlockquotes(content: string): string {
  // Match blockquotes that might span multiple lines
  const blockquoteRegex = /^>[ \t]?(.+(?:\n>[ \t]?.+)*)/gm;

  return content.replace(blockquoteRegex, (match) => {
    // Remove the '>' prefix from each line and preserve line breaks
    const text = match
      .split("\n")
      .map((line) => line.replace(/^>[ \t]?/, ""))
      .join("\n")
      .trim();

    return `<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4 whitespace-pre-wrap">${text}</blockquote>`;
  });
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
          html = `<pre class="code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
        } catch (e: unknown) {
          console.warn("Failed to highlight code block:", e);
          html = `<pre class="code-block"><code class="hljs ${language ? `language-${language}` : ""}">${code}</code></pre>`;
        }
      } else {
        html = `<pre class="code-block"><code class="hljs">${code}</code></pre>`;
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
 * Process $...$ and $$...$$ math blocks: render as LaTeX if recognized, otherwise as AsciiMath
 * This must run BEFORE any paragraph or inline code formatting.
 */
function processDollarMath(content: string): string {
  // Display math: $$...$$ (multi-line, not empty)
  content = content.replace(/\$\$([\s\S]*?\S[\s\S]*?)\$\$/g, (_match, expr) => {
    if (isLaTeXContent(expr)) {
      return `<div class="math-block">$$${expr}$$</div>`;
    } else {
      // Strip all $ or $$ from AsciiMath
      const clean = expr.replace(/\$+/g, "").trim();
      return `<div class="math-block" data-math-type="asciimath">${clean}</div>`;
    }
  });
  // Inline math: $...$ (not empty, not just whitespace)
  content = content.replace(/\$([^\s$][^$\n]*?)\$/g, (_match, expr) => {
    if (isLaTeXContent(expr)) {
      return `<span class="math-inline">$${expr}$</span>`;
    } else {
      const clean = expr.replace(/\$+/g, "").trim();
      return `<span class="math-inline" data-math-type="asciimath">${clean}</span>`;
    }
  });
  return content;
}

/**
 * Process LaTeX math expressions only within inline code blocks
 */
function processMathExpressions(content: string): string {
  // Only process LaTeX within inline code blocks (backticks)
  return content.replace(INLINE_CODE_REGEX, (_match, code) => {
    const trimmedCode = code.trim();

    // Check for unsupported LaTeX environments (like tabular) first
    if (/\\begin\{tabular\}|\\\\begin\{tabular\}/.test(trimmedCode)) {
      return `<div class="unrendered-latex">
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Unrendered, as it is LaTeX typesetting, not a formula:
        </p>
        <pre class="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto">
          <code>${escapeHtml(trimmedCode)}</code>
        </pre>
      </div>`;
    }

    // Check if the code contains LaTeX syntax
    if (isLaTeXContent(trimmedCode)) {
      // Detect LaTeX display math (\\[...\\])
      if (/^\\\[[\s\S]*\\\]$/.test(trimmedCode)) {
        // Remove the delimiters for rendering
        const inner = trimmedCode.replace(/^\\\[|\\\]$/g, "");
        return `<div class="math-block">$$${inner}$$</div>`;
      }
      // Detect display math ($$...$$)
      if (/^\$\$[\s\S]*\$\$$/.test(trimmedCode)) {
        // Remove the delimiters for rendering
        const inner = trimmedCode.replace(/^\$\$|\$\$$/g, "");
        return `<div class="math-block">$$${inner}$$</div>`;
      }
      // Detect inline math ($...$)
      if (/^\$[\s\S]*\$$/.test(trimmedCode)) {
        // Remove the delimiters for rendering
        const inner = trimmedCode.replace(/^\$|\$$/g, "");
        return `<span class="math-inline">$${inner}$</span>`;
      }
      // Default to inline math for any other LaTeX content
      return `<span class="math-inline">$${trimmedCode}$</span>`;
    } else {
      // Check for edge cases that should remain as code, not math
      // These patterns indicate code that contains dollar signs but is not math
      const codePatterns = [
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=/, // Variable assignment like "const price ="
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/, // Function call like "echo("
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\{/, // Object literal like "const obj = {"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\[/, // Array literal like "const arr = ["
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*</, // JSX or HTML like "const element = <"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*`/, // Template literal like "const str = `"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*'/, // String literal like "const str = '"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*"/, // String literal like "const str = \""
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*;/, // Statement ending like "const x = 1;"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*$/, // Just a variable name
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]/, // Operator like "const x = 1 +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Two identifiers like "const price = amount"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]/, // Number like "const x = 1"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]/, // Complex expression like "const price = amount +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[a-zA-Z0-9_$]*\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Three identifiers like "const price = amount + tax"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]/, // Two identifiers and number like "const price = amount + 1"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]/, // Identifier, number, operator like "const x = 1 +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Identifier, number, identifier like "const x = 1 + y"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[0-9]/, // Identifier, number, number like "const x = 1 + 2"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Complex like "const x = 1 + y"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[0-9]/, // Complex like "const x = 1 + 2"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]/, // Very complex like "const x = 1 + y +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Very complex like "const x = 1 + y + z"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]\s*[0-9]/, // Very complex like "const x = 1 + y + 2"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[0-9]\s*[+\-*/%=<>!&|^~]/, // Very complex like "const x = 1 + 2 +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Very complex like "const x = 1 + 2 + y"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[0-9]/, // Very complex like "const x = 1 + 2 + 3"
        // Additional patterns for JavaScript template literals and other code
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*`/, // Template literal assignment like "const str = `"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*'/, // String assignment like "const str = '"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*"/, // String assignment like "const str = \""
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[0-9]/, // Number assignment like "const x = 1"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Variable assignment like "const x = y"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[+\-*/%=<>!&|^~]/, // Assignment with operator like "const x = +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]/, // Assignment with variable and operator like "const x = y +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Assignment with two variables and operator like "const x = y + z"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[0-9]\s*[+\-*/%=<>!&|^~]/, // Assignment with number and operator like "const x = 1 +"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[a-zA-Z_$][a-zA-Z0-9_$]*/, // Assignment with number, operator, variable like "const x = 1 + y"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[+\-*/%=<>!&|^~]\s*[0-9]/, // Assignment with variable, operator, number like "const x = y + 1"
        /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[0-9]\s*[+\-*/%=<>!&|^~]\s*[0-9]/, // Assignment with number, operator, number like "const x = 1 + 2"
      ];

      // If it matches code patterns, treat as regular code
      if (codePatterns.some((pattern) => pattern.test(trimmedCode))) {
        const escapedCode = trimmedCode
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
        return `<code class="px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono">${escapedCode}</code>`;
      }

      // Return as regular inline code
      const escapedCode = trimmedCode
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
      return `<code class="px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono">${escapedCode}</code>`;
    }
  });
}

/**
 * Checks if content contains LaTeX syntax
 */
function isLaTeXContent(content: string): boolean {
  const trimmed = content.trim();

  // Check for simple math expressions first (like AsciiMath)
  if (/^\$[^$]+\$$/.test(trimmed)) {
    return true;
  }

  // Check for display math
  if (/^\$\$[\s\S]*\$\$$/.test(trimmed)) {
    return true;
  }

  // Check for LaTeX display math
  if (/^\\\[[\s\S]*\\\]$/.test(trimmed)) {
    return true;
  }

  // Check for LaTeX environments with double backslashes (like tabular)
  if (/\\\\begin\{[^}]+\}/.test(trimmed) || /\\\\end\{[^}]+\}/.test(trimmed)) {
    return true;
  }

  // Check for common LaTeX patterns
  const latexPatterns = [
    /\\[a-zA-Z]+/, // LaTeX commands like \frac, \sum, etc.
    /\\\\[a-zA-Z]+/, // LaTeX commands with double backslashes like \\frac, \\sum, etc.
    /\\[\(\)\[\]]/, // LaTeX delimiters like \(, \), \[, \]
    /\\\\[\(\)\[\]]/, // LaTeX delimiters with double backslashes like \\(, \\), \\[, \\]
    /\\\[[\s\S]*?\\\]/, // LaTeX display math \[ ... \]
    /\\\\\[[\s\S]*?\\\\\]/, // LaTeX display math with double backslashes \\[ ... \\]
    /\\begin\{/, // LaTeX environments
    /\\\\begin\{/, // LaTeX environments with double backslashes
    /\\end\{/, // LaTeX environments
    /\\\\end\{/, // LaTeX environments with double backslashes
    /\\begin\{array\}/, // LaTeX array environment
    /\\\\begin\{array\}/, // LaTeX array environment with double backslashes
    /\\end\{array\}/,
    /\\\\end\{array\}/,
    /\\begin\{matrix\}/, // LaTeX matrix environment
    /\\\\begin\{matrix\}/, // LaTeX matrix environment with double backslashes
    /\\end\{matrix\}/,
    /\\\\end\{matrix\}/,
    /\\begin\{bmatrix\}/, // LaTeX bmatrix environment
    /\\\\begin\{bmatrix\}/, // LaTeX bmatrix environment with double backslashes
    /\\end\{bmatrix\}/,
    /\\\\end\{bmatrix\}/,
    /\\begin\{pmatrix\}/, // LaTeX pmatrix environment
    /\\\\begin\{pmatrix\}/, // LaTeX pmatrix environment with double backslashes
    /\\end\{pmatrix\}/,
    /\\\\end\{pmatrix\}/,
    /\\begin\{tabular\}/, // LaTeX tabular environment
    /\\\\begin\{tabular\}/, // LaTeX tabular environment with double backslashes
    /\\end\{tabular\}/,
    /\\\\end\{tabular\}/,
    /\$\$/, // Display math delimiters
    /\$[^$]+\$/, // Inline math delimiters
    /\\text\{/, // LaTeX text command
    /\\\\text\{/, // LaTeX text command with double backslashes
    /\\mathrm\{/, // LaTeX mathrm command
    /\\\\mathrm\{/, // LaTeX mathrm command with double backslashes
    /\\mathbf\{/, // LaTeX bold command
    /\\\\mathbf\{/, // LaTeX bold command with double backslashes
    /\\mathit\{/, // LaTeX italic command
    /\\\\mathit\{/, // LaTeX italic command with double backslashes
    /\\sqrt/, // Square root
    /\\\\sqrt/, // Square root with double backslashes
    /\\frac/, // Fraction
    /\\\\frac/, // Fraction with double backslashes
    /\\sum/, // Sum
    /\\\\sum/, // Sum with double backslashes
    /\\int/, // Integral
    /\\\\int/, // Integral with double backslashes
    /\\lim/, // Limit
    /\\\\lim/, // Limit with double backslashes
    /\\infty/, // Infinity
    /\\\\infty/, // Infinity with double backslashes
    /\\alpha/, // Greek letters
    /\\\\alpha/, // Greek letters with double backslashes
    /\\beta/,
    /\\\\beta/,
    /\\gamma/,
    /\\\\gamma/,
    /\\delta/,
    /\\\\delta/,
    /\\theta/,
    /\\\\theta/,
    /\\lambda/,
    /\\\\lambda/,
    /\\mu/,
    /\\\\mu/,
    /\\pi/,
    /\\\\pi/,
    /\\sigma/,
    /\\\\sigma/,
    /\\phi/,
    /\\\\phi/,
    /\\omega/,
    /\\\\omega/,
    /\\partial/, // Partial derivative
    /\\\\partial/, // Partial derivative with double backslashes
    /\\nabla/, // Nabla
    /\\\\nabla/, // Nabla with double backslashes
    /\\cdot/, // Dot product
    /\\\\cdot/, // Dot product with double backslashes
    /\\times/, // Times
    /\\\\times/, // Times with double backslashes
    /\\div/, // Division
    /\\\\div/, // Division with double backslashes
    /\\pm/, // Plus-minus
    /\\\\pm/, // Plus-minus with double backslashes
    /\\mp/, // Minus-plus
    /\\\\mp/, // Minus-plus with double backslashes
    /\\leq/, // Less than or equal
    /\\\\leq/, // Less than or equal with double backslashes
    /\\geq/, // Greater than or equal
    /\\\\geq/, // Greater than or equal with double backslashes
    /\\neq/, // Not equal
    /\\\\neq/, // Not equal with double backslashes
    /\\approx/, // Approximately equal
    /\\\\approx/, // Approximately equal with double backslashes
    /\\equiv/, // Equivalent
    /\\\\equiv/, // Equivalent with double backslashes
    /\\propto/, // Proportional
    /\\\\propto/, // Proportional with double backslashes
    /\\in/, // Element of
    /\\\\in/, // Element of with double backslashes
    /\\notin/, // Not element of
    /\\\\notin/, // Not element of with double backslashes
    /\\subset/, // Subset
    /\\\\subset/, // Subset with double backslashes
    /\\supset/, // Superset
    /\\\\supset/, // Superset with double backslashes
    /\\cup/, // Union
    /\\\\cup/, // Union with double backslashes
    /\\cap/, // Intersection
    /\\\\cap/, // Intersection with double backslashes
    /\\emptyset/, // Empty set
    /\\\\emptyset/, // Empty set with double backslashes
    /\\mathbb\{/, // Blackboard bold
    /\\\\mathbb\{/, // Blackboard bold with double backslashes
    /\\mathcal\{/, // Calligraphic
    /\\\\mathcal\{/, // Calligraphic with double backslashes
    /\\mathfrak\{/, // Fraktur
    /\\\\mathfrak\{/, // Fraktur with double backslashes
    /\\mathscr\{/, // Script
    /\\\\mathscr\{/, // Script with double backslashes
  ];

  return latexPatterns.some((pattern) => pattern.test(trimmed));
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

    // Step 2: Process $...$ and $$...$$ math blocks (LaTeX or AsciiMath)
    processedText = processDollarMath(processedText);

    // Step 3: Process LaTeX math expressions ONLY within inline code blocks (legacy support)
    processedText = processMathExpressions(processedText);

    // Step 4: Process block-level elements (tables, blockquotes, headings, horizontal rules)
    processedText = processTables(processedText);
    processedText = processBlockquotes(processedText);
    processedText = processHeadings(processedText);
    processedText = processHorizontalRules(processedText);

    // Step 5: Process footnotes (only references, not definitions)
    processedText = processFootnotes(processedText);

    // Step 6: Process basic markup (which will also handle Nostr identifiers)
    // This includes paragraphs, inline code, links, lists, etc.
    processedText = await parseBasicmarkup(processedText);

    // Step 7: Restore code blocks
    processedText = restoreCodeBlocks(processedText, blocks);

    return processedText;
  } catch (e: unknown) {
    console.error("Error in parseAdvancedmarkup:", e);
    return `<div class="text-red-500">Error processing markup: ${(e as Error)?.message ?? "Unknown error"}</div>`;
  }
}
