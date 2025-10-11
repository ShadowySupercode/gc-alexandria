import { describe, expect, it } from "vitest";
import { parseAdvancedmarkup } from "../../src/lib/utils/markup/advancedMarkupParser.ts";

describe("Math Processing in Advanced Markup Parser", () => {
  it("should process inline math inside code blocks", async () => {
    const input =
      "Here is some inline math: `$x^2 + y^2 = z^2$` in a sentence.";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain(
      '<span class="math-inline">\\(x^2 + y^2 = z^2\\)</span>',
    );
    expect(result).toContain("Here is some inline math:");
    expect(result).toContain("in a sentence.");
  });

  it("should process display math inside code blocks", async () => {
    const input =
      "Here is a display equation:\n\n`$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$`\n\nThis is after the equation.";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain(
      '<span class="math-display">\\[\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n\\]</span>',
    );
    expect(result).toContain('<p class="my-4">Here is a display equation:</p>');
    expect(result).toContain('<p class="my-4">This is after the equation.</p>');
  });

  it("should process both inline and display math in the same code block", async () => {
    const input =
      "Mixed math: `$\\alpha$ and $$\\beta = \\frac{1}{2}$$` in one block.";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain('<span class="math-inline">\\(\\alpha\\)</span>');
    expect(result).toContain(
      '<span class="math-display">\\[\\beta = \\frac{1}{2}\\]</span>',
    );
    expect(result).toContain("Mixed math:");
    expect(result).toContain("in one block.");
  });

  it("should NOT process math outside of code blocks", async () => {
    const input = "This math $x^2 + y^2 = z^2$ should not be processed.";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain("$x^2 + y^2 = z^2$");
    expect(result).not.toContain('<span class="math-inline">');
    expect(result).not.toContain('<span class="math-display">');
  });

  it("should NOT process display math outside of code blocks", async () => {
    const input =
      "This display math $$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$ should not be processed.";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain(
      "$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$",
    );
    expect(result).not.toContain('<span class="math-inline">');
    expect(result).not.toContain('<span class="math-display">');
  });

  it("should handle code blocks without math normally", async () => {
    const input =
      "Here is some code: `console.log('hello world')` that should not be processed.";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain("`console.log('hello world')`");
    expect(result).not.toContain('<span class="math-inline">');
    expect(result).not.toContain('<span class="math-display">');
  });

  it("should handle complex math expressions with nested structures", async () => {
    const input =
      "Complex math: `$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\cdot \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}$$`";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain('<span class="math-display">');
    expect(result).toContain("\\begin{pmatrix}");
    expect(result).toContain("\\end{pmatrix}");
    expect(result).toContain("\\cdot");
  });

  it("should handle inline math with special characters", async () => {
    const input =
      "Special chars: `$\\alpha, \\beta, \\gamma, \\delta$` and `$\\sum_{i=1}^{n} x_i$`";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain(
      '<span class="math-inline">\\(\\alpha, \\beta, \\gamma, \\delta\\)</span>',
    );
    expect(result).toContain(
      '<span class="math-inline">\\(\\sum_{i=1}^{n} x_i\\)</span>',
    );
  });

  it("should handle multiple math expressions in separate code blocks", async () => {
    const input =
      "First: `$E = mc^2$` and second: `$$F = G\\frac{m_1 m_2}{r^2}$$`";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain('<span class="math-inline">\\(E = mc^2\\)</span>');
    expect(result).toContain(
      '<span class="math-display">\\[F = G\\frac{m_1 m_2}{r^2}\\]</span>',
    );
  });

  it("should handle math expressions with line breaks in display mode", async () => {
    const input =
      "Multi-line: `$$\n\\begin{align}\nx &= a + b \\\\\ny &= c + d\n\\end{align}\n$$`";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain('<span class="math-display">');
    expect(result).toContain("\\begin{align}");
    expect(result).toContain("\\end{align}");
    expect(result).toContain("x &= a + b");
    expect(result).toContain("y &= c + d");
  });

  it("should handle edge case with empty math expressions", async () => {
    const input = "Empty math: `$$` and `$`";
    const result = await parseAdvancedmarkup(input);

    // Should not crash and should preserve the original content
    expect(result).toContain("`$$`");
    expect(result).toContain("`$`");
  });

  it("should handle mixed content with regular text, code, and math", async () => {
    const input = `This is a paragraph with regular text.

Here is some code: \`console.log('hello')\`

And here is math: \`$\\pi \\approx 3.14159$\`

And display math: \`$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\`

And more regular text.`;

    const result = await parseAdvancedmarkup(input);

    // Should preserve regular text
    expect(result).toContain("This is a paragraph with regular text.");
    expect(result).toContain("And more regular text.");

    // Should preserve regular code blocks
    expect(result).toContain("`console.log('hello')`");

    // Should process math
    expect(result).toContain(
      '<span class="math-inline">\\(\\pi \\approx 3.14159\\)</span>',
    );
    expect(result).toContain('<span class="math-display">');
    expect(result).toContain("\\int_0^1 x^2 dx = \\frac{1}{3}");
  });

  it("should handle math expressions with dollar signs in the content", async () => {
    const input = "Price math: `$\\text{Price} = \\$19.99$`";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain('<span class="math-inline">');
    expect(result).toContain("\\text{Price} = \\$19.99");
  });

  it("should handle display math with dollar signs in the content", async () => {
    const input =
      "Price display: `$$\n\\text{Total} = \\$19.99 + \\$5.99 = \\$25.98\n$$`";
    const result = await parseAdvancedmarkup(input);

    expect(result).toContain('<span class="math-display">');
    expect(result).toContain("\\text{Total} = \\$19.99 + \\$5.99 = \\$25.98");
  });

  it("should handle JSON content with escaped backslashes", async () => {
    // Simulate content from JSON where backslashes are escaped
    const jsonContent = "Math from JSON: `$\\\\alpha + \\\\beta = \\\\gamma$`";
    const result = await parseAdvancedmarkup(jsonContent);

    expect(result).toContain('<span class="math-inline">');
    expect(result).toContain("\\\\alpha + \\\\beta = \\\\gamma");
  });

  it("should handle JSON content with escaped display math", async () => {
    // Simulate content from JSON where backslashes are escaped
    const jsonContent =
      "Display math from JSON: `$$\\\\int_0^1 x^2 dx = \\\\frac{1}{3}$$`";
    const result = await parseAdvancedmarkup(jsonContent);

    expect(result).toContain('<span class="math-display">');
    expect(result).toContain("\\\\int_0^1 x^2 dx = \\\\frac{1}{3}");
  });

  it("should handle JSON content with escaped dollar signs", async () => {
    // Simulate content from JSON where dollar signs are escaped
    const jsonContent =
      "Price math from JSON: `$\\\\text{Price} = \\\\\\$19.99$`";
    const result = await parseAdvancedmarkup(jsonContent);

    expect(result).toContain('<span class="math-inline">');
    expect(result).toContain("\\\\text{Price} = \\\\\\$19.99");
  });

  it("should handle complex JSON content with multiple escaped characters", async () => {
    // Simulate complex content from JSON
    const jsonContent =
      "Complex JSON math: `$$\\\\begin{pmatrix} a & b \\\\\\\\ c & d \\\\end{pmatrix} \\\\cdot \\\\begin{pmatrix} x \\\\\\\\ y \\\\end{pmatrix}$$`";
    const result = await parseAdvancedmarkup(jsonContent);

    expect(result).toContain('<span class="math-display">');
    expect(result).toContain("\\\\begin{pmatrix}");
    expect(result).toContain("\\\\end{pmatrix}");
    expect(result).toContain("\\\\cdot");
    expect(result).toContain("\\\\\\\\");
  });
});
