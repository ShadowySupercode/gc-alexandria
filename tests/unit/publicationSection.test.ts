import { describe, it, expect, vi } from "vitest";
import { parseAdvancedmarkup } from "../../src/lib/utils/markup/advancedMarkupParser";

describe("PublicationSection Parser Selection", () => {
  it("should use advanced markup parser for kind 30023 events", async () => {
    // Test content that would be different between Asciidoctor and advanced markup parser
    const testContent = `# Test Article

This is a **bold** text with _italic_ formatting.

\`\`\`javascript
console.log("Hello World");
\`\`\`

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

> This is a blockquote

[^1]: This is a footnote

Here is a footnote reference[^1].`;

    // Process with advanced markup parser
    const result = await parseAdvancedmarkup(testContent);

    // Verify that the advanced markup parser processed the content correctly
    // It should convert markdown headers to HTML
    expect(result).toContain("<h1");
    expect(result).toContain("Test Article");
    
    // It should convert bold and italic text
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
    
    // It should process code blocks
    expect(result).toContain("<pre");
    expect(result).toContain("Hello World");
    
    // It should process tables
    expect(result).toContain("<table");
    expect(result).toContain("Column 1");
    
    // It should process blockquotes
    expect(result).toContain("<blockquote");
    expect(result).toContain("This is a blockquote");
    
    // It should process footnotes
    expect(result).toContain("footnote");
  });

  it("should handle LaTeX math in kind 30023 events", async () => {
    const mathContent = `# Math Article

Inline math: \`$E = mc^2$\`

Display math:

\`$$
\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n
$$\`

More inline: \`$\\frac{1}{2}$\`

Square root example: \`$$\\sqrt{x}$$\``;

    const result = await parseAdvancedmarkup(mathContent);

    // Should process LaTeX math with proper HTML structure
    expect(result).toContain('<span class="math-inline">$E = mc^2$</span>');
    expect(result).toContain('<div class="math-block">$$\n\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n\n$$</div>');
    expect(result).toContain('<span class="math-inline">$\\frac{1}{2}$</span>');
    expect(result).toContain('<div class="math-block">$$\\sqrt{x}$$</div>');
  });

  it("should handle display math with $$ delimiters", async () => {
    const displayMathContent = `# Display Math Test

Here is a square root: \`$$\\sqrt{x}$$\`

And a fraction: \`$$\\frac{a}{b}$$\`

And a sum: \`$$\\sum_{i=1}^{n} x_i$$\``;

    const result = await parseAdvancedmarkup(displayMathContent);

    // Should process display math with $$ delimiters
    expect(result).toContain("math-block");
    expect(result).toContain("\\sqrt{x}");
    expect(result).toContain("\\frac{a}{b}");
    expect(result).toContain("\\sum_{i=1}^{n} x_i");
  });

  it("should handle AsciiMath expressions", async () => {
    const asciiMathContent = `# AsciiMath Test

Inline AsciiMath: \`$sum_(i=1)^n x_i$\`

Display AsciiMath: \`$$((1,2,3),(4,5,6),(7,8,9))$$\`

More inline: \`$sqrt(x^2 + y^2)$\`

Fraction: \`$frac(a,b)$\`

Matrix: \`$$((a,b),(c,d))$$\``;

    const result = await parseAdvancedmarkup(asciiMathContent);

    // Should process AsciiMath expressions
    expect(result).toContain('<span class="math-inline">$sum_(i=1)^n x_i$</span>');
    expect(result).toContain('<div class="math-block">$$((1,2,3),(4,5,6),(7,8,9))$$</div>');
    expect(result).toContain('<span class="math-inline">$sqrt(x^2 + y^2)$</span>');
    expect(result).toContain('<span class="math-inline">$frac(a,b)$</span>');
    expect(result).toContain('<div class="math-block">$$((a,b),(c,d))$$</div>');
  });

  it("should handle mixed LaTeX and AsciiMath", async () => {
    const mixedContent = `# Mixed Math Test

LaTeX inline: \`$\\frac{1}{2}$\`

AsciiMath inline: \`$frac(1,2)$\`

LaTeX display: \`$$\\sum_{i=1}^n x_i$$\`

AsciiMath display: \`$$sum_(i=1)^n x_i$$\`

LaTeX matrix: \`$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$\`

AsciiMath matrix: \`$$((a,b),(c,d))$$\``;

    const result = await parseAdvancedmarkup(mixedContent);

    // Should process both LaTeX and AsciiMath
    expect(result).toContain('<span class="math-inline">$\\frac{1}{2}$</span>');
    expect(result).toContain('<span class="math-inline">$frac(1,2)$</span>');
    expect(result).toContain('<div class="math-block">$$\\sum_{i=1}^n x_i$$</div>');
    expect(result).toContain('<div class="math-block">$$sum_(i=1)^n x_i$$</div>');
    expect(result).toContain('<div class="math-block">$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$</div>');
    expect(result).toContain('<div class="math-block">$$((a,b),(c,d))$$</div>');
  });
}); 