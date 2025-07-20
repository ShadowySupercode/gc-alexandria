import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { 
  fetchTaggedEventsFromRelays,
  findTaggedEventsInFetched,
  fetchProfilesForNewEvents,
  type TagExpansionResult
} from '../../src/lib/utils/tag_event_fetch';

// Mock NDKEvent for testing
class MockNDKEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];

  constructor(id: string, kind: number, pubkey: string, created_at: number, content: string = '', tags: string[][] = []) {
    this.id = id;
    this.kind = kind;
    this.pubkey = pubkey;
    this.created_at = created_at;
    this.content = content;
    this.tags = tags;
  }

  tagValue(tagName: string): string | undefined {
    const tag = this.tags.find(t => t[0] === tagName);
    return tag ? tag[1] : undefined;
  }

  getMatchingTags(tagName: string): string[][] {
    return this.tags.filter(tag => tag[0] === tagName);
  }
}

// Mock NDK instance
const mockNDK = {
  fetchEvents: vi.fn()
};

// Mock the ndkInstance store
vi.mock('../../src/lib/ndk', () => ({
  ndkInstance: {
    subscribe: vi.fn((fn) => {
      fn(mockNDK);
      return { unsubscribe: vi.fn() };
    })
  }
}));

// Mock the profile cache utilities
vi.mock('../../src/lib/utils/profileCache', () => ({
  extractPubkeysFromEvents: vi.fn((events: NDKEvent[]) => {
    const pubkeys = new Set<string>();
    events.forEach(event => {
      if (event.pubkey) pubkeys.add(event.pubkey);
    });
    return pubkeys;
  }),
  batchFetchProfiles: vi.fn(async (pubkeys: string[], onProgress: (fetched: number, total: number) => void) => {
    // Simulate progress updates
    onProgress(0, pubkeys.length);
    onProgress(pubkeys.length, pubkeys.length);
    return [];
  })
}));

describe('Tag Expansion Tests', () => {
  let mockPublications: MockNDKEvent[];
  let mockContentEvents: MockNDKEvent[];
  let mockAllEvents: MockNDKEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create test publication index events (kind 30040)
    mockPublications = [
      new MockNDKEvent('pub1', 30040, 'author1', 1000, 'Book 1', [
        ['t', 'bitcoin'],
        ['t', 'cryptocurrency'],
        ['a', '30041:author1:chapter-1'],
        ['a', '30041:author1:chapter-2']
      ]),
      new MockNDKEvent('pub2', 30040, 'author2', 1100, 'Book 2', [
        ['t', 'bitcoin'],
        ['t', 'blockchain'],
        ['a', '30041:author2:chapter-1']
      ]),
      new MockNDKEvent('pub3', 30040, 'author3', 1200, 'Book 3', [
        ['t', 'ethereum'],
        ['a', '30041:author3:chapter-1']
      ])
    ];

    // Create test content events (kind 30041)
    mockContentEvents = [
      new MockNDKEvent('content1', 30041, 'author1', 1000, 'Chapter 1 content', [['d', 'chapter-1']]),
      new MockNDKEvent('content2', 30041, 'author1', 1100, 'Chapter 2 content', [['d', 'chapter-2']]),
      new MockNDKEvent('content3', 30041, 'author2', 1200, 'Author 2 Chapter 1', [['d', 'chapter-1']]),
      new MockNDKEvent('content4', 30041, 'author3', 1300, 'Author 3 Chapter 1', [['d', 'chapter-1']])
    ];

    // Combine all events for testing
    mockAllEvents = [...mockPublications, ...mockContentEvents];
  });

  describe('fetchTaggedEventsFromRelays', () => {
    it('should fetch publications with matching tags from relays', async () => {
      // Mock the NDK fetch to return publications with 'bitcoin' tag
      const bitcoinPublications = mockPublications.filter(pub => 
        pub.tags.some(tag => tag[0] === 't' && tag[1] === 'bitcoin')
      );
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set(bitcoinPublications as NDKEvent[]));
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set(mockContentEvents as NDKEvent[]));

      const existingEventIds = new Set<string>(['existing-event']);
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = await fetchTaggedEventsFromRelays(
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should fetch publications with bitcoin tag
      expect(mockNDK.fetchEvents).toHaveBeenCalledWith({
        kinds: [30040],
        "#t": ['bitcoin'],
        limit: 30
      });

      // Should return the matching publications
      expect(result.publications).toHaveLength(2);
      expect(result.publications.map(p => p.id)).toContain('pub1');
      expect(result.publications.map(p => p.id)).toContain('pub2');

      // Should fetch content events for the publications
      expect(mockNDK.fetchEvents).toHaveBeenCalledWith({
        kinds: [30041, 30818],
        "#d": ['chapter-1', 'chapter-2']
      });
    });

    it('should filter out existing events to avoid duplicates', async () => {
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set(mockPublications as NDKEvent[]));
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set(mockContentEvents as NDKEvent[]));

      const existingEventIds = new Set<string>(['pub1']); // pub1 already exists
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = await fetchTaggedEventsFromRelays(
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should exclude pub1 since it already exists
      expect(result.publications).toHaveLength(2);
      expect(result.publications.map(p => p.id)).not.toContain('pub1');
      expect(result.publications.map(p => p.id)).toContain('pub2');
      expect(result.publications.map(p => p.id)).toContain('pub3');
    });

    it('should handle empty tag array gracefully', async () => {
      // Mock empty result for empty tags
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set());
      
      const existingEventIds = new Set<string>();
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = await fetchTaggedEventsFromRelays(
        [],
        existingEventIds,
        baseEvents,
        debug
      );

      expect(result.publications).toHaveLength(0);
      expect(result.contentEvents).toHaveLength(0);
    });
  });

  describe('findTaggedEventsInFetched', () => {
    it('should find publications with matching tags in already fetched events', () => {
      const existingEventIds = new Set<string>(['existing-event']);
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = findTaggedEventsInFetched(
        mockAllEvents as NDKEvent[],
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should find publications with bitcoin tag
      expect(result.publications).toHaveLength(2);
      expect(result.publications.map(p => p.id)).toContain('pub1');
      expect(result.publications.map(p => p.id)).toContain('pub2');

      // Should find content events for those publications
      expect(result.contentEvents).toHaveLength(4);
      expect(result.contentEvents.map(c => c.id)).toContain('content1');
      expect(result.contentEvents.map(c => c.id)).toContain('content2');
      expect(result.contentEvents.map(c => c.id)).toContain('content3');
      expect(result.contentEvents.map(c => c.id)).toContain('content4');
    });

    it('should exclude base events from search results', () => {
      const existingEventIds = new Set<string>(['pub1']); // pub1 is a base event
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = findTaggedEventsInFetched(
        mockAllEvents as NDKEvent[],
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should exclude pub1 since it's a base event
      expect(result.publications).toHaveLength(1);
      expect(result.publications.map(p => p.id)).not.toContain('pub1');
      expect(result.publications.map(p => p.id)).toContain('pub2');
    });

    it('should handle multiple tags (OR logic)', () => {
      const existingEventIds = new Set<string>();
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = findTaggedEventsInFetched(
        mockAllEvents as NDKEvent[],
        ['bitcoin', 'ethereum'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should find publications with either bitcoin OR ethereum tags
      expect(result.publications).toHaveLength(3);
      expect(result.publications.map(p => p.id)).toContain('pub1'); // bitcoin
      expect(result.publications.map(p => p.id)).toContain('pub2'); // bitcoin
      expect(result.publications.map(p => p.id)).toContain('pub3'); // ethereum
    });

    it('should handle events without tags gracefully', () => {
      const eventWithoutTags = new MockNDKEvent('no-tags', 30040, 'author4', 1000, 'No tags');
      const allEventsWithNoTags = [...mockAllEvents, eventWithoutTags];
      
      const existingEventIds = new Set<string>();
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = findTaggedEventsInFetched(
        allEventsWithNoTags as NDKEvent[],
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should not include events without tags
      expect(result.publications.map(p => p.id)).not.toContain('no-tags');
    });
  });

  describe('fetchProfilesForNewEvents', () => {
    it('should extract pubkeys and fetch profiles for new events', async () => {
      const onProgressUpdate = vi.fn();
      const debug = vi.fn();

      await fetchProfilesForNewEvents(
        mockPublications as NDKEvent[],
        mockContentEvents as NDKEvent[],
        onProgressUpdate,
        debug
      );

      // Should call progress update with initial state
      expect(onProgressUpdate).toHaveBeenCalledWith({ current: 0, total: 3 });

      // Should call progress update with final state
      expect(onProgressUpdate).toHaveBeenCalledWith({ current: 3, total: 3 });

      // Should clear progress at the end
      expect(onProgressUpdate).toHaveBeenCalledWith(null);
    });

    it('should handle empty event arrays gracefully', async () => {
      const onProgressUpdate = vi.fn();
      const debug = vi.fn();

      await fetchProfilesForNewEvents(
        [],
        [],
        onProgressUpdate,
        debug
      );

      // Should not call progress update for empty arrays
      expect(onProgressUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Tag Expansion Integration', () => {
    it('should demonstrate the complete tag expansion flow', async () => {
      // This test simulates the complete flow from the visualize page
      
      // Step 1: Mock relay fetch for 'bitcoin' tag
      const bitcoinPublications = mockPublications.filter(pub => 
        pub.tags.some(tag => tag[0] === 't' && tag[1] === 'bitcoin')
      );
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set(bitcoinPublications as NDKEvent[]));
      mockNDK.fetchEvents.mockResolvedValueOnce(new Set(mockContentEvents as NDKEvent[]));

      const existingEventIds = new Set<string>(['base-event']);
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      // Step 2: Fetch from relays
      const relayResult = await fetchTaggedEventsFromRelays(
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      expect(relayResult.publications).toHaveLength(2);
      expect(relayResult.contentEvents).toHaveLength(4);

      // Step 3: Search in fetched events
      const searchResult = findTaggedEventsInFetched(
        mockAllEvents as NDKEvent[],
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      expect(searchResult.publications).toHaveLength(2);
      expect(searchResult.contentEvents).toHaveLength(4);

      // Step 4: Fetch profiles
      const onProgressUpdate = vi.fn();
      await fetchProfilesForNewEvents(
        relayResult.publications,
        relayResult.contentEvents,
        onProgressUpdate,
        debug
      );

      expect(onProgressUpdate).toHaveBeenCalledWith(null);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed a-tags gracefully', () => {
      const malformedPublication = new MockNDKEvent('malformed', 30040, 'author1', 1000, 'Malformed', [
        ['t', 'bitcoin'],
        ['a', 'invalid-tag-format'], // Missing parts
        ['a', '30041:author1:chapter-1'] // Valid format
      ]);

      const allEventsWithMalformed = [...mockAllEvents, malformedPublication];
      const existingEventIds = new Set<string>();
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = findTaggedEventsInFetched(
        allEventsWithMalformed as NDKEvent[],
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should still work and include the publication with valid a-tags
      expect(result.publications).toHaveLength(3);
      expect(result.contentEvents.length).toBeGreaterThan(0);
    });

    it('should handle events with d-tags containing colons', () => {
      const publicationWithColonDTag = new MockNDKEvent('colon-pub', 30040, 'author1', 1000, 'Colon d-tag', [
        ['t', 'bitcoin'],
        ['a', '30041:author1:chapter:with:colons']
      ]);

      const contentWithColonDTag = new MockNDKEvent('colon-content', 30041, 'author1', 1100, 'Content with colon d-tag', [
        ['d', 'chapter:with:colons']
      ]);

      const allEventsWithColons = [...mockAllEvents, publicationWithColonDTag, contentWithColonDTag];
      const existingEventIds = new Set<string>();
      const baseEvents: NDKEvent[] = [];
      const debug = vi.fn();

      const result = findTaggedEventsInFetched(
        allEventsWithColons as NDKEvent[],
        ['bitcoin'],
        existingEventIds,
        baseEvents,
        debug
      );

      // Should handle d-tags with colons correctly
      expect(result.publications).toHaveLength(3);
      expect(result.contentEvents.map(c => c.id)).toContain('colon-content');
    });
  });
}); 