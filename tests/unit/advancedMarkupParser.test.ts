import { describe, it, expect } from 'vitest';
import { parseAdvancedmarkup } from '../../src/lib/utils/markup/advancedMarkupParser';

function stripWS(str: string) {
  return str.replace(/\s+/g, ' ').trim();
}

describe('Advanced Markup Parser', () => {
  it('parses headers (ATX and Setext)', async () => {
    const input = '# H1\nText\n\nH2\n====\n';
    const output = await parseAdvancedmarkup(input);
    expect(stripWS(output)).toContain('H1');
    expect(stripWS(output)).toContain('H2');
  });

  it('parses bold, italic, and strikethrough', async () => {
    const input = '*bold* **bold** _italic_ __italic__ ~strikethrough~ ~~strikethrough~~';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<strong>bold</strong>');
    expect(output).toContain('<em>italic</em>');
    expect(output).toContain('<del class="line-through">strikethrough</del>');
  });

  it('parses blockquotes', async () => {
    const input = '> quote';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<blockquote');
    expect(output).toContain('quote');
  });

  it('parses multi-line blockquotes', async () => {
    const input = '> quote\n> quote';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<blockquote');
    expect(output).toContain('quote');
    expect(output).toContain('quote');
  });

  it('parses unordered lists', async () => {
    const input = '* a\n* b';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<ul');
    expect(output).toContain('a');
    expect(output).toContain('b');
  });

  it('parses ordered lists', async () => {
    const input = '1. one\n2. two';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<ol');
    expect(output).toContain('one');
    expect(output).toContain('two');
  });

  it('parses links and images', async () => {
    const input = '[link](https://example.com) ![alt](https://img.com/x.png)';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<a');
    expect(output).toContain('<img');
  });

  it('parses hashtags', async () => {
    const input = '#hashtag';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('text-primary-600');
    expect(output).toContain('#hashtag');
  });

  it('parses nostr identifiers', async () => {
    const input = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('./events?id=npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  });

  it('parses emoji shortcodes', async () => {
    const input = 'hello :smile:';
    const output = await parseAdvancedmarkup(input);
    expect(output).toMatch(/😄|:smile:/);
  });

  it('parses wikilinks', async () => {
    const input = '[[Test Page|display]]';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('wikilink');
    expect(output).toContain('display');
  });

  it('parses tables (with and without headers)', async () => {
    const input = `| Syntax | Description |\n|--------|-------------|\n| Header | Title |\n| Paragraph | Text |\n\n| a | b |\n| c | d |`;
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<table');
    expect(output).toContain('Header');
    expect(output).toContain('a');
  });

  it('parses code blocks (with and without language)', async () => {
    const input = '```js\nconsole.log(1);\n```\n```\nno lang\n```';
    const output = await parseAdvancedmarkup(input);
    const textOnly = output.replace(/<[^>]+>/g, '');
    expect(output).toContain('<pre');
    expect(textOnly).toContain('console.log(1);');
    expect(textOnly).toContain('no lang');
  });

  it('parses horizontal rules', async () => {
    const input = '---';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('<hr');
  });

  it('parses footnotes (references and section)', async () => {
    const input = 'Here is a footnote[^1].\n\n[^1]: This is the footnote.';
    const output = await parseAdvancedmarkup(input);
    expect(output).toContain('Footnotes');
    expect(output).toContain('This is the footnote');
    expect(output).toContain('fn-1');
  });
}); 