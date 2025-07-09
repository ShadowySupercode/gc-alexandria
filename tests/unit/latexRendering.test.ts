import { describe, it, expect } from "vitest";
import { parseAdvancedmarkup } from "../../src/lib/utils/markup/advancedMarkupParser";
import { readFileSync } from "fs";
import { join } from "path";

describe("LaTeX Math Rendering", () => {
  const mdPath = join(__dirname, "../../test_data/latex_markdown.md");
  const raw = readFileSync(mdPath, "utf-8");
  // Extract the markdown content field from the JSON
  const content = JSON.parse(raw).content;

  it('renders inline math as <span class="math-inline">', async () => {
    const html = await parseAdvancedmarkup(content);
    expect(html).toMatch(/<span class="math-inline">\$P \\neq NP\$<\/span>/);
    expect(html).toMatch(
      /<span class="math-inline">\$x_1 = \\text\{True\}\$<\/span>/,
    );
  });

  it('renders display math as <div class="math-block', async () => {
    const html = await parseAdvancedmarkup(content);
    // Representative display math
    expect(html).toMatch(
      /<div class="math-block my-4 text-center">\$\$\s*P_j = \\bigotimes/,
    );
    expect(html).toMatch(
      /<div class="math-block my-4 text-center">\$\$[\s\S]*?\\begin\{pmatrix\}/,
    );
    expect(html).toMatch(
      /<div class="math-block my-4 text-center">\$\$\\boxed\{P \\neq NP\}\$\$<\/div>/,
    );
  });

  it("does not wrap display math in <p> or <blockquote>", async () => {
    const html = await parseAdvancedmarkup(content);
    // No <p> or <blockquote> directly wrapping math-block
    expect(html).not.toMatch(/<p[^>]*>\s*<div class="math-block/);
    expect(html).not.toMatch(/<blockquote[^>]*>\s*<div class="math-block/);
  });

  it("renders LaTeX environments (pmatrix) within display math blocks", async () => {
    const html = await parseAdvancedmarkup(content);
    // Check that pmatrix is properly rendered within a display math block
    expect(html).toMatch(
      /<div class="math-block my-4 text-center">\$\$[\s\S]*?\\begin\{pmatrix\}[\s\S]*?\\end\{pmatrix\}[\s\S]*?\$\$<\/div>/,
    );
  });

  it('renders all math as math (no unwrapped $...$, $$...$$, \\(...\\), \\[...\\], or environments left)', async () => {
    const html = await parseAdvancedmarkup(content);
    // No unwrapped $...$ outside math-inline or math-block
    // Remove all math-inline and math-block tags and check for stray $...$
    const htmlNoMath = html
      .replace(/<span class="math-inline">\$[^$]+\$<\/span>/g, '')
      .replace(/<div class="math-block[^"]*">\$\$[\s\S]*?\$\$<\/div>/g, '')
      .replace(/<div class="math-block[^"]*">[\s\S]*?<\/div>/g, '');
    expect(htmlNoMath).not.toMatch(/\$[^\$\n]+\$/); // inline math
    expect(htmlNoMath).not.toMatch(/\$\$[\s\S]*?\$\$/); // display math
    expect(htmlNoMath).not.toMatch(/\\\([^)]+\\\)/); // \(...\)
    expect(htmlNoMath).not.toMatch(/\\\[[^\]]+\\\]/); // \[...\]
    expect(htmlNoMath).not.toMatch(/\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}/); // environments
    // No math inside code or pre
    expect(html).not.toMatch(/<code[\s\S]*?\$[\s\S]*?\$[\s\S]*?<\/code>/);
    expect(html).not.toMatch(/<pre[\s\S]*?\$[\s\S]*?\$[\s\S]*?<\/pre>/);
  });

  it('renders every line of the document: all math is wrapped', async () => {
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const html = await parseAdvancedmarkup(line);
      // If the line contains $...$, $$...$$, \(...\), \[...\], or bare LaTeX commands, it should be wrapped
      const hasMath = /\$[^$]+\$|\$\$[\s\S]*?\$\$|\\\([^)]+\\\)|\\\[[^\]]+\\\]|\\[a-zA-Z]+(\{[^}]*\})*/.test(line);
      if (hasMath) {
        const wrapped = /math-inline|math-block/.test(html);
        if (!wrapped) {
          // eslint-disable-next-line no-console
          console.error(`Line ${i + 1} failed:`, line);
          // eslint-disable-next-line no-console
          console.error('Rendered HTML:', html);
        }
        expect(wrapped).toBe(true);
      }
      // Should not have any unwrapped $...$, $$...$$, \(...\), \[...\], or bare LaTeX commands
      const stray = /(^|[^>])\$[^$\n]+\$|\$\$[\s\S]*?\$\$|\\\([^)]+\\\)|\\\[[^\]]+\\\]|\\[a-zA-Z]+(\{[^}]*\})*/.test(html);
      expect(stray).toBe(false);
    }
  });

  it('renders standalone math lines as display math blocks', async () => {
    const mdPath = require('path').join(__dirname, '../../test_data/latex_markdown.md');
    const raw = require('fs').readFileSync(mdPath, 'utf-8');
    const content = JSON.parse(raw).content || raw;
    const html = await parseAdvancedmarkup(content);
    // Example: Bures distance line
    expect(html).toMatch(/<div class="math-block my-4 text-center">\$\$d_B\([^$]+\) = [^$]+\$\$<\/div>/);
    // Example: P(\rho) = ...
    expect(html).toMatch(/<div class="math-block my-4 text-center">\$\$P\([^$]+\) = [^$]+\$\$<\/div>/);
  });
});
