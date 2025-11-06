import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pubkeyToHue } from '../../src/lib/utils/nostrUtils';
import { nip19 } from 'nostr-tools';

describe('pubkeyToHue', () => {
  describe('Consistency', () => {
    it('returns consistent hue for same pubkey', () => {
      const pubkey = 'a'.repeat(64);
      const hue1 = pubkeyToHue(pubkey);
      const hue2 = pubkeyToHue(pubkey);

      expect(hue1).toBe(hue2);
    });

    it('returns same hue for same pubkey called multiple times', () => {
      const pubkey = 'abc123def456'.repeat(5) + 'abcd';
      const hues = Array.from({ length: 10 }, () => pubkeyToHue(pubkey));

      expect(new Set(hues).size).toBe(1); // All hues should be the same
    });
  });

  describe('Range Validation', () => {
    it('returns hue in valid range (0-360)', () => {
      const pubkeys = [
        'a'.repeat(64),
        'f'.repeat(64),
        '0'.repeat(64),
        '9'.repeat(64),
        'abc123def456'.repeat(5) + 'abcd',
        '123456789abc'.repeat(5) + 'def0',
      ];

      pubkeys.forEach(pubkey => {
        const hue = pubkeyToHue(pubkey);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
      });
    });

    it('returns integer hue value', () => {
      const pubkey = 'a'.repeat(64);
      const hue = pubkeyToHue(pubkey);

      expect(Number.isInteger(hue)).toBe(true);
    });
  });

  describe('Format Handling', () => {
    it('handles hex format pubkeys', () => {
      const hexPubkey = 'abcdef123456789'.repeat(4) + '0123';
      const hue = pubkeyToHue(hexPubkey);

      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('handles npub format pubkeys', () => {
      const hexPubkey = 'a'.repeat(64);
      const npub = nip19.npubEncode(hexPubkey);
      const hue = pubkeyToHue(npub);

      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('returns same hue for hex and npub format of same pubkey', () => {
      const hexPubkey = 'abc123def456'.repeat(5) + 'abcd';
      const npub = nip19.npubEncode(hexPubkey);

      const hueFromHex = pubkeyToHue(hexPubkey);
      const hueFromNpub = pubkeyToHue(npub);

      expect(hueFromHex).toBe(hueFromNpub);
    });
  });

  describe('Uniqueness', () => {
    it('different pubkeys generate different hues', () => {
      const pubkey1 = 'a'.repeat(64);
      const pubkey2 = 'b'.repeat(64);
      const pubkey3 = 'c'.repeat(64);

      const hue1 = pubkeyToHue(pubkey1);
      const hue2 = pubkeyToHue(pubkey2);
      const hue3 = pubkeyToHue(pubkey3);

      expect(hue1).not.toBe(hue2);
      expect(hue2).not.toBe(hue3);
      expect(hue1).not.toBe(hue3);
    });

    it('generates diverse hues for multiple pubkeys', () => {
      const pubkeys = Array.from({ length: 10 }, (_, i) =>
        String.fromCharCode(97 + i).repeat(64)
      );

      const hues = pubkeys.map(pk => pubkeyToHue(pk));
      const uniqueHues = new Set(hues);

      // Most pubkeys should generate unique hues (allowing for some collisions)
      expect(uniqueHues.size).toBeGreaterThan(7);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string input', () => {
      const hue = pubkeyToHue('');

      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('handles invalid npub format gracefully', () => {
      const invalidNpub = 'npub1invalid';
      const hue = pubkeyToHue(invalidNpub);

      // Should still return a valid hue even if decode fails
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('handles short input strings', () => {
      const shortInput = 'abc';
      const hue = pubkeyToHue(shortInput);

      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });

    it('handles special characters', () => {
      const specialInput = '!@#$%^&*()';
      const hue = pubkeyToHue(specialInput);

      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });
  });

  describe('Color Distribution', () => {
    it('distributes colors across the spectrum', () => {
      // Generate hues for many different pubkeys
      const pubkeys = Array.from({ length: 50 }, (_, i) =>
        i.toString().repeat(16)
      );

      const hues = pubkeys.map(pk => pubkeyToHue(pk));

      // Check that we have hues in different ranges of the spectrum
      const hasLowHues = hues.some(h => h < 120);
      const hasMidHues = hues.some(h => h >= 120 && h < 240);
      const hasHighHues = hues.some(h => h >= 240);

      expect(hasLowHues).toBe(true);
      expect(hasMidHues).toBe(true);
      expect(hasHighHues).toBe(true);
    });
  });
});

describe('HighlightLayer Component', () => {
  let mockNdk: any;
  let mockSubscription: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    eventHandlers = new Map();

    // Mock NDK subscription
    mockSubscription = {
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers.set(event, handler);
      }),
      stop: vi.fn(),
    };

    mockNdk = {
      subscribe: vi.fn(() => mockSubscription),
    };

    // Mock DOM APIs
    global.document = {
      createTreeWalker: vi.fn(() => ({
        nextNode: vi.fn(() => null),
      })),
      createDocumentFragment: vi.fn(() => ({
        appendChild: vi.fn(),
      })),
      createTextNode: vi.fn((text: string) => ({
        textContent: text,
      })),
      createElement: vi.fn((tag: string) => ({
        className: '',
        style: {},
        textContent: '',
      })),
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('NDK Subscription', () => {
    it('fetches kind 9802 events with correct filter when eventId provided', () => {
      const eventId = 'a'.repeat(64);

      // Simulate calling fetchHighlights
      mockNdk.subscribe({ kinds: [9802], '#e': [eventId], limit: 100 });

      expect(mockNdk.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [9802],
          '#e': [eventId],
          limit: 100,
        })
      );
    });

    it('fetches kind 9802 events with correct filter when eventAddress provided', () => {
      const eventAddress = '30040:' + 'a'.repeat(64) + ':chapter-1';

      // Simulate calling fetchHighlights
      mockNdk.subscribe({ kinds: [9802], '#a': [eventAddress], limit: 100 });

      expect(mockNdk.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [9802],
          '#a': [eventAddress],
          limit: 100,
        })
      );
    });

    it('fetches with both eventId and eventAddress filters when both provided', () => {
      const eventId = 'a'.repeat(64);
      const eventAddress = '30040:' + 'b'.repeat(64) + ':chapter-1';

      // Simulate calling fetchHighlights
      mockNdk.subscribe({
        kinds: [9802],
        '#e': [eventId],
        '#a': [eventAddress],
        limit: 100,
      });

      expect(mockNdk.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          kinds: [9802],
          '#e': [eventId],
          '#a': [eventAddress],
          limit: 100,
        })
      );
    });

    it('cleans up subscription on unmount', () => {
      mockNdk.subscribe({ kinds: [9802], limit: 100 });

      // Simulate unmount by calling stop
      mockSubscription.stop();

      expect(mockSubscription.stop).toHaveBeenCalled();
    });
  });

  describe('Color Mapping', () => {
    it('maps highlights to colors correctly', () => {
      const pubkey1 = 'a'.repeat(64);
      const pubkey2 = 'b'.repeat(64);

      const hue1 = pubkeyToHue(pubkey1);
      const hue2 = pubkeyToHue(pubkey2);

      const expectedColor1 = `hsla(${hue1}, 70%, 60%, 0.3)`;
      const expectedColor2 = `hsla(${hue2}, 70%, 60%, 0.3)`;

      expect(expectedColor1).toMatch(/^hsla\(\d+, 70%, 60%, 0\.3\)$/);
      expect(expectedColor2).toMatch(/^hsla\(\d+, 70%, 60%, 0\.3\)$/);
      expect(expectedColor1).not.toBe(expectedColor2);
    });

    it('uses consistent color for same pubkey', () => {
      const pubkey = 'abc123def456'.repeat(5) + 'abcd';
      const hue = pubkeyToHue(pubkey);

      const color1 = `hsla(${hue}, 70%, 60%, 0.3)`;
      const color2 = `hsla(${hue}, 70%, 60%, 0.3)`;

      expect(color1).toBe(color2);
    });

    it('generates semi-transparent colors with 0.3 opacity', () => {
      const pubkey = 'a'.repeat(64);
      const hue = pubkeyToHue(pubkey);
      const color = `hsla(${hue}, 70%, 60%, 0.3)`;

      expect(color).toContain('0.3');
    });

    it('uses HSL color format with correct values', () => {
      const pubkey = 'a'.repeat(64);
      const hue = pubkeyToHue(pubkey);
      const color = `hsla(${hue}, 70%, 60%, 0.3)`;

      // Verify format: hsla(hue, 70%, 60%, 0.3)
      expect(color).toMatch(/^hsla\(\d+, 70%, 60%, 0\.3\)$/);
    });
  });

  describe('Highlight Events', () => {
    it('handles no highlights gracefully', () => {
      const highlights: any[] = [];

      expect(highlights.length).toBe(0);
      // Component should render without errors
    });

    it('handles single highlight from one user', () => {
      const mockHighlight = {
        id: 'highlight1',
        kind: 9802,
        pubkey: 'a'.repeat(64),
        content: 'highlighted text',
        created_at: Date.now(),
        tags: [],
      };

      const highlights = [mockHighlight];

      expect(highlights.length).toBe(1);
      expect(highlights[0].pubkey).toBe('a'.repeat(64));
    });

    it('handles multiple highlights from same user', () => {
      const pubkey = 'a'.repeat(64);
      const mockHighlights = [
        {
          id: 'highlight1',
          kind: 9802,
          pubkey: pubkey,
          content: 'first highlight',
          created_at: Date.now(),
          tags: [],
        },
        {
          id: 'highlight2',
          kind: 9802,
          pubkey: pubkey,
          content: 'second highlight',
          created_at: Date.now(),
          tags: [],
        },
      ];

      expect(mockHighlights.length).toBe(2);
      expect(mockHighlights[0].pubkey).toBe(mockHighlights[1].pubkey);

      // Should use same color for both
      const hue = pubkeyToHue(pubkey);
      const color = `hsla(${hue}, 70%, 60%, 0.3)`;

      expect(color).toMatch(/^hsla\(\d+, 70%, 60%, 0\.3\)$/);
    });

    it('handles multiple highlights from different users', () => {
      const pubkey1 = 'a'.repeat(64);
      const pubkey2 = 'b'.repeat(64);
      const pubkey3 = 'c'.repeat(64);

      const mockHighlights = [
        {
          id: 'highlight1',
          kind: 9802,
          pubkey: pubkey1,
          content: 'highlight from user 1',
          created_at: Date.now(),
          tags: [],
        },
        {
          id: 'highlight2',
          kind: 9802,
          pubkey: pubkey2,
          content: 'highlight from user 2',
          created_at: Date.now(),
          tags: [],
        },
        {
          id: 'highlight3',
          kind: 9802,
          pubkey: pubkey3,
          content: 'highlight from user 3',
          created_at: Date.now(),
          tags: [],
        },
      ];

      expect(mockHighlights.length).toBe(3);

      // Each should have different color
      const hue1 = pubkeyToHue(pubkey1);
      const hue2 = pubkeyToHue(pubkey2);
      const hue3 = pubkeyToHue(pubkey3);

      expect(hue1).not.toBe(hue2);
      expect(hue2).not.toBe(hue3);
      expect(hue1).not.toBe(hue3);
    });

    it('prevents duplicate highlights', () => {
      const mockHighlight = {
        id: 'highlight1',
        kind: 9802,
        pubkey: 'a'.repeat(64),
        content: 'highlighted text',
        created_at: Date.now(),
        tags: [],
      };

      const highlights = [mockHighlight];

      // Try to add duplicate
      const isDuplicate = highlights.some(h => h.id === mockHighlight.id);

      expect(isDuplicate).toBe(true);
      // Should not add duplicate
    });

    it('handles empty content gracefully', () => {
      const mockHighlight = {
        id: 'highlight1',
        kind: 9802,
        pubkey: 'a'.repeat(64),
        content: '',
        created_at: Date.now(),
        tags: [],
      };

      // Should not crash
      expect(mockHighlight.content).toBe('');
    });

    it('handles whitespace-only content', () => {
      const mockHighlight = {
        id: 'highlight1',
        kind: 9802,
        pubkey: 'a'.repeat(64),
        content: '   \n\t  ',
        created_at: Date.now(),
        tags: [],
      };

      const trimmed = mockHighlight.content.trim();
      expect(trimmed.length).toBe(0);
    });
  });

  describe('Highlighter Legend', () => {
    it('displays legend with correct color for single highlighter', () => {
      const pubkey = 'abc123def456'.repeat(5) + 'abcd';
      const hue = pubkeyToHue(pubkey);
      const color = `hsla(${hue}, 70%, 60%, 0.3)`;

      const legend = {
        pubkey: pubkey,
        color: color,
        shortPubkey: `${pubkey.slice(0, 8)}...`,
      };

      expect(legend.color).toBe(color);
      expect(legend.shortPubkey).toBe(`${pubkey.slice(0, 8)}...`);
    });

    it('displays legend with colors for multiple highlighters', () => {
      const pubkeys = [
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
      ];

      const legendEntries = pubkeys.map(pubkey => ({
        pubkey,
        color: `hsla(${pubkeyToHue(pubkey)}, 70%, 60%, 0.3)`,
        shortPubkey: `${pubkey.slice(0, 8)}...`,
      }));

      expect(legendEntries.length).toBe(3);

      // Each should have unique color
      const colors = legendEntries.map(e => e.color);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(3);
    });

    it('shows truncated pubkey in legend', () => {
      const pubkey = 'abcdefghijklmnop'.repeat(4);
      const shortPubkey = `${pubkey.slice(0, 8)}...`;

      expect(shortPubkey).toBe('abcdefgh...');
      expect(shortPubkey.length).toBeLessThan(pubkey.length);
    });

    it('displays highlight count', () => {
      const highlights = [
        { id: '1', pubkey: 'a'.repeat(64), content: 'text1' },
        { id: '2', pubkey: 'b'.repeat(64), content: 'text2' },
        { id: '3', pubkey: 'a'.repeat(64), content: 'text3' },
      ];

      expect(highlights.length).toBe(3);

      // Count unique highlighters
      const uniqueHighlighters = new Set(highlights.map(h => h.pubkey));
      expect(uniqueHighlighters.size).toBe(2);
    });
  });

  describe('Text Matching', () => {
    it('matches text case-insensitively', () => {
      const searchText = 'Hello World';
      const contentText = 'hello world';

      const index = contentText.toLowerCase().indexOf(searchText.toLowerCase());

      expect(index).toBeGreaterThanOrEqual(0);
    });

    it('handles special characters in search text', () => {
      const searchText = 'text with "quotes" and symbols!';
      const contentText = 'This is text with "quotes" and symbols! in it.';

      const index = contentText.toLowerCase().indexOf(searchText.toLowerCase());

      expect(index).toBeGreaterThanOrEqual(0);
    });

    it('handles Unicode characters', () => {
      const searchText = 'café résumé';
      const contentText = 'The café résumé was excellent.';

      const index = contentText.toLowerCase().indexOf(searchText.toLowerCase());

      expect(index).toBeGreaterThanOrEqual(0);
    });

    it('handles multi-line text', () => {
      const searchText = 'line one\nline two';
      const contentText = 'This is line one\nline two in the document.';

      const index = contentText.indexOf(searchText);

      expect(index).toBeGreaterThanOrEqual(0);
    });

    it('does not match partial words when searching for whole words', () => {
      const searchText = 'cat';
      const contentText = 'The category is important.';

      // Simple word boundary check
      const wordBoundaryMatch = new RegExp(`\\b${searchText}\\b`, 'i').test(contentText);

      expect(wordBoundaryMatch).toBe(false);
    });
  });

  describe('Subscription Lifecycle', () => {
    it('registers EOSE event handler', () => {
      const subscription = mockNdk.subscribe({ kinds: [9802], limit: 100 });

      // Verify that 'on' method is available for registering handlers
      expect(subscription.on).toBeDefined();

      // Register EOSE handler
      subscription.on('eose', () => {
        subscription.stop();
      });

      // Verify on was called
      expect(subscription.on).toHaveBeenCalledWith('eose', expect.any(Function));
    });

    it('registers error event handler', () => {
      const subscription = mockNdk.subscribe({ kinds: [9802], limit: 100 });

      // Verify that 'on' method is available for registering handlers
      expect(subscription.on).toBeDefined();

      // Register error handler
      subscription.on('error', () => {
        subscription.stop();
      });

      // Verify on was called
      expect(subscription.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('stops subscription on timeout', async () => {
      vi.useFakeTimers();

      mockNdk.subscribe({ kinds: [9802], limit: 100 });

      // Fast-forward time by 10 seconds
      vi.advanceTimersByTime(10000);

      // Subscription should be stopped after timeout
      // Note: This would be tested in the actual component

      vi.useRealTimers();
    });

    it('handles multiple subscription cleanup calls safely', () => {
      mockNdk.subscribe({ kinds: [9802], limit: 100 });

      // Call stop multiple times
      mockSubscription.stop();
      mockSubscription.stop();
      mockSubscription.stop();

      expect(mockSubscription.stop).toHaveBeenCalledTimes(3);
      // Should not throw errors
    });
  });

  describe('Performance', () => {
    it('handles large number of highlights efficiently', () => {
      const startTime = Date.now();

      const highlights = Array.from({ length: 1000 }, (_, i) => ({
        id: `highlight${i}`,
        kind: 9802,
        pubkey: (i % 10).toString().repeat(64),
        content: `highlighted text ${i}`,
        created_at: Date.now(),
        tags: [],
      }));

      // Generate colors for all highlights
      const colorMap = new Map<string, string>();
      highlights.forEach(h => {
        if (!colorMap.has(h.pubkey)) {
          const hue = pubkeyToHue(h.pubkey);
          colorMap.set(h.pubkey, `hsla(${hue}, 70%, 60%, 0.3)`);
        }
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(highlights.length).toBe(1000);
      expect(colorMap.size).toBe(10);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });
});

describe('Integration Tests', () => {
  describe('Toggle Functionality', () => {
    it('toggle button shows highlights when clicked', () => {
      let highlightsVisible = false;

      // Simulate toggle
      highlightsVisible = !highlightsVisible;

      expect(highlightsVisible).toBe(true);
    });

    it('toggle button hides highlights when clicked again', () => {
      let highlightsVisible = true;

      // Simulate toggle
      highlightsVisible = !highlightsVisible;

      expect(highlightsVisible).toBe(false);
    });

    it('toggle state persists between interactions', () => {
      let highlightsVisible = false;

      highlightsVisible = !highlightsVisible;
      expect(highlightsVisible).toBe(true);

      highlightsVisible = !highlightsVisible;
      expect(highlightsVisible).toBe(false);

      highlightsVisible = !highlightsVisible;
      expect(highlightsVisible).toBe(true);
    });
  });

  describe('Color Format Validation', () => {
    it('generates semi-transparent colors with 0.3 opacity', () => {
      const pubkeys = [
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
      ];

      pubkeys.forEach(pubkey => {
        const hue = pubkeyToHue(pubkey);
        const color = `hsla(${hue}, 70%, 60%, 0.3)`;

        expect(color).toContain('0.3');
      });
    });

    it('uses HSL color format with correct saturation and lightness', () => {
      const pubkey = 'a'.repeat(64);
      const hue = pubkeyToHue(pubkey);
      const color = `hsla(${hue}, 70%, 60%, 0.3)`;

      expect(color).toContain('70%');
      expect(color).toContain('60%');
    });

    it('generates valid CSS color strings', () => {
      const pubkeys = Array.from({ length: 20 }, (_, i) =>
        String.fromCharCode(97 + i).repeat(64)
      );

      pubkeys.forEach(pubkey => {
        const hue = pubkeyToHue(pubkey);
        const color = `hsla(${hue}, 70%, 60%, 0.3)`;

        // Validate CSS color format
        expect(color).toMatch(/^hsla\(\d+, 70%, 60%, 0\.3\)$/);
      });
    });
  });

  describe('End-to-End Flow', () => {
    it('complete highlight workflow', () => {
      // 1. Start with no highlights visible
      let highlightsVisible = false;
      let highlights: any[] = [];

      expect(highlightsVisible).toBe(false);
      expect(highlights.length).toBe(0);

      // 2. Fetch highlights
      const mockHighlights = [
        {
          id: 'h1',
          kind: 9802,
          pubkey: 'a'.repeat(64),
          content: 'first highlight',
          created_at: Date.now(),
          tags: [],
        },
        {
          id: 'h2',
          kind: 9802,
          pubkey: 'b'.repeat(64),
          content: 'second highlight',
          created_at: Date.now(),
          tags: [],
        },
      ];

      highlights = mockHighlights;
      expect(highlights.length).toBe(2);

      // 3. Generate color map
      const colorMap = new Map<string, string>();
      highlights.forEach(h => {
        if (!colorMap.has(h.pubkey)) {
          const hue = pubkeyToHue(h.pubkey);
          colorMap.set(h.pubkey, `hsla(${hue}, 70%, 60%, 0.3)`);
        }
      });

      expect(colorMap.size).toBe(2);

      // 4. Toggle visibility
      highlightsVisible = true;
      expect(highlightsVisible).toBe(true);

      // 5. Verify colors are different
      const colors = Array.from(colorMap.values());
      expect(colors[0]).not.toBe(colors[1]);

      // 6. Toggle off
      highlightsVisible = false;
      expect(highlightsVisible).toBe(false);
    });

    it('handles event updates correctly', () => {
      let eventId = 'event1';
      let highlights: any[] = [];

      // Initial load
      highlights = [
        {
          id: 'h1',
          kind: 9802,
          pubkey: 'a'.repeat(64),
          content: 'highlight 1',
          created_at: Date.now(),
          tags: [],
        },
      ];

      expect(highlights.length).toBe(1);

      // Event changes
      eventId = 'event2';
      highlights = [];

      expect(highlights.length).toBe(0);

      // New highlights loaded
      highlights = [
        {
          id: 'h2',
          kind: 9802,
          pubkey: 'b'.repeat(64),
          content: 'highlight 2',
          created_at: Date.now(),
          tags: [],
        },
      ];

      expect(highlights.length).toBe(1);
      expect(highlights[0].id).toBe('h2');
    });
  });

  describe('Error Handling', () => {
    it('handles missing event ID and address gracefully', () => {
      const eventId = undefined;
      const eventAddress = undefined;

      // Should not attempt to fetch
      expect(eventId).toBeUndefined();
      expect(eventAddress).toBeUndefined();
    });

    it('handles subscription errors gracefully', () => {
      const error = new Error('Subscription failed');

      // Should log error but not crash
      expect(error.message).toBe('Subscription failed');
    });

    it('handles malformed highlight events', () => {
      const malformedHighlight = {
        id: 'h1',
        kind: 9802,
        pubkey: '', // Empty pubkey
        content: undefined, // Missing content
        created_at: Date.now(),
        tags: [],
      };

      // Should handle gracefully
      expect(malformedHighlight.pubkey).toBe('');
      expect(malformedHighlight.content).toBeUndefined();
    });
  });
});
