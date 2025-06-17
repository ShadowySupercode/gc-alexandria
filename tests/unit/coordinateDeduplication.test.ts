import { describe, expect, it, vi } from 'vitest';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { 
  createCoordinateMap, 
  extractCoordinateFromATag,
  initializeGraphState 
} from '$lib/navigator/EventNetwork/utils/networkBuilder';

// Mock NDKEvent
class MockNDKEvent implements Partial<NDKEvent> {
  id: string;
  pubkey: string;
  created_at?: number;
  kind?: number;
  content?: string;
  tags: string[][];

  constructor(params: { id: string; pubkey: string; created_at?: number; kind?: number; content?: string; tags?: string[][] }) {
    this.id = params.id;
    this.pubkey = params.pubkey;
    this.created_at = params.created_at;
    this.kind = params.kind;
    this.content = params.content || '';
    this.tags = params.tags || [];
  }

  getMatchingTags(tagName: string): string[][] {
    return this.tags.filter(tag => tag[0] === tagName);
  }
}

// Generate a valid 64-character hex pubkey
function generatePubkey(seed: string): string {
  return seed.padEnd(64, '0');
}

// Generate a valid 64-character hex event ID
function generateEventId(seed: string): string {
  return seed.padEnd(64, '0');
}

describe('Coordinate-based Deduplication', () => {
  // Helper to create a mock event with valid IDs
  function createMockEvent(params: {
    id: string;
    pubkey: string;
    kind?: number;
    created_at?: number;
    tags?: string[][];
    content?: string;
  }) {
    return new MockNDKEvent({
      ...params,
      id: generateEventId(params.id),
      pubkey: generatePubkey(params.pubkey)
    }) as NDKEvent;
  }
  describe('createCoordinateMap', () => {
    it('should create empty map for non-replaceable events', () => {
      const events = [
        new MockNDKEvent({ id: '1', pubkey: generatePubkey('pubkey1'), kind: 1 }),
        new MockNDKEvent({ id: '2', pubkey: generatePubkey('pubkey2'), kind: 4 }),
        new MockNDKEvent({ id: '3', pubkey: generatePubkey('pubkey3'), kind: 7 })
      ] as NDKEvent[];

      const coordinateMap = createCoordinateMap(events);
      expect(coordinateMap.size).toBe(0);
    });

    it('should map replaceable events by coordinate', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'event1', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'publication1']]
        }),
        new MockNDKEvent({ 
          id: 'event2', 
          pubkey: generatePubkey('author2'), 
          kind: 30041, 
          created_at: 1001,
          tags: [['d', 'section1']]
        })
      ] as NDKEvent[];

      const coordinateMap = createCoordinateMap(events);
      expect(coordinateMap.size).toBe(2);
      expect(coordinateMap.get(`30040:${generatePubkey('author1')}:publication1`)?.id).toBe('event1');
      expect(coordinateMap.get(`30041:${generatePubkey('author2')}:section1`)?.id).toBe('event2');
    });

    it('should keep only the most recent version of duplicate coordinates', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'old_event', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'publication1']]
        }),
        new MockNDKEvent({ 
          id: 'new_event', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 2000,
          tags: [['d', 'publication1']]
        }),
        new MockNDKEvent({ 
          id: 'older_event', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 500,
          tags: [['d', 'publication1']]
        })
      ] as NDKEvent[];

      const coordinateMap = createCoordinateMap(events);
      expect(coordinateMap.size).toBe(1);
      expect(coordinateMap.get(`30040:${generatePubkey('author1')}:publication1`)?.id).toBe('new_event');
    });

    it('should handle missing d-tags gracefully', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'event1', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: []
        }),
        new MockNDKEvent({ 
          id: 'event2', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 2000,
          tags: [['d', 'publication1']]
        })
      ] as NDKEvent[];

      const coordinateMap = createCoordinateMap(events);
      expect(coordinateMap.size).toBe(1);
      expect(coordinateMap.get(`30040:${generatePubkey('author1')}:publication1`)?.id).toBe('event2');
    });

    it('should handle d-tags containing colons', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'event1', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'namespace:identifier:version']]
        })
      ] as NDKEvent[];

      const coordinateMap = createCoordinateMap(events);
      expect(coordinateMap.size).toBe(1);
      expect(coordinateMap.get(`30040:${generatePubkey('author1')}:namespace:identifier:version`)?.id).toBe('event1');
    });

    it('should handle events without timestamps', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'event_with_time', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'publication1']]
        }),
        new MockNDKEvent({ 
          id: 'event_no_time', 
          pubkey: generatePubkey('author1'), 
          kind: 30040,
          tags: [['d', 'publication1']]
        })
      ] as NDKEvent[];

      const coordinateMap = createCoordinateMap(events);
      expect(coordinateMap.size).toBe(1);
      // Should keep the one with timestamp
      expect(coordinateMap.get(`30040:${generatePubkey('author1')}:publication1`)?.id).toBe('event_with_time');
    });
  });

  describe('extractCoordinateFromATag', () => {
    it('should extract valid coordinates from a-tags', () => {
      const tag = ['a', `30040:${generatePubkey('pubkey123')}:dtag123`];
      const result = extractCoordinateFromATag(tag);
      
      expect(result).toEqual({
        kind: 30040,
        pubkey: generatePubkey('pubkey123'),
        dTag: 'dtag123'
      });
    });

    it('should handle d-tags with colons', () => {
      const tag = ['a', `30040:${generatePubkey('pubkey123')}:namespace:identifier:version`];
      const result = extractCoordinateFromATag(tag);
      
      expect(result).toEqual({
        kind: 30040,
        pubkey: generatePubkey('pubkey123'),
        dTag: 'namespace:identifier:version'
      });
    });

    it('should return null for invalid a-tags', () => {
      expect(extractCoordinateFromATag(['a'])).toBeNull();
      expect(extractCoordinateFromATag(['a', ''])).toBeNull();
      expect(extractCoordinateFromATag(['a', 'invalid'])).toBeNull();
      expect(extractCoordinateFromATag(['a', 'invalid:format'])).toBeNull();
      expect(extractCoordinateFromATag(['a', 'notanumber:pubkey:dtag'])).toBeNull();
    });
  });

  describe('initializeGraphState deduplication', () => {
    it('should create only one node per coordinate for replaceable events', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'old_version', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'publication1'], ['title', 'Old Title']]
        }),
        new MockNDKEvent({ 
          id: 'new_version', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 2000,
          tags: [['d', 'publication1'], ['title', 'New Title']]
        }),
        new MockNDKEvent({ 
          id: 'different_pub', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1500,
          tags: [['d', 'publication2'], ['title', 'Different Publication']]
        })
      ] as NDKEvent[];

      const graphState = initializeGraphState(events);
      
      // Should have only 2 nodes (one for each unique coordinate)
      expect(graphState.nodeMap.size).toBe(2);
      expect(graphState.nodeMap.has('new_version')).toBe(true);
      expect(graphState.nodeMap.has('different_pub')).toBe(true);
      expect(graphState.nodeMap.has('old_version')).toBe(false);
    });

    it('should handle mix of replaceable and non-replaceable events', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'regular1', 
          pubkey: generatePubkey('author1'), 
          kind: 1, 
          created_at: 1000
        }),
        new MockNDKEvent({ 
          id: 'regular2', 
          pubkey: generatePubkey('author1'), 
          kind: 1, 
          created_at: 2000
        }),
        new MockNDKEvent({ 
          id: 'replaceable1', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'publication1']]
        }),
        new MockNDKEvent({ 
          id: 'replaceable2', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 2000,
          tags: [['d', 'publication1']]
        })
      ] as NDKEvent[];

      const graphState = initializeGraphState(events);
      
      // Should have 3 nodes: 2 regular events + 1 replaceable (latest version)
      expect(graphState.nodeMap.size).toBe(3);
      expect(graphState.nodeMap.has('regular1')).toBe(true);
      expect(graphState.nodeMap.has('regular2')).toBe(true);
      expect(graphState.nodeMap.has('replaceable2')).toBe(true);
      expect(graphState.nodeMap.has('replaceable1')).toBe(false);
    });

    it('should correctly handle referenced events with coordinates', () => {
      const events = [
        new MockNDKEvent({ 
          id: 'index_old', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', 'book1'], ['title', 'Old Book Title']]
        }),
        new MockNDKEvent({ 
          id: 'index_new', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 2000,
          tags: [['d', 'book1'], ['title', 'New Book Title']]
        }),
        new MockNDKEvent({ 
          id: 'chapter1', 
          pubkey: generatePubkey('author1'), 
          kind: 30041, 
          created_at: 1500,
          tags: [
            ['d', 'chapter1'],
            ['a', `30040:${generatePubkey('author1')}:book1`, 'relay1']
          ]
        })
      ] as NDKEvent[];

      const graphState = initializeGraphState(events);
      
      // Only the new version of the index should be referenced
      expect(graphState.referencedIds.has('index_new')).toBe(true);
      expect(graphState.referencedIds.has('index_old')).toBe(false);
    });

    it('should handle edge cases in coordinate generation', () => {
      const events = [
        // Event with empty d-tag
        new MockNDKEvent({ 
          id: 'empty_dtag', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1000,
          tags: [['d', '']]
        }),
        // Event with no d-tag
        new MockNDKEvent({ 
          id: 'no_dtag', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1001,
          tags: []
        }),
        // Event with special characters in d-tag
        new MockNDKEvent({ 
          id: 'special_chars', 
          pubkey: generatePubkey('author1'), 
          kind: 30040, 
          created_at: 1002,
          tags: [['d', 'test/path:to@file.txt']]
        }),
        // Non-replaceable event (should always be included)
        new MockNDKEvent({ 
          id: 'non_replaceable', 
          pubkey: generatePubkey('author1'), 
          kind: 1, 
          created_at: 1003
        })
      ] as NDKEvent[];

      const graphState = initializeGraphState(events);
      
      // Empty d-tag should create a valid coordinate
      expect(graphState.nodeMap.has('empty_dtag')).toBe(true);
      // No d-tag means no coordinate, but event is still included (not replaceable without coordinate)
      expect(graphState.nodeMap.has('no_dtag')).toBe(true);
      // Special characters should be preserved
      expect(graphState.nodeMap.has('special_chars')).toBe(true);
      // Non-replaceable should always be included
      expect(graphState.nodeMap.has('non_replaceable')).toBe(true);
    });
  });
});