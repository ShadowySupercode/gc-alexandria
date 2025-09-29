import NDK from "@nostr-dev-kit/ndk";
import { postProcessAsciidoctorHtml } from "./asciidoctorPostProcessor.ts";
import plantumlEncoder from "plantuml-encoder";

/**
 * Unified post-processor for Asciidoctor HTML that handles:
 * - Math rendering (Asciimath/Latex, stem blocks)
 * - PlantUML diagrams
 * - BPMN diagrams
 * - TikZ diagrams
 * - ABC music notation (client-side Svelte component mounting)
 */
export async function postProcessAdvancedAsciidoctorHtml(
  html: string,
  ndk?: NDK,
): Promise<string> {
  try {
    let processedHtml = html;

    // If HTML is provided, process it
    if (html) {
      // First apply the basic post-processing (wikilinks, nostr addresses)
      processedHtml = await postProcessAsciidoctorHtml(html, ndk);
      // Unified math block processing
      processedHtml = fixAllMathBlocks(processedHtml);
      // Process PlantUML blocks
      processedHtml = processPlantUMLBlocks(processedHtml);
      // Process BPMN blocks
      processedHtml = processBPMNBlocks(processedHtml);
      // Process TikZ blocks
      processedHtml = processTikZBlocks(processedHtml);
    }

    // AI-NOTE: ABC notation processing happens after DOM insertion via processABCNotationBlocks
    // Call it asynchronously after the HTML is rendered
    // This runs even if html is empty, to process existing DOM content
    setTimeout(() => processABCNotationBlocks(), 0);
    // After all processing, apply highlight.js if available
    if (
      typeof globalThis !== "undefined" &&
      typeof globalThis.hljs?.highlightAll === "function"
    ) {
      setTimeout(() => globalThis.hljs!.highlightAll(), 0);
    }
    if (
      typeof globalThis !== "undefined" &&
      // deno-lint-ignore no-explicit-any
      typeof (globalThis as any).MathJax?.typesetPromise === "function"
    ) {
      // deno-lint-ignore no-explicit-any
      setTimeout(() => (globalThis as any).MathJax.typesetPromise(), 0);
    }
    return processedHtml;
  } catch (error) {
    console.error("Error in postProcessAdvancedAsciidoctorHtml:", error);
    return html; // Return original HTML if processing fails
  }
}

/**
 * Fixes all math blocks for MathJax rendering.
 * Now only processes LaTeX within inline code blocks.
 */
function fixAllMathBlocks(html: string): string {
  // Unescape \$ to $ for math delimiters
  html = html.replace(/\\\$/g, "$");

  // Process inline code blocks that contain LaTeX
  html = html.replace(
    /<code[^>]*class="[^"]*language-[^"]*"[^>]*>([\s\S]*?)<\/code>/g,
    (match, codeContent) => {
      const trimmedCode = codeContent.trim();
      if (isLaTeXContent(trimmedCode)) {
        return `<span class="math-inline">$${trimmedCode}$</span>`;
      }
      return match; // Return original if not LaTeX
    },
  );

  // Also process code blocks without language class
  html = html.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/g,
    (match, codeContent) => {
      const trimmedCode = codeContent.trim();
      if (isLaTeXContent(trimmedCode)) {
        return `<span class="math-inline">$${trimmedCode}$</span>`;
      }
      return match; // Return original if not LaTeX
    },
  );

  return html;
}

/**
 * Checks if content contains LaTeX syntax
 */
function isLaTeXContent(content: string): boolean {
  const trimmed = content.trim();

  // Check for common LaTeX patterns
  const latexPatterns = [
    /\\[a-zA-Z]+/, // LaTeX commands like \frac, \sum, etc.
    /\\[\(\)\[\]]/, // LaTeX delimiters like \(, \), \[, \]
    /\\begin\{/, // LaTeX environments
    /\\end\{/, // LaTeX environments
    /\$\$/, // Display math delimiters
    /\$[^$]+\$/, // Inline math delimiters
    /\\text\{/, // LaTeX text command
    /\\mathrm\{/, // LaTeX mathrm command
    /\\mathbf\{/, // LaTeX bold command
    /\\mathit\{/, // LaTeX italic command
    /\\sqrt/, // Square root
    /\\frac/, // Fraction
    /\\sum/, // Sum
    /\\int/, // Integral
    /\\lim/, // Limit
    /\\infty/, // Infinity
    /\\alpha/, // Greek letters
    /\\beta/,
    /\\gamma/,
    /\\delta/,
    /\\theta/,
    /\\lambda/,
    /\\mu/,
    /\\pi/,
    /\\sigma/,
    /\\phi/,
    /\\omega/,
    /\\partial/, // Partial derivative
    /\\nabla/, // Nabla
    /\\cdot/, // Dot product
    /\\times/, // Times
    /\\div/, // Division
    /\\pm/, // Plus-minus
    /\\mp/, // Minus-plus
    /\\leq/, // Less than or equal
    /\\geq/, // Greater than or equal
    /\\neq/, // Not equal
    /\\approx/, // Approximately equal
    /\\equiv/, // Equivalent
    /\\propto/, // Proportional
    /\\in/, // Element of
    /\\notin/, // Not element of
    /\\subset/, // Subset
    /\\supset/, // Superset
    /\\cup/, // Union
    /\\cap/, // Intersection
    /\\emptyset/, // Empty set
    /\\mathbb\{/, // Blackboard bold
    /\\mathcal\{/, // Calligraphic
    /\\mathfrak\{/, // Fraktur
    /\\mathscr\{/, // Script
  ];

  return latexPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Processes PlantUML blocks in HTML content
 */
function processPlantUMLBlocks(html: string): string {
  // Only match code blocks with class 'language-plantuml' or 'plantuml'
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre class="highlight">\s*<code[^>]*class="[^"]*(?:language-plantuml|plantuml)[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      try {
        // Unescape HTML for PlantUML server, but escape for <code>
        const rawContent = decodeHTMLEntities(content);
        const encoded = plantumlEncoder.encode(rawContent);
        const plantUMLUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
        return `<div class="plantuml-block my-4">
          <img src="${plantUMLUrl}" alt="PlantUML diagram" 
               class="plantuml-diagram max-w-full h-auto rounded-lg shadow-lg" 
               loading="lazy" decoding="async">
          <details class="mt-2">
            <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
              Show PlantUML source
            </summary>
            <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
              <code>${escapeHtml(rawContent)}</code>
            </pre>
          </details>
        </div>`;
      } catch (error) {
        console.warn("Failed to process PlantUML block:", error);
        return match;
      }
    },
  );
  // Fallback: match <pre> blocks whose content starts with @startuml or @start (global, robust)
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      const lines = content.trim().split("\n");
      if (
        lines[0].trim().startsWith("@startuml") ||
        lines[0].trim().startsWith("@start")
      ) {
        try {
          const rawContent = decodeHTMLEntities(content);
          const encoded = plantumlEncoder.encode(rawContent);
          const plantUMLUrl =
            `https://www.plantuml.com/plantuml/svg/${encoded}`;
          return `<div class="plantuml-block my-4">
            <img src="${plantUMLUrl}" alt="PlantUML diagram" 
                 class="plantuml-diagram max-w-full h-auto rounded-lg shadow-lg" 
                 loading="lazy" decoding="async">
            <details class="mt-2">
              <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                Show PlantUML source
              </summary>
              <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                <code>${escapeHtml(rawContent)}</code>
              </pre>
            </details>
          </div>`;
        } catch (error) {
          console.warn("Failed to process PlantUML fallback block:", error);
          return match;
        }
      }
      return match;
    },
  );
  return html;
}

function decodeHTMLEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Processes BPMN blocks in HTML content
 */
function processBPMNBlocks(html: string): string {
  // Only match code blocks with class 'language-bpmn' or 'bpmn'
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre class="highlight">\s*<code[^>]*class="[^"]*(?:language-bpmn|bpmn)[^\"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      try {
        return `<div class="bpmn-block my-4">
          <div class="bpmn-diagram p-4 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
            <div class="text-center text-blue-600 dark:text-blue-400 mb-2">
              <svg class="inline w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              BPMN Diagram
            </div>
            <details class="mt-2">
              <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                Show BPMN source
              </summary>
              <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                <code>${escapeHtml(content)}</code>
              </pre>
            </details>
          </div>
        </div>`;
      } catch (error) {
        console.warn("Failed to process BPMN block:", error);
        return match;
      }
    },
  );
  // Fallback: match <pre> blocks whose content contains 'bpmn:' or '<?xml' and 'bpmn'
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      const text = content.trim();
      if (
        text.includes("bpmn:") ||
        (text.startsWith("<?xml") && text.includes("bpmn"))
      ) {
        try {
          return `<div class="bpmn-block my-4">
            <div class="bpmn-diagram p-4 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
              <div class="text-center text-blue-600 dark:text-blue-400 mb-2">
                <svg class="inline w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                BPMN Diagram
              </div>
              <details class="mt-2">
                <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                  Show BPMN source
                </summary>
                <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                  <code>${escapeHtml(content)}</code>
                </pre>
              </details>
            </div>
          </div>`;
        } catch (error) {
          console.warn("Failed to process BPMN fallback block:", error);
          return match;
        }
      }
      return match;
    },
  );
  return html;
}

/**
 * Processes TikZ blocks in HTML content
 */
function processTikZBlocks(html: string): string {
  // Only match code blocks with class 'language-tikz' or 'tikz'
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre class="highlight">\s*<code[^>]*class="[^"]*(?:language-tikz|tikz)[^"]*"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      try {
        return `<div class="tikz-block my-4">
          <div class="tikz-diagram p-4 bg-green-50 dark:bg-green-900 rounded-lg border border-green-200 dark:border-green-700">
            <div class="text-center text-green-600 dark:text-green-400 mb-2">
              <svg class="inline w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
              </svg>
              TikZ Diagram
            </div>
            <details class="mt-2">
              <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                Show TikZ source
              </summary>
              <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                <code>${escapeHtml(content)}</code>
              </pre>
            </details>
          </div>
        </div>`;
      } catch (error) {
        console.warn("Failed to process TikZ block:", error);
        return match;
      }
    },
  );
  // Fallback: match <pre> blocks whose content starts with \begin{tikzpicture} or contains tikz
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      const lines = content.trim().split("\n");
      if (
        lines[0].trim().startsWith("\\begin{tikzpicture}") ||
        content.includes("tikz")
      ) {
        try {
          return `<div class="tikz-block my-4">
            <div class="tikz-diagram p-4 bg-green-50 dark:bg-green-900 rounded-lg border border-green-200 dark:border-green-700">
              <div class="text-center text-green-600 dark:text-green-400 mb-2">
                <svg class="inline w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
                </svg>
                TikZ Diagram
              </div>
              <details class="mt-2">
                <summary class="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                  Show TikZ source
                </summary>
                <pre class="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                  <code>${escapeHtml(content)}</code>
                </pre>
              </details>
            </div>
          </div>`;
        } catch (error) {
          console.warn("Failed to process TikZ fallback block:", error);
          return match;
        }
      }
      return match;
    },
  );
  return html;
}

/**
 * Escapes HTML characters for safe display
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Processes ABC music notation blocks by mounting Svelte components
 * AI-NOTE: This runs client-side after the HTML is inserted into the DOM.
 * It finds .abc-notation-container elements and mounts ABCNotation components.
 */
async function processABCNotationBlocks(): Promise<void> {
  // Only run in browser environment
  if (typeof document === 'undefined') return;

  try {
    console.log('[ABC Post-processor] Starting processABCNotationBlocks');

    // Dynamic import of Svelte mount and ABCNotation component
    const { mount } = await import('svelte');
    const ABCNotation = (await import('$lib/components/markup/ABCNotation.svelte')).default;

    // Find all ABC notation containers
    const containers = document.querySelectorAll('.abc-notation-container:not([data-abc-mounted])');
    console.log('[ABC Post-processor] Found containers:', containers.length);

    for (const container of Array.from(containers)) {
      const abcContent = container.getAttribute('data-abc');
      if (abcContent) {
        try {
          // Decode HTML entities from the data attribute
          const unescapedAbc = decodeHTMLEntities(abcContent);
          console.log('[ABC Post-processor] Mounting component with ABC content:', unescapedAbc.substring(0, 50) + '...');

          // Clear the placeholder
          container.innerHTML = '';

          // Mount the Svelte component
          mount(ABCNotation, {
            target: container as HTMLElement,
            props: {
              abc: unescapedAbc,
              showControls: true,  // Phase 2: audio playback enabled
              responsive: true,
              scale: 1.0
            }
          });

          // Mark as mounted to prevent duplicate mounting
          container.setAttribute('data-abc-mounted', 'true');
          console.log('[ABC Post-processor] Successfully mounted component');
        } catch (error) {
          console.error('[ABC Post-processor] Failed to mount component:', error);
          container.innerHTML = `
            <div class="abc-notation-error p-4 bg-red-50 dark:bg-red-900 rounded-lg border border-red-300 dark:border-red-700">
              <p class="text-red-600 dark:text-red-400">Failed to render ABC notation</p>
            </div>
          `;
        }
      }
    }
  } catch (error) {
    console.error('[ABC Post-processor] Failed to load ABC component:', error);
  }
}
