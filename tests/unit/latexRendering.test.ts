import { describe, it, expect } from "vitest";
import { parseAdvancedmarkup } from "../../src/lib/utils/markup/advancedMarkupParser";
import { readFileSync } from "fs";
import { join } from "path";

describe("LaTeX and AsciiMath Rendering in Inline Code Blocks", () => {
  const jsonPath = join(__dirname, "../../test_data/LaTeXtestfile.json");
  const raw = readFileSync(jsonPath, "utf-8");
  // Extract the markdown content field from the JSON event
  const content = JSON.parse(raw).content;

  it("renders LaTeX inline and display math correctly", async () => {
    const html = await parseAdvancedmarkup(content);
    // Test basic LaTeX examples from the test document
    expect(html).toMatch(/<span class="math-inline">\$\\sqrt\{x\}\$<\/span>/);
    expect(html).toMatch(/<div class="math-block">\$\$\\sqrt\{x\}\$\$<\/div>/);
    expect(html).toMatch(
      /<span class="math-inline">\$\\mathbb\{N\} = \\{ a \\in \\mathbb\{Z\} : a > 0 \\}\$<\/span>/,
    );
    expect(html).toMatch(
      /<div class="math-block">\$\$P \\left\( A=2 \\, \\middle\| \\, \\dfrac\{A\^2\}\{B\}>4 \\right\)\$\$<\/div>/,
    );
  });

  it("renders AsciiMath inline and display math correctly", async () => {
    const html = await parseAdvancedmarkup(content);
    // Test AsciiMath examples
    expect(html).toMatch(/<span class="math-inline">\$E=mc\^2\$<\/span>/);
    expect(html).toMatch(
      /<div class="math-block">\$\$sum_\(k=1\)\^n k = 1\+2\+ cdots \+n=\(n\(n\+1\)\)\/2\$\$<\/div>/,
    );
    expect(html).toMatch(
      /<div class="math-block">\$\$int_0\^1 x\^2 dx\$\$<\/div>/,
    );
  });

  it("renders LaTeX array and matrix environments as math", async () => {
    const html = await parseAdvancedmarkup(content);
    // Test array and matrix environments
    expect(html).toMatch(
      /<div class="math-block">\$\$[\s\S]*\\begin\{array\}\{ccccc\}[\s\S]*\\end\{array\}[\s\S]*\$\$<\/div>/,
    );
    expect(html).toMatch(
      /<div class="math-block">\$\$[\s\S]*\\begin\{bmatrix\}[\s\S]*\\end\{bmatrix\}[\s\S]*\$\$<\/div>/,
    );
  });

  it("handles unsupported LaTeX environments gracefully", async () => {
    const html = await parseAdvancedmarkup(content);
    // Should show a message and plaintext for tabular
    expect(html).toMatch(/<div class="unrendered-latex">/);
    expect(html).toMatch(
      /Unrendered, as it is LaTeX typesetting, not a formula:/,
    );
    expect(html).toMatch(/\\\\begin\{tabular\}/);
  });

  it("renders mixed LaTeX and AsciiMath correctly", async () => {
    const html = await parseAdvancedmarkup(content);
    // Test mixed content
    expect(html).toMatch(
      /<span class="math-inline">\$\\frac\{1\}\{2\}\$<\/span>/,
    );
    expect(html).toMatch(/<span class="math-inline">\$1\/2\$<\/span>/);
    expect(html).toMatch(
      /<div class="math-block">\$\$\\sum_\{i=1\}\^n x_i\$\$<\/div>/,
    );
    expect(html).toMatch(
      /<div class="math-block">\$\$sum_\(i=1\)\^n x_i\$\$<\/div>/,
    );
  });

  it("handles edge cases and regular code blocks", async () => {
    const html = await parseAdvancedmarkup(content);
    // Test regular code blocks (should remain as code, not math)
    expect(html).toMatch(/<code[^>]*>\$19\.99<\/code>/);
    expect(html).toMatch(/<code[^>]*>echo &quot;Price: \$100&quot;<\/code>/);
    expect(html).toMatch(
      /<code[^>]*>const price = \\`\$\$\{amount\}\\`<\/code>/,
    );
    expect(html).toMatch(/<code[^>]*>color: \$primary-color<\/code>/);
  });
});
