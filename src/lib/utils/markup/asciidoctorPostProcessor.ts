import {
  processAsciiDocAnchors,
  processImageWithReveal,
  processNostrIdentifiersInText,
  processWikilinks,
} from "./markupUtils.ts";

/**
 * Processes AsciiDoc image blocks to add reveal/enlarge functionality
 */
function processImageBlocks(html: string): string {
  // Process image blocks with reveal functionality
  return html.replace(
    /<div class="imageblock">\s*<div class="content">\s*<img([^>]+)>\s*<\/div>\s*(?:<div class="title">([^<]+)<\/div>)?\s*<\/div>/g,
    (match, imgAttributes, title) => {
      // Extract src and alt from img attributes
      const srcMatch = imgAttributes.match(/src="([^"]+)"/);
      const altMatch = imgAttributes.match(/alt="([^"]*)"/);
      const src = srcMatch ? srcMatch[1] : "";
      const alt = altMatch ? altMatch[1] : "";

      const titleHtml = title ? `<div class="title">${title}</div>` : "";

      return `<div class="imageblock">
        <div class="content">
          ${processImageWithReveal(src, alt)}
        </div>
        ${titleHtml}
      </div>`;
    },
  );
}

/**
 * Fixes AsciiDoctor stem blocks for MathJax rendering.
 * Joins split spans and wraps content in $$...$$ for block math.
 */
function fixStemBlocks(html: string): string {
  // Replace <div class="stemblock"><div class="content"><span>$</span>...<span>$</span></div></div>
  // with <div class="stemblock"><div class="content">$$...$$</div></div>
  return html.replace(
    /<div class="stemblock">\s*<div class="content">\s*<span>\$<\/span>([\s\S]*?)<span>\$<\/span>\s*<\/div>\s*<\/div>/g,
    (_match, mathContent) => {
      // Remove any extra tags inside mathContent
      const cleanMath = mathContent.replace(/<\/?span[^>]*>/g, "").trim();
      return `<div class="stemblock"><div class="content">$$${cleanMath}$$</div></div>`;
    },
  );
}

/**
 * Post-processes asciidoctor HTML output to add wikilink and nostr address rendering.
 * This function should be called after asciidoctor.convert() to enhance the HTML output.
 */
export async function postProcessAsciidoctorHtml(
  html: string,
): Promise<string> {
  if (!html) return html;

  try {
    // First process AsciiDoctor-generated anchors
    let processedHtml = processAsciiDocAnchors(html);
    // Then process wikilinks in [[...]] format (if any remain)
    processedHtml = processWikilinks(processedHtml);
    // Then process nostr addresses (but not those already in links)
    processedHtml = await processNostrIdentifiersInText(processedHtml);
    processedHtml = fixStemBlocks(processedHtml); // Fix math blocks for MathJax
    // Process image blocks to add reveal/enlarge functionality
    processedHtml = processImageBlocks(processedHtml);

    return processedHtml;
  } catch (error) {
    console.error("Error in postProcessAsciidoctorHtml:", error);
    return html; // Return original HTML if processing fails
  }
}
