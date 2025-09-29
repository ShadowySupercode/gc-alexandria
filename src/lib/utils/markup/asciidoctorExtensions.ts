// deno-lint-ignore-file no-this-alias no-explicit-any
import Processor from "asciidoctor";
import { renderTikZ } from "./tikzRenderer.ts";

// Simple PlantUML rendering using PlantUML server
function renderPlantUML(content: string): string {
  // Encode content for PlantUML server
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const plantUMLUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;

  return `<img src="${plantUMLUrl}" alt="PlantUML diagram" class="plantuml-diagram max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async">`;
}

/**
 * Creates Asciidoctor extensions for advanced content rendering
 * including Asciimath/Latex, PlantUML, BPMN, TikZ, and ABC music notation
 */
export function createAdvancedExtensions(): any {
  const Asciidoctor = Processor();
  const extensions = Asciidoctor.Extensions.create();

  // Math rendering extension (Asciimath/Latex)
  extensions.treeProcessor(function (this: any) {
    const dsl = this;
    dsl.process(function (this: any, document: any) {
      const treeProcessor = this;
      processMathBlocks(treeProcessor, document);
    });
  });

  // PlantUML rendering extension
  extensions.treeProcessor(function (this: any) {
    const dsl = this;
    dsl.process(function (this: any, document: any) {
      const treeProcessor = this;
      processPlantUMLBlocks(treeProcessor, document);
    });
  });

  // TikZ rendering extension
  extensions.treeProcessor(function (this: any) {
    const dsl = this;
    dsl.process(function (this: any, document: any) {
      const treeProcessor = this;
      processTikZBlocks(treeProcessor, document);
    });
  });

  // ABC music notation extension
  console.log('[ABC Extension] Registering ABC tree processor');
  extensions.treeProcessor(function (this: any) {
    console.log('[ABC Extension] Tree processor DSL invoked');
    const dsl = this;
    dsl.process(function (this: any, document: any) {
      console.log('[ABC Extension] Tree processor process() invoked');
      const treeProcessor = this;
      processABCBlocks(treeProcessor, document);
    });
  });

  // --- NEW: Support [plantuml], [tikz], [bpmn] as source blocks ---
  // Helper to register a block for a given name and treat it as a source block
  function registerDiagramBlock(name: string) {
    extensions.block(name, function (this: any) {
      const self = this;
      self.process(function (parent: any, reader: any, attrs: any) {
        // Read the block content
        const lines = reader.getLines();
        // Create a source block with the correct language and lang attributes
        const block = self.createBlock(parent, "source", lines, {
          ...attrs,
          language: name,
          lang: name,
          style: "source",
          role: name,
        });
        block.setAttribute("language", name);
        block.setAttribute("lang", name);
        block.setAttribute("style", "source");
        block.setAttribute("role", name);
        block.setOption("source", true);
        block.setOption("listing", true);
        block.setStyle("source");
        return block;
      });
    });
  }
  registerDiagramBlock("plantuml");
  registerDiagramBlock("tikz");
  registerDiagramBlock("bpmn");
  registerDiagramBlock("abc");
  // --- END NEW ---

  return extensions;
}

/**
 * Processes math blocks (stem blocks) and converts them to rendered HTML
 */
function processMathBlocks(_: any, document: any): void {
  const blocks = document.getBlocks();
  for (const block of blocks) {
    if (block.getContext() === "stem") {
      const content = block.getContent();
      if (content) {
        try {
          // Output as a single div with delimiters for MathJax
          const rendered = `<div class="math-block">$$${content}$$</div>`;
          block.setContent(rendered);
        } catch (error) {
          console.warn("Failed to render math:", error);
        }
      }
    }
    // Inline math: context 'inline' and style 'stem' or 'latexmath'
    if (
      block.getContext() === "inline" &&
      (block.getStyle() === "stem" || block.getStyle() === "latexmath")
    ) {
      const content = block.getContent();
      if (content) {
        try {
          const rendered = `<span class="math-inline">$${content}$</span>`;
          block.setContent(rendered);
        } catch (error) {
          console.warn("Failed to render inline math:", error);
        }
      }
    }
  }
}

/**
 * Processes PlantUML blocks and converts them to rendered SVG
 */
function processPlantUMLBlocks(_: any, document: any): void {
  const blocks = document.getBlocks();

  for (const block of blocks) {
    if (block.getContext() === "listing" && isPlantUMLBlock(block)) {
      const content = block.getContent();
      if (content) {
        try {
          // Use simple PlantUML rendering
          const rendered = renderPlantUML(content);

          // Replace the block content with the image
          block.setContent(rendered);
        } catch (error) {
          console.warn("Failed to render PlantUML:", error);
          // Keep original content if rendering fails
        }
      }
    }
  }
}

/**
 * Processes TikZ blocks and converts them to rendered SVG
 */
function processTikZBlocks(_: any, document: any): void {
  const blocks = document.getBlocks();

  for (const block of blocks) {
    if (block.getContext() === "listing" && isTikZBlock(block)) {
      const content = block.getContent();
      if (content) {
        try {
          // Render TikZ to SVG
          const svg = renderTikZ(content);

          // Replace the block content with the SVG
          block.setContent(svg);
        } catch (error) {
          console.warn("Failed to render TikZ:", error);
          // Keep original content if rendering fails
        }
      }
    }
  }
}

/**
 * Checks if a block contains PlantUML content
 */
function isPlantUMLBlock(block: any): boolean {
  const content = block.getContent() || "";
  const lines = content.split("\n");

  // Check for PlantUML indicators
  return lines.some(
    (line: string) =>
      line.trim().startsWith("@startuml") ||
      line.trim().startsWith("@start") ||
      line.includes("plantuml") ||
      line.includes("uml"),
  );
}

/**
 * Checks if a block contains TikZ content
 */
function isTikZBlock(block: any): boolean {
  const content = block.getContent() || "";
  const lines = content.split("\n");

  // Check for TikZ indicators
  return lines.some(
    (line: string) =>
      line.trim().startsWith("\\begin{tikzpicture}") ||
      line.trim().startsWith("\\tikz") ||
      line.includes("tikzpicture") ||
      line.includes("tikz"),
  );
}

/**
 * Processes ABC music notation blocks and prepares them for client-side rendering
 * AI-NOTE: Unlike PlantUML/TikZ, ABC rendering happens client-side with abcjs.
 * This function wraps the ABC content in a container div with a data attribute
 * for the post-processor to mount the Svelte component.
 */
function processABCBlocks(processor: any, document: any): void {
  console.log('[ABC Extension] Starting processABCBlocks');

  // AI-NOTE: Recursively walk the block tree to find all listing/source blocks
  function walkBlocks(parent: any, blocks: any[] = []): any[] {
    const children = parent.getBlocks?.() || [];
    console.log('[ABC Extension] walkBlocks: parent has', children.length, 'children');

    for (const block of children) {
      blocks.push(block);
      // Recursively walk children
      walkBlocks(block, blocks);
    }
    return blocks;
  }

  const allBlocks = walkBlocks(document);
  console.log('[ABC Extension] Found blocks:', allBlocks.length);

  for (const block of allBlocks) {
    const context = block.getContext();
    const isABC = isABCBlock(block);
    console.log('[ABC Extension] Block context:', context, 'isABC:', isABC);

    // AI-NOTE: Only process listing/source blocks - sections don't have setContent()
    if ((context === "listing" || context === "source") && isABC) {
      console.log('[ABC Extension] Processing ABC block');
      const content = block.getContent();

      if (content) {
        try {
          // Escape HTML entities for safe data attribute storage
          const escaped = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

          // Create container div with data attribute for post-processing
          const rendered = `<div class="abc-notation-container" data-abc="${escaped}">
  <div class="abc-notation-placeholder">
    <p class="text-gray-600 dark:text-gray-400">Loading ABC notation...</p>
  </div>
</div>`;

          // AI-NOTE: In Asciidoctor.js tree processors, blocks can't use setContent()
          // Instead, we create a pass block (which allows raw HTML) and replace the original
          const parent = block.getParent();
          const passBlock = processor.createBlock(parent, "pass", rendered);

          // Find the block's index in parent and replace it
          const blocks = parent.getBlocks();
          for (let i = 0; i < blocks.length; i++) {
            if (blocks[i] === block) {
              blocks[i] = passBlock;
              break;
            }
          }
        } catch (error) {
          console.warn("Failed to prepare ABC notation:", error);
        }
      }
    }
  }
}

/**
 * Checks if a block contains ABC music notation content
 * AI-NOTE: Checks both attributes (set by registerDiagramBlock) and content patterns
 * to ensure we catch ABC blocks regardless of how they're specified
 */
function isABCBlock(block: any): boolean {
  // Check attributes first
  const lang = block.getAttribute("language") || block.getAttribute("lang");
  const role = block.getAttribute("role");
  const style = block.getAttribute("style");

  if (lang === "abc" || role === "abc" || style === "abc") {
    return true;
  }

  // Fallback: check content for ABC notation patterns
  const content = block.getContent();

  // AI-NOTE: Content might not be a string (could be array, undefined, etc)
  if (!content || typeof content !== "string") {
    return false;
  }

  const lines = content.split("\n");

  // ABC notation typically starts with X: (reference number) or has K: (key signature)
  return lines.some(
    (line: string) => {
      const trimmed = line.trim();
      return trimmed.match(/^X:\s*\d+/) || // Reference number
             trimmed.match(/^K:\s*[A-G]/) || // Key signature
             (trimmed.match(/^T:/) && content.includes("K:")); // Title with key signature elsewhere
    }
  );
}
