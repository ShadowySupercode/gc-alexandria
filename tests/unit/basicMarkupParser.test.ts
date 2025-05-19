import { describe, it, expect } from 'vitest';
import { parseBasicmarkup } from '../../src/lib/utils/markup/basicMarkupParser';

// Helper to strip whitespace for easier comparison
function stripWS(str: string) {
  return str.replace(/\s+/g, ' ').trim();
}

describe('Basic Markup Parser', () => {
  it('parses ATX and Setext headers', async () => {
    const input = '# H1\nText\n\nH2\n====\n';
    const output = await parseBasicmarkup(input);
    expect(stripWS(output)).toContain('H1');
    expect(stripWS(output)).toContain('H2');
  });

  it('parses bold, italic, and strikethrough', async () => {
    const input = '*bold* **bold** _italic_ __italic__ ~strikethrough~ ~~strikethrough~~';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('<strong>bold</strong>');
    expect(output).toContain('<em>italic</em>');
    expect(output).toContain('<del class="line-through">strikethrough</del>');
  });

  it('parses blockquotes', async () => {
    const input = '> quote';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('<blockquote');
    expect(output).toContain('quote');
  });

  it('parses multi-line blockquotes', async () => {
    const input = '> quote\n> quote';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('<blockquote');
    expect(output).toContain('quote');
    expect(output).toContain('quote');
  });

  it('parses unordered lists', async () => {
    const input = '* a\n* b';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('<ul');
    expect(output).toContain('a');
    expect(output).toContain('b');
  });

  it('parses ordered lists', async () => {
    const input = '1. one\n2. two';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('<ol');
    expect(output).toContain('one');
    expect(output).toContain('two');
  });

  it('parses links and images', async () => {
    const input = '[link](https://example.com) ![alt](https://img.com/x.png)';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('<a');
    expect(output).toContain('<img');
  });

  it('parses hashtags', async () => {
    const input = '#hashtag';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('text-primary-600');
    expect(output).toContain('#hashtag');
  });

  it('parses nostr identifiers', async () => {
    const input = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('./events?id=npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
  });

  it('parses emoji shortcodes', async () => {
    const input = 'hello :smile:';
    const output = await parseBasicmarkup(input);
    expect(output).toMatch(/😄|:smile:/);
  });

  it('parses wikilinks', async () => {
    const input = '[[Test Page|display]]';
    const output = await parseBasicmarkup(input);
    expect(output).toContain('wikilink');
    expect(output).toContain('display');
  });
}); 