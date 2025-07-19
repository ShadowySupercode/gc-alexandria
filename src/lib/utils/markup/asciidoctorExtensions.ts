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
 * including Asciimath/Latex, PlantUML, BPMN, and TikZ
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
