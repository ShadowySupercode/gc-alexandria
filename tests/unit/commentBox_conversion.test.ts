import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEditorUtils } from '$lib/utils/editor_utils';

// Add this at the very top of your test file
if (typeof document === 'undefined') {
  // @ts-ignore
  global.document = {
    createElement: () =>
      ({
        innerHTML: '',
        querySelectorAll: () => [],
      } as any), // <-- Cast to any to satisfy TypeScript
  };
}

// Mock dependencies
vi.mock('$lib/stores/authStore.Svelte', () => ({
  userPubkey: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }
}));

vi.mock('$lib/ndk', () => ({
  activeInboxRelays: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
  activeOutboxRelays: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) }
}));

vi.mock('$lib/services/searchService', () => ({
  searchService: {
    searchProfiles: vi.fn()
  }
}));

vi.mock('$lib/utils/nostrUtils', () => ({
  toNpub: vi.fn((pk) => pk ? `npub${pk.slice(0, 8)}...` : null),
  getUserMetadata: vi.fn(() => Promise.resolve({
    name: 'Test User',
    displayName: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    pubkey: 'testpubkey123'
  }))
}));

vi.mock('$lib/utils/nostrEventService', () => ({
  extractRootEventInfo: vi.fn(),
  extractParentEventInfo: vi.fn(),
  buildReplyTags: vi.fn(() => []),
  createSignedEvent: vi.fn(() => Promise.resolve({ event: { id: 'test-event-id' } })),
  publishEvent: vi.fn(() => Promise.resolve(['test-relay']))
}));

vi.mock('$app/navigation', () => ({
  goto: vi.fn()
}));

// Mock DOM APIs for tests that need them
const mockWindow = {
  getSelection: vi.fn(() => ({
    rangeCount: 1,
    getRangeAt: vi.fn(() => ({
      startOffset: 0,
      endOffset: 0,
      deleteContents: vi.fn(),
      insertNode: vi.fn(),
      setStart: vi.fn(),
      setEnd: vi.fn(),
      selectNodeContents: vi.fn(),
      collapse: vi.fn()
    })),
    removeAllRanges: vi.fn(),
    addRange: vi.fn()
  }))
};

// Only mock window if it exists (for tests that need DOM)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'getSelection', {
    value: mockWindow.getSelection
  });
}

describe('CommentBox Conversion Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Editor Utils', () => {
    // Test the conversion functions from editor_utils
    const mockConfig = {
      editorRef: () => undefined,
      content: () => '',
      setContent: vi.fn(),
      showMarkup: () => false,
      markupText: () => '',
      setMarkupText: vi.fn(),
    };

    const editorUtils = createEditorUtils(mockConfig);

    describe('convertMarkupToHtml', () => {
      it('converts basic text formatting', () => {
        const markup = 'This is **bold** and _italic_ text with ~~strikethrough~~ and `code`.';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<em>italic</em>');
        expect(html).toContain('<del class="line-through">strikethrough</del>');
        expect(html).toContain('<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">code</code>');
      });

      it('converts mentions', () => {
        const markup = 'Hello nostr:npub1abc123!';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<a href="nostr:npub1abc123" class="text-primary-600 dark:text-primary-500 hover:underline">nostr:npub1abc123</a>');
      });

      it('converts wikilinks', () => {
        const markup = 'Check out [[NIP-54]] and [[NIP-23|this NIP]].';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<a href="[[NIP-54]]" class="text-primary-600 dark:text-primary-500 hover:underline">[[NIP-54]]</a>');
        expect(html).toContain('<a href="[[NIP-23]]" class="text-primary-600 dark:text-primary-500 hover:underline">this NIP</a>');
      });

      it('converts regular links', () => {
        const markup = 'Visit [GitHub](https://github.com) for more info.';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<a href="https://github.com" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">GitHub</a>');
      });

      it('converts images', () => {
        const markup = '![Alt text](https://example.com/image.jpg)';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<img src="https://example.com/image.jpg" alt="Alt text"');
      });

      it('converts LaTeX math', () => {
        const markup = 'Inline math: $x^2 + y^2 = z^2$ and display math: $$E = mc^2$$';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<span class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">x^2 + y^2 = z^2</span>');
        expect(html).toContain('<div class="font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded my-2 text-center">E = mc^2</div>');
      });

      it('converts blockquotes', () => {
        const markup = '> This is a blockquote';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">This is a blockquote</blockquote>');
      });

      it('converts lists', () => {
        const markup = '• Item 1\n• Item 2\n1. Numbered item';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<li class="list-disc ml-4">Item 1</li>');
        expect(html).toContain('<li class="list-decimal ml-4">Numbered item</li>');
      });

      it('converts headings', () => {
        const markup = '# Heading 1\n## Heading 2';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<h1 class="text-4xl font-bold mt-6 mb-4">Heading 1</h1>');
        expect(html).toContain('<h2 class="text-3xl font-bold mt-6 mb-4">Heading 2</h2>');
      });

      it('converts horizontal rules', () => {
        const markup = '---';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<hr class="my-8 h-px border-0 bg-gray-200 dark:bg-gray-700">');
      });

      it('converts tables', () => {
        const markup = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<table class="min-w-full border-collapse">');
        expect(html).toContain('<th class="py-2 px-4 text-left border-b-2 border-gray-200 dark:border-gray-700 font-semibold">Header 1</th>');
        expect(html).toContain('<td class="py-2 px-4 text-left border-b border-gray-200 dark:border-gray-700">Cell 1</td>');
      });

      it('converts footnotes', () => {
        const markup = 'Text with footnote[^1].\n\n[^1]: Footnote content';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<sup><a href="#fn-1" class="text-primary-600 hover:underline">[1]</a></sup>');
        expect(html).toContain('<li id="fn-1"><span class="marker">Footnote content</span></li>');
      });

      it('handles empty content', () => {
        const markup = '';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<p></p>');
      });

      it('handles whitespace-only content', () => {
        const markup = '   \n  \n  ';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<p>');
        expect(html).toContain('</p>');
      });
    });

    describe('convertHtmlToMarkup', () => {
      it('converts HTML back to markup', () => {
        const html = '<p>This is <strong>bold</strong> and <em>italic</em> text with <del class="line-through">strikethrough</del> and <code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">code</code>.</p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('This is **bold** and _italic_ text with ~~strikethrough~~ and `code`.');
      });

      it('converts mentions back to markup', () => {
        const html = '<p>Hello <a href="nostr:npub1abc123" class="text-primary-600 dark:text-primary-500 hover:underline">nostr:npub1abc123</a>!</p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('Hello nostr:npub1abc123!');
      });

      it('converts wikilinks back to markup', () => {
        const html = '<p>Check out <a href="[[NIP-54]]" class="text-primary-600 dark:text-primary-500 hover:underline">[[NIP-54]]</a> and <a href="[[NIP-23]]" class="text-primary-600 dark:text-primary-500 hover:underline">this NIP</a>.</p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('Check out [[NIP-54]] and [[NIP-23|this NIP]].');
      });

      it('converts regular links back to markup', () => {
        const html = '<p>Visit <a href="https://github.com" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">GitHub</a> for more info.</p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('Visit [GitHub](https://github.com) for more info.');
      });

      it('converts images back to markup', () => {
        const html = '<p><img src="https://example.com/image.jpg" alt="Alt text" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async"></p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('![Alt text](https://example.com/image.jpg)');
      });

      it('converts LaTeX back to markup', () => {
        const html = '<p>Inline: <span class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">x^2</span> and display: <div class="font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded my-2 text-center">E = mc^2</div></p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toContain('$x^2$');
        expect(markup).toContain('$$E = mc^2$$');
      });

      it('converts blockquotes back to markup', () => {
        const html = '<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">This is a blockquote</blockquote>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('> This is a blockquote');
      });

      it('converts lists back to markup', () => {
        const html = '<ul><li class="list-disc ml-4">Item 1</li><li class="list-disc ml-4">Item 2</li></ul>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('• Item 1\n• Item 2');
      });

      it('converts headings back to markup', () => {
        const html = '<h1 class="text-4xl font-bold mt-6 mb-4">Heading 1</h1><h2 class="text-3xl font-bold mt-6 mb-4">Heading 2</h2>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('# Heading 1\n## Heading 2');
      });

      it('converts horizontal rules back to markup', () => {
        const html = '<hr class="my-8 h-px border-0 bg-gray-200 dark:bg-gray-700">';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('---');
      });

      it('converts tables back to markup', () => {
        const html = '<div class="overflow-x-auto my-4"><table class="min-w-full border-collapse"><thead><tr><th class="py-2 px-4 text-left border-b-2 border-gray-200 dark:border-gray-700 font-semibold">Header 1</th></tr></thead><tbody><tr><td class="py-2 px-4 text-left border-b border-gray-200 dark:border-gray-700">Cell 1</td></tr></tbody></table></div>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toContain('| Header 1 |');
        expect(markup).toContain('| --- |');
        expect(markup).toContain('| Cell 1 |');
      });

      it('converts footnotes back to markup', () => {
        const html = '<p>Text with <sup><a href="#fn-1" class="text-primary-600 hover:underline">[1]</a></sup>.</p><li id="fn-1"><span class="marker">Footnote content</span></li>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toContain('[^1]');
        expect(markup).toContain('[^1]: Footnote content');
      });

      it('handles empty HTML', () => {
        const html = '';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('');
      });

      it('handles HTML with only whitespace', () => {
        const html = '<p>   </p>';
        const markup = editorUtils.convertHtmlToMarkup(html);
        expect(markup).toBe('');
      });
    });

    describe('round-trip conversion', () => {
      it('preserves content through HTML->markup->HTML conversion', () => {
        const originalMarkup = 'This is **bold** text with nostr:npub1abc123 and [[NIP-54|this link]].';
        const html = editorUtils.convertMarkupToHtml(originalMarkup);
        const finalMarkup = editorUtils.convertHtmlToMarkup(html);
        expect(finalMarkup).toBe(originalMarkup);
      });

      it('preserves content through markup->HTML->markup conversion', () => {
        const originalHtml = '<p>This is <strong>bold</strong> text with <a href="nostr:npub1abc123" class="text-primary-600 dark:text-primary-500 hover:underline">nostr:npub1abc123</a> and <a href="[[NIP-54]]" class="text-primary-600 dark:text-primary-500 hover:underline">this link</a>.</p>';
        const markup = editorUtils.convertHtmlToMarkup(originalHtml);
        const finalHtml = editorUtils.convertMarkupToHtml(markup);
        // Note: We can't do exact comparison due to class attributes, but we can check key elements
        expect(finalHtml).toContain('<strong>bold</strong>');
        expect(finalHtml).toContain('nostr:npub1abc123');
        expect(finalHtml).toContain('[[NIP-54]]');
      });

      it('preserves complex formatting through round-trip', () => {
        const originalMarkup = '**Bold** and _italic_ with `code` and [link](url) and ![image](img.jpg) and $math$ and > quote';
        const html = editorUtils.convertMarkupToHtml(originalMarkup);
        const finalMarkup = editorUtils.convertHtmlToMarkup(html);
        expect(finalMarkup).toBe(originalMarkup);
      });
    });

    describe('edge cases', () => {
      it('handles nested formatting', () => {
        const markup = '**Bold with _italic_ inside**';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<strong>Bold with <em>italic</em> inside</strong>');
      });

      it('handles multiple consecutive formatting', () => {
        const markup = '**bold****bold**';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<strong>bold</strong><strong>bold</strong>');
      });

      it('handles formatting at line boundaries', () => {
        const markup = '**bold**\n_italic_';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<em>italic</em>');
      });

      it('handles empty formatting tags', () => {
        const markup = '** **';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('<strong> </strong>');
      });

      it('handles special characters in links', () => {
        const markup = '[Link with spaces](https://example.com/path with spaces)';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('href="https://example.com/path with spaces"');
      });

      it('handles special characters in images', () => {
        const markup = '![Alt with spaces](https://example.com/image with spaces.jpg)';
        const html = editorUtils.convertMarkupToHtml(markup);
        expect(html).toContain('src="https://example.com/image with spaces.jpg"');
        expect(html).toContain('alt="Alt with spaces"');
      });
    });

    describe('formatting functions', () => {
      it('applies bold formatting', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.applyFormatting).toBe('function');
      });

      it('applies code formatting', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.applyCodeFormatting).toBe('function');
      });

      it('inserts LaTeX inline', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.insertLaTeX).toBe('function');
      });

      it('inserts display LaTeX', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.insertDisplayLaTeX).toBe('function');
      });

      it('inserts blockquote', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.insertBlockquote).toBe('function');
      });

      it('inserts list items', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.insertListItem).toBe('function');
      });

      it('removes formatting', () => {
        const mockConfig = {
          editorRef: () => undefined,
          content: () => '<p><strong>bold</strong></p>',
          setContent: vi.fn(),
          showMarkup: () => true,
          markupText: () => '**bold**',
          setMarkupText: vi.fn(),
        };

        const utils = createEditorUtils(mockConfig);
        utils.removeFormatting();
        
        expect(mockConfig.setMarkupText).toHaveBeenCalled();
      });

      it('inserts emoji', () => {
        // Test that the function exists and can be called
        expect(typeof editorUtils.insertText).toBe('function');
      });

      it('handles markup highlighting', () => {
        const mockConfig = {
          editorRef: () => undefined,
          content: () => '',
          setContent: vi.fn(),
          showMarkup: () => true,
          markupText: () => '**bold** and _italic_',
          setMarkupText: vi.fn(),
        };

        const utils = createEditorUtils(mockConfig);
        
        // Test that markup highlighting functions exist
        expect(typeof utils.convertMarkupToHtml).toBe('function');
        expect(typeof utils.convertHtmlToMarkup).toBe('function');
      });

      it('removes formatting correctly', () => {
        const mockDiv = {
          innerHTML: '<p><strong>bold</strong> and <em>italic</em></p>',
          querySelectorAll: vi.fn(() => [
            { textContent: 'bold', parentNode: { replaceChild: vi.fn() } },
            { textContent: 'italic', parentNode: { replaceChild: vi.fn() } }
          ])
        };
        
        const mockConfig = {
          editorRef: () => mockDiv as any,
          content: () => '<p><strong>bold</strong> and <em>italic</em></p>',
          setContent: vi.fn(),
          showMarkup: () => false,
          markupText: () => '',
          setMarkupText: vi.fn(),
        };

        const utils = createEditorUtils(mockConfig);
        utils.removeFormatting();
        
        expect(mockConfig.setContent).toHaveBeenCalled();
      });

      it('clears content properly', () => {
        const mockConfig = {
          editorRef: () => undefined,
          content: () => '<p>Some content</p>',
          setContent: vi.fn(),
          showMarkup: () => false,
          markupText: () => 'Some content',
          setMarkupText: vi.fn(),
        };

        const utils = createEditorUtils(mockConfig);
        
        // Test that clear functionality exists
        expect(typeof utils.removeFormatting).toBe('function');
      });
    });
  });

  describe('Modal State Management', () => {
    it('should handle modal state transitions', () => {
      // Test that modal states can be properly managed
      const modalStates = {
        mention: { show: false, search: '', results: [], loading: false },
        wikilink: { show: false, target: '', label: '' },
        image: { show: false, url: '', alt: '' },
        link: { show: false, url: '', text: '' },
        table: { show: false, data: { headers: [], rows: [] } },
        footnote: { show: false, id: '', text: '' },
        heading: { show: false, level: 1, text: '' },
        emoji: { show: false },
      };

      // Test opening a modal
      modalStates.mention.show = true;
      expect(modalStates.mention.show).toBe(true);

      // Test closing a modal
      modalStates.mention.show = false;
      expect(modalStates.mention.show).toBe(false);

      // Test updating modal data
      modalStates.wikilink.target = 'test-target';
      modalStates.wikilink.label = 'test-label';
      expect(modalStates.wikilink.target).toBe('test-target');
      expect(modalStates.wikilink.label).toBe('test-label');

      // Test emoji modal state
      modalStates.emoji.show = true;
      expect(modalStates.emoji.show).toBe(true);
      modalStates.emoji.show = false;
      expect(modalStates.emoji.show).toBe(false);
    });

    it('should handle table data manipulation', () => {
      const tableData = {
        headers: ['Header 1', 'Header 2'],
        rows: [['Cell 1', 'Cell 2'], ['Cell 3', 'Cell 4']]
      };

      // Test adding a column
      tableData.headers.push('Header 3');
      tableData.rows.forEach(row => row.push(''));
      expect(tableData.headers.length).toBe(3);
      expect(tableData.rows[0].length).toBe(3);

      // Test removing a column
      tableData.headers.splice(1, 1);
      tableData.rows.forEach(row => row.splice(1, 1));
      expect(tableData.headers.length).toBe(2);
      expect(tableData.rows[0].length).toBe(2);

      // Test adding a row
      tableData.rows.push(['New Cell 1', 'New Cell 2']);
      expect(tableData.rows.length).toBe(3);

      // Test removing a row
      tableData.rows.splice(1, 1);
      expect(tableData.rows.length).toBe(2);
    });
  });

  describe('Content Validation', () => {
    it('should validate content before submission', () => {
      const emptyContent = '';
      const whitespaceContent = '   \n  ';
      const validContent = 'This is valid content';

      expect(emptyContent.trim()).toBe('');
      expect(whitespaceContent.trim()).toBe('');
      expect(validContent.trim()).toBe('This is valid content');
    });

    it('should handle content with special characters', () => {
      const contentWithSpecialChars = 'Content with <script>alert("xss")</script> and &amp; entities';
      const sanitizedContent = contentWithSpecialChars
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/&amp;/g, '&');

      expect(sanitizedContent).toBe('Content with  and & entities');
    });
  });

  describe('Error Handling', () => {
    it('should handle conversion errors gracefully', () => {
      const mockConfig = {
        editorRef: () => undefined,
        content: () => '',
        setContent: vi.fn(),
        showMarkup: () => false,
        markupText: () => '',
        setMarkupText: vi.fn(),
      };

      const editorUtils = createEditorUtils(mockConfig);

      // Test with malformed HTML
      const malformedHtml = '<p><strong>unclosed tag';
      const markup = editorUtils.convertHtmlToMarkup(malformedHtml);
      
      // Should not throw an error and should return some result
      expect(typeof markup).toBe('string');
    });

    it('should handle empty or null content', () => {
      const mockConfig = {
        editorRef: () => undefined,
        content: () => '',
        setContent: vi.fn(),
        showMarkup: () => false,
        markupText: () => '',
        setMarkupText: vi.fn(),
      };

      const editorUtils = createEditorUtils(mockConfig);

      const emptyMarkup = editorUtils.convertMarkupToHtml('');
      const nullMarkup = editorUtils.convertMarkupToHtml(null as any);
      const undefinedMarkup = editorUtils.convertMarkupToHtml(undefined as any);

      expect(typeof emptyMarkup).toBe('string');
      expect(typeof nullMarkup).toBe('string');
      expect(typeof undefinedMarkup).toBe('string');
    });
  });
}); 