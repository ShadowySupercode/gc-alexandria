import { postProcessAsciidoctorHtml } from './asciidoctorPostProcessor';
import plantumlEncoder from 'plantuml-encoder';

/**
 * Unified post-processor for Asciidoctor HTML that handles:
 * - Math rendering (Asciimath/Latex, stem blocks)
 * - PlantUML diagrams
 * - BPMN diagrams  
 * - TikZ diagrams
 */
export async function postProcessAdvancedAsciidoctorHtml(html: string): Promise<string> {
  if (!html) return html;
  try {
    // First apply the basic post-processing (wikilinks, nostr addresses)
    let processedHtml = await postProcessAsciidoctorHtml(html);
    // Unified math block processing
    processedHtml = fixAllMathBlocks(processedHtml);
    // Process PlantUML blocks
    processedHtml = processPlantUMLBlocks(processedHtml);
    // Process BPMN blocks
    processedHtml = processBPMNBlocks(processedHtml);
    // Process TikZ blocks
    processedHtml = processTikZBlocks(processedHtml);
    // After all processing, apply highlight.js if available
    if (typeof window !== 'undefined' && typeof window.hljs?.highlightAll === 'function') {
      setTimeout(() => window.hljs!.highlightAll(), 0);
    }
    if (typeof window !== 'undefined' && typeof (window as any).MathJax?.typesetPromise === 'function') {
      setTimeout(() => (window as any).MathJax.typesetPromise(), 0);
    }
    return processedHtml;
  } catch (error) {
    console.error('Error in postProcessAdvancedAsciidoctorHtml:', error);
    return html; // Return original HTML if processing fails
  }
}

/**
 * Fixes all math blocks for MathJax rendering.
 * Handles stem blocks, inline math, and normalizes delimiters.
 */
function fixAllMathBlocks(html: string): string {
  // Unescape \$ to $ for math delimiters
  html = html.replace(/\\\$/g, '$');

  // DEBUG: Log the HTML before MathJax runs
  if (html.includes('latexmath')) {
    console.debug('Processed HTML for latexmath:', html);
  }

  // Block math: <div class="stemblock"><div class="content">...</div></div>
  html = html.replace(
    /<div class="stemblock">\s*<div class="content">([\s\S]*?)<\/div>\s*<\/div>/g,
    (_match, mathContent) => {
      // DEBUG: Log the original and cleaned math content
      console.debug('Block math original:', mathContent);
      console.debug('Block math char codes:', Array.from(mathContent as string).map((c: string) => c.charCodeAt(0)));
      let cleanMath = mathContent
        .replace(/<span>\$<\/span>/g, '')
        .replace(/<span>\$\$<\/span>/g, '')
        // Remove $ or $$ on their own line, or surrounded by whitespace/newlines
        .replace(/(^|[\n\r\s])\$([\n\r\s]|$)/g, '$1$2')
        .replace(/(^|[\n\r\s])\$\$([\n\r\s]|$)/g, '$1$2')
        // Remove all leading and trailing whitespace and $
        .replace(/^[\s$]+/, '').replace(/[\s$]+$/, '')
        .trim(); // Final trim to remove any stray whitespace or $
      console.debug('Block math cleaned:', cleanMath);
      console.debug('Block math cleaned char codes:', Array.from(cleanMath as string).map((c: string) => c.charCodeAt(0)));
      // Always wrap in $$...$$
      return `<div class="stemblock"><div class="content">$$${cleanMath}$$</div></div>`;
    }
  );
  // Inline math: <span>$</span> ... <span>$</span> (allow whitespace/newlines)
  html = html.replace(
    /<span>\$<\/span>\s*([\s\S]+?)\s*<span>\$<\/span>/g,
    (_match, mathContent) => `<span class="math-inline">$${mathContent.trim()}$</span>`
  );
  // Inline math: stem:[...] or latexmath:[...]
  html = html.replace(
    /stem:\[([^\]]+?)\]/g,
    (_match, content) => `<span class="math-inline">$${content.trim()}$</span>`
  );
  html = html.replace(
    /latexmath:\[([^\]]+?)\]/g,
    (_match, content) => `<span class="math-inline">\\(${content.trim().replace(/\\\\/g, '\\')}\\)</span>`
  );
  html = html.replace(
    /asciimath:\[([^\]]+?)\]/g,
    (_match, content) => `<span class="math-inline">\`${content.trim()}\`</span>`
  );
  return html;
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
        console.warn('Failed to process PlantUML block:', error);
        return match;
      }
    }
  );
  // Fallback: match <pre> blocks whose content starts with @startuml or @start (global, robust)
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      const lines = content.trim().split('\n');
      if (lines[0].trim().startsWith('@startuml') || lines[0].trim().startsWith('@start')) {
        try {
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
          console.warn('Failed to process PlantUML fallback block:', error);
          return match;
        }
      }
      return match;
    }
  );
  return html;
}

function decodeHTMLEntities(text: string): string {
  const textarea = document.createElement('textarea');
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
        console.warn('Failed to process BPMN block:', error);
        return match;
      }
    }
  );
  // Fallback: match <pre> blocks whose content contains 'bpmn:' or '<?xml' and 'bpmn'
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      const text = content.trim();
      if (text.includes('bpmn:') || (text.startsWith('<?xml') && text.includes('bpmn'))) {
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
          console.warn('Failed to process BPMN fallback block:', error);
          return match;
        }
      }
      return match;
    }
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
        console.warn('Failed to process TikZ block:', error);
        return match;
      }
    }
  );
  // Fallback: match <pre> blocks whose content starts with \begin{tikzpicture} or contains tikz
  html = html.replace(
    /<div class="listingblock">\s*<div class="content">\s*<pre>([\s\S]*?)<\/pre>\s*<\/div>\s*<\/div>/g,
    (match, content) => {
      const lines = content.trim().split('\n');
      if (lines[0].trim().startsWith('\\begin{tikzpicture}') || content.includes('tikz')) {
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
          console.warn('Failed to process TikZ fallback block:', error);
          return match;
        }
      }
      return match;
    }
  );
  return html;
}

/**
 * Escapes HTML characters for safe display
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
} 