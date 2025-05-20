import { describe, it, expect } from 'vitest';
import { parseBasicmarkup } from '../../src/lib/utils/markup/basicMarkupParser';
import { parseAdvancedmarkup } from '../../src/lib/utils/markup/advancedMarkupParser';
import { readFileSync } from 'fs';
import { join } from 'path';

const testFilePath = join(__dirname, './markupTestfile.md');
const md = readFileSync(testFilePath, 'utf-8');

describe('Markup Integration Test', () => {
  it('parses markupTestfile.md with the basic parser', async () => {
    const output = await parseBasicmarkup(md);
    // Headers (should be present as text, not <h1> tags)
    expect(output).toContain('This is a test');
    expect(output).toContain('============');
    expect(output).toContain('### Disclaimer');
    // Unordered list
    expect(output).toContain('<ul');
    expect(output).toContain('but');
    // Ordered list
    expect(output).toContain('<ol');
    expect(output).toContain('first');
    // Nested lists
    expect(output).toMatch(/<ul[^>]*>.*<ul[^>]*>/s);
    // Blockquotes
    expect(output).toContain('<blockquote');
    expect(output).toContain('This is important information');
    // Inline code
    expect(output).toContain('<div class="leather min-h-full w-full flex flex-col items-center">');
    // Images
    expect(output).toMatch(/<img[^>]+src="https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/f\/f1\/Heart_coraz%C3%B3n\.svg"/);
    // Links
    expect(output).toMatch(/<a[^>]+href="https:\/\/github.com\/nostrability\/nostrability\/issues\/146"/);
    // Hashtags
    expect(output).toContain('text-primary-600');
    // Nostr identifiers (should be Alexandria links)
    expect(output).toContain('./events?id=npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z');
    // Wikilinks
    expect(output).toContain('wikilink');
    // YouTube iframe
    expect(output).toMatch(/<iframe[^>]+youtube/);
    // Tracking token removal: should not contain utm_, fbclid, or gclid in any link
    expect(output).not.toMatch(/utm_/);
    expect(output).not.toMatch(/fbclid/);
    expect(output).not.toMatch(/gclid/);
    // Horizontal rule (should be present as --- in basic)
    expect(output).toContain('---');
    // Footnote references (should be present as [^1] in basic)
    expect(output).toContain('[^1]');
    // Table (should be present as | Syntax | Description | in basic)
    expect(output).toContain('| Syntax      | Description |');
  });

  it('parses markupTestfile.md with the advanced parser', async () => {
    const output = await parseAdvancedmarkup(md);
    // Headers
    expect(output).toContain('<h1');
    expect(output).toContain('<h2');
    expect(output).toContain('Disclaimer');
    // Unordered list
    expect(output).toContain('<ul');
    expect(output).toContain('but');
    // Ordered list
    expect(output).toContain('<ol');
    expect(output).toContain('first');
    // Nested lists
    expect(output).toMatch(/<ul[^>]*>.*<ul[^>]*>/s);
    // Blockquotes
    expect(output).toContain('<blockquote');
    expect(output).toContain('This is important information');
    // Inline code
    expect(output).toMatch(/<code[^>]*>.*leather min-h-full w-full flex flex-col items-center.*<\/code>/s);
    // Images
    expect(output).toMatch(/<img[^>]+src="https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/f\/f1\/Heart_coraz%C3%B3n\.svg"/);
    // Links
    expect(output).toMatch(/<a[^>]+href="https:\/\/github.com\/nostrability\/nostrability\/issues\/146"/);
    // Hashtags
    expect(output).toContain('text-primary-600');
    // Nostr identifiers (should be Alexandria links)
    expect(output).toContain('./events?id=npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z');
    // Wikilinks
    expect(output).toContain('wikilink');
    // YouTube iframe
    expect(output).toMatch(/<iframe[^>]+youtube/);
    // Tracking token removal: should not contain utm_, fbclid, or gclid in any link
    expect(output).not.toMatch(/utm_/);
    expect(output).not.toMatch(/fbclid/);
    expect(output).not.toMatch(/gclid/);
    // Horizontal rule
    expect(output).toContain('<hr');
    // Footnote references and section
    expect(output).toContain('Footnotes');
    expect(output).toMatch(/<li id=\"fn-1\">/);
    // Table
    expect(output).toContain('<table');
    // Code blocks
    expect(output).toContain('<pre');
  });
}); 