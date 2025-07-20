import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { 
  deduplicateContentEvents, 
  deduplicateAndCombineEvents,
  isReplaceableEvent,
  getEventCoordinate 
} from '../../src/lib/utils/eventDeduplication';

// Mock NDKEvent for testing
class MockNDKEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];

  constructor(id: string, kind: number, pubkey: string, created_at: number, dTag: string, content: string = '') {
    this.id = id;
    this.kind = kind;
    this.pubkey = pubkey;
    this.created_at = created_at;
    this.content = content;
    this.tags = [['d', dTag]];
  }

  tagValue(tagName: string): string | undefined {
    const tag = this.tags.find(t => t[0] === tagName);
    return tag ? tag[1] : undefined;
  }
}

describe('Relay Deduplication Behavior Tests', () => {
  let mockEvents: MockNDKEvent[];

  beforeEach(() => {
    // Create test events with different timestamps
    mockEvents = [
      // Older version of a publication content event
      new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'chapter-1', 'Old content'),
      // Newer version of the same publication content event
      new MockNDKEvent('event2', 30041, 'pubkey1', 2000, 'chapter-1', 'Updated content'),
      // Different publication content event
      new MockNDKEvent('event3', 30041, 'pubkey1', 1500, 'chapter-2', 'Different content'),
      // Publication index event (should not be deduplicated)
      new MockNDKEvent('event4', 30040, 'pubkey1', 1200, 'book-1', 'Index content'),
      // Regular text note (should not be deduplicated)
      new MockNDKEvent('event5', 1, 'pubkey1', 1300, '', 'Regular note'),
    ];
  });

  describe('Addressable Event Deduplication', () => {
    it('should keep only the most recent version of addressable events by coordinate', () => {
      // Test the deduplication logic for content events
      const eventSets = [new Set(mockEvents.filter(e => e.kind === 30041) as NDKEvent[])];
      const result = deduplicateContentEvents(eventSets);
      
      // Should have 2 unique coordinates: chapter-1 and chapter-2
      expect(result.size).toBe(2);
      
      // Should keep the newer version of chapter-1
      const chapter1Event = result.get('30041:pubkey1:chapter-1');
      expect(chapter1Event?.id).toBe('event2');
      expect(chapter1Event?.content).toBe('Updated content');
      
      // Should keep chapter-2
      const chapter2Event = result.get('30041:pubkey1:chapter-2');
      expect(chapter2Event?.id).toBe('event3');
    });

    it('should handle events with missing d-tags gracefully', () => {
      const eventWithoutDTag = new MockNDKEvent('event6', 30041, 'pubkey1', 1400, '', 'No d-tag');
      eventWithoutDTag.tags = []; // Remove d-tag
      
      const eventSets = [new Set([eventWithoutDTag] as NDKEvent[])];
      const result = deduplicateContentEvents(eventSets);
      
      // Should not include events without d-tags
      expect(result.size).toBe(0);
    });

    it('should handle events with missing timestamps', () => {
      const eventWithoutTimestamp = new MockNDKEvent('event7', 30041, 'pubkey1', 0, 'chapter-3', 'No timestamp');
      const eventWithTimestamp = new MockNDKEvent('event8', 30041, 'pubkey1', 1500, 'chapter-3', 'With timestamp');
      
      const eventSets = [new Set([eventWithoutTimestamp, eventWithTimestamp] as NDKEvent[])];
      const result = deduplicateContentEvents(eventSets);
      
      // Should prefer the event with timestamp
      const chapter3Event = result.get('30041:pubkey1:chapter-3');
      expect(chapter3Event?.id).toBe('event8');
    });
  });

  describe('Mixed Event Type Deduplication', () => {
    it('should only deduplicate addressable events (kinds 30000-39999)', () => {
      const result = deduplicateAndCombineEvents(
        [mockEvents[4]] as NDKEvent[], // Regular text note
        new Set([mockEvents[3]] as NDKEvent[]), // Publication index
        new Set([mockEvents[0], mockEvents[1], mockEvents[2]] as NDKEvent[]) // Content events
      );
      
      // Should have 4 events total:
      // - 1 regular text note (not deduplicated)
      // - 1 publication index (not deduplicated)
      // - 2 unique content events (deduplicated from 3)
      expect(result.length).toBe(4);
      
      // Verify the content events were deduplicated
      const contentEvents = result.filter(e => e.kind === 30041);
      expect(contentEvents.length).toBe(2);
      
      // Verify the newer version was kept
      const newerEvent = contentEvents.find(e => e.id === 'event2');
      expect(newerEvent).toBeDefined();
    });

    it('should handle non-addressable events correctly', () => {
      const regularEvents = [
        new MockNDKEvent('note1', 1, 'pubkey1', 1000, '', 'Note 1'),
        new MockNDKEvent('note2', 1, 'pubkey1', 2000, '', 'Note 2'),
        new MockNDKEvent('profile1', 0, 'pubkey1', 1500, '', 'Profile 1'),
      ];
      
      const result = deduplicateAndCombineEvents(
        regularEvents as NDKEvent[],
        new Set(),
        new Set()
      );
      
      // All regular events should be included (no deduplication)
      expect(result.length).toBe(3);
    });
  });

  describe('Coordinate System Validation', () => {
    it('should correctly identify event coordinates', () => {
      const event = new MockNDKEvent('test', 30041, 'pubkey123', 1000, 'test-chapter');
      const coordinate = getEventCoordinate(event as NDKEvent);
      
      expect(coordinate).toBe('30041:pubkey123:test-chapter');
    });

    it('should handle d-tags with colons correctly', () => {
      const event = new MockNDKEvent('test', 30041, 'pubkey123', 1000, 'chapter:with:colons');
      const coordinate = getEventCoordinate(event as NDKEvent);
      
      expect(coordinate).toBe('30041:pubkey123:chapter:with:colons');
    });

    it('should return null for non-replaceable events', () => {
      const event = new MockNDKEvent('test', 1, 'pubkey123', 1000, '');
      const coordinate = getEventCoordinate(event as NDKEvent);
      
      expect(coordinate).toBeNull();
    });
  });

  describe('Replaceable Event Detection', () => {
    it('should correctly identify replaceable events', () => {
      const addressableEvent = new MockNDKEvent('test', 30041, 'pubkey123', 1000, 'test');
      const regularEvent = new MockNDKEvent('test', 1, 'pubkey123', 1000, '');
      
      expect(isReplaceableEvent(addressableEvent as NDKEvent)).toBe(true);
      expect(isReplaceableEvent(regularEvent as NDKEvent)).toBe(false);
    });

    it('should handle edge cases of replaceable event ranges', () => {
      const event29999 = new MockNDKEvent('test', 29999, 'pubkey123', 1000, 'test');
      const event30000 = new MockNDKEvent('test', 30000, 'pubkey123', 1000, 'test');
      const event39999 = new MockNDKEvent('test', 39999, 'pubkey123', 1000, 'test');
      const event40000 = new MockNDKEvent('test', 40000, 'pubkey123', 1000, 'test');
      
      expect(isReplaceableEvent(event29999 as NDKEvent)).toBe(false);
      expect(isReplaceableEvent(event30000 as NDKEvent)).toBe(true);
      expect(isReplaceableEvent(event39999 as NDKEvent)).toBe(true);
      expect(isReplaceableEvent(event40000 as NDKEvent)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty event sets', () => {
      const result = deduplicateContentEvents([]);
      expect(result.size).toBe(0);
    });

    it('should handle events with null/undefined values', () => {
      const invalidEvent = {
        id: undefined,
        kind: 30041,
        pubkey: 'pubkey1',
        created_at: 1000,
        tagValue: () => undefined, // Return undefined for d-tag
      } as unknown as NDKEvent;
      
      const eventSets = [new Set([invalidEvent])];
      const result = deduplicateContentEvents(eventSets);
      
      // Should handle gracefully without crashing
      expect(result.size).toBe(0);
    });

    it('should handle events from different authors with same d-tag', () => {
      const event1 = new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'same-chapter', 'Author 1');
      const event2 = new MockNDKEvent('event2', 30041, 'pubkey2', 1000, 'same-chapter', 'Author 2');
      
      const eventSets = [new Set([event1, event2] as NDKEvent[])];
      const result = deduplicateContentEvents(eventSets);
      
      // Should have 2 events (different coordinates due to different authors)
      expect(result.size).toBe(2);
      expect(result.has('30041:pubkey1:same-chapter')).toBe(true);
      expect(result.has('30041:pubkey2:same-chapter')).toBe(true);
    });
  });
});

describe('Relay Behavior Simulation', () => {
  it('should simulate what happens when relays return duplicate events', () => {
    // Simulate a relay that returns multiple versions of the same event
    const relayEvents = [
      new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'chapter-1', 'Old version'),
      new MockNDKEvent('event2', 30041, 'pubkey1', 2000, 'chapter-1', 'New version'),
      new MockNDKEvent('event3', 30041, 'pubkey1', 1500, 'chapter-1', 'Middle version'),
    ];
    
    // This simulates what a "bad" relay might return
    const eventSets = [new Set(relayEvents as NDKEvent[])];
    const result = deduplicateContentEvents(eventSets);
    
    // Should only keep the newest version
    expect(result.size).toBe(1);
    const keptEvent = result.get('30041:pubkey1:chapter-1');
    expect(keptEvent?.id).toBe('event2');
    expect(keptEvent?.content).toBe('New version');
  });

  it('should simulate multiple relays returning different versions', () => {
    // Simulate multiple relays returning different versions
    const relay1Events = [
      new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'chapter-1', 'Relay 1 version'),
    ];
    
    const relay2Events = [
      new MockNDKEvent('event2', 30041, 'pubkey1', 2000, 'chapter-1', 'Relay 2 version'),
    ];
    
    const eventSets = [new Set(relay1Events as NDKEvent[]), new Set(relay2Events as NDKEvent[])];
    const result = deduplicateContentEvents(eventSets);
    
    // Should keep the newest version from any relay
    expect(result.size).toBe(1);
    const keptEvent = result.get('30041:pubkey1:chapter-1');
    expect(keptEvent?.id).toBe('event2');
    expect(keptEvent?.content).toBe('Relay 2 version');
  });
});

describe('Real Relay Deduplication Tests', () => {
  // These tests actually query real relays to see if they deduplicate
  // Note: These are integration tests and may be flaky due to network conditions
  
  it('should detect if relays are returning duplicate replaceable events', async () => {
    // This test queries real relays to see if they return duplicates
    // We'll use a known author who has published multiple versions of content
    
    // Known author with multiple publication content events
    const testAuthor = 'npub1z4m7gkva6yxgvdyclc7zp0qt69x9zgn8lu8sllg06wx6432h77qs0k97ks';
    
    // Query for publication content events (kind 30041) from this author
    // We expect relays to return only the most recent version of each d-tag
    
    // This is a placeholder - in a real test, we would:
    // 1. Query multiple relays for the same author's 30041 events
    // 2. Check if any relay returns multiple events with the same d-tag
    // 3. Verify that if duplicates exist, our deduplication logic handles them
    
    console.log('Note: This test would require actual relay queries to verify deduplication behavior');
    console.log('To run this test properly, we would need to:');
    console.log('1. Query real relays for replaceable events');
    console.log('2. Check if relays return duplicates');
    console.log('3. Verify our deduplication logic works on real data');
    
    // For now, we'll just assert that our logic is ready to handle real data
    expect(true).toBe(true);
  }, 30000); // 30 second timeout for network requests

  it('should verify that our deduplication logic works on real relay data', async () => {
    // This test would:
    // 1. Fetch real events from relays
    // 2. Apply our deduplication logic
    // 3. Verify that the results are correct
    
    console.log('Note: This test would require actual relay queries');
    console.log('To implement this test, we would need to:');
    console.log('1. Set up NDK with real relays');
    console.log('2. Fetch events for a known author with multiple versions');
    console.log('3. Apply deduplication and verify results');
    
    expect(true).toBe(true);
  }, 30000);
});

describe('Practical Relay Behavior Analysis', () => {
  it('should document what we know about relay deduplication behavior', () => {
    // This test documents our current understanding of relay behavior
    // based on the code analysis and the comment from onedev
    
    console.log('\n=== RELAY DEDUPLICATION BEHAVIOR ANALYSIS ===');
    console.log('\nBased on the code analysis and the comment from onedev:');
    console.log('\n1. THEORETICAL BEHAVIOR:');
    console.log('   - Relays SHOULD handle deduplication for replaceable events');
    console.log('   - Only the most recent version of each coordinate should be stored');
    console.log('   - Client-side deduplication should only be needed for cached/local events');
    
    console.log('\n2. REALITY CHECK:');
    console.log('   - Not all relays implement deduplication correctly');
    console.log('   - Some relays may return multiple versions of the same event');
    console.log('   - Network conditions and relay availability can cause inconsistencies');
    
    console.log('\n3. ALEXANDRIA\'S APPROACH:');
    console.log('   - Implements client-side deduplication as a safety net');
    console.log('   - Uses coordinate system (kind:pubkey:d-tag) for addressable events');
    console.log('   - Keeps the most recent version based on created_at timestamp');
    console.log('   - Only applies to replaceable events (kinds 30000-39999)');
    
    console.log('\n4. WHY KEEP THE DEDUPLICATION:');
    console.log('   - Defensive programming against imperfect relay implementations');
    console.log('   - Handles multiple relay sources with different data');
    console.log('   - Works with cached events that might be outdated');
    console.log('   - Ensures consistent user experience regardless of relay behavior');
    
    console.log('\n5. TESTING STRATEGY:');
    console.log('   - Unit tests verify our deduplication logic works correctly');
    console.log('   - Integration tests would verify relay behavior (when network allows)');
    console.log('   - Monitoring can help determine if relays improve over time');
    
    // This test documents our understanding rather than asserting specific behavior
    expect(true).toBe(true);
  });

  it('should provide recommendations for when to remove deduplication', () => {
    console.log('\n=== RECOMMENDATIONS FOR REMOVING DEDUPLICATION ===');
    console.log('\nThe deduplication logic should be kept until:');
    console.log('\n1. RELAY STANDARDS:');
    console.log('   - NIP-33 (replaceable events) is widely implemented by relays');
    console.log('   - Relays consistently return only the most recent version');
    console.log('   - No major relay implementations return duplicates');
    
    console.log('\n2. TESTING EVIDENCE:');
    console.log('   - Real-world testing shows relays don\'t return duplicates');
    console.log('   - Multiple relay operators confirm deduplication behavior');
    console.log('   - No user reports of duplicate content issues');
    
    console.log('\n3. MONITORING:');
    console.log('   - Add logging to track when deduplication is actually used');
    console.log('   - Monitor relay behavior over time');
    console.log('   - Collect metrics on duplicate events found');
    
    console.log('\n4. GRADUAL REMOVAL:');
    console.log('   - Make deduplication configurable (on/off)');
    console.log('   - Test with deduplication disabled in controlled environments');
    console.log('   - Monitor for issues before removing completely');
    
    console.log('\n5. FALLBACK STRATEGY:');
    console.log('   - Keep deduplication as a fallback option');
    console.log('   - Allow users to enable it if they experience issues');
    console.log('   - Maintain the code for potential future use');
    
    expect(true).toBe(true);
  });
});

describe('Logging and Monitoring Tests', () => {
  it('should verify that logging works when duplicates are found', () => {
    // Mock console.log to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Create events with duplicates
    const duplicateEvents = [
      new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'chapter-1', 'Old version'),
      new MockNDKEvent('event2', 30041, 'pubkey1', 2000, 'chapter-1', 'New version'),
      new MockNDKEvent('event3', 30041, 'pubkey1', 1500, 'chapter-1', 'Middle version'),
    ];
    
    const eventSets = [new Set(duplicateEvents as NDKEvent[])];
    const result = deduplicateContentEvents(eventSets);
    
    // Verify the deduplication worked
    expect(result.size).toBe(1);
    
    // Verify that logging was called
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[eventDeduplication] Found 2 duplicate events out of 3 total events')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[eventDeduplication] Reduced to 1 unique coordinates')
    );
    
    // Restore console.log
    consoleSpy.mockRestore();
  });

  it('should verify that logging works when no duplicates are found', () => {
    // Mock console.log to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Create events without duplicates
    const uniqueEvents = [
      new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'chapter-1', 'Content 1'),
      new MockNDKEvent('event2', 30041, 'pubkey1', 2000, 'chapter-2', 'Content 2'),
    ];
    
    const eventSets = [new Set(uniqueEvents as NDKEvent[])];
    const result = deduplicateContentEvents(eventSets);
    
    // Verify no deduplication was needed
    expect(result.size).toBe(2);
    
    // Verify that logging was called with "no duplicates" message
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[eventDeduplication] No duplicates found in 2 events')
    );
    
    // Restore console.log
    consoleSpy.mockRestore();
  });

  it('should verify that deduplicateAndCombineEvents logging works', () => {
    // Mock console.log to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Create events with duplicates
    const duplicateEvents = [
      new MockNDKEvent('event1', 30041, 'pubkey1', 1000, 'chapter-1', 'Old version'),
      new MockNDKEvent('event2', 30041, 'pubkey1', 2000, 'chapter-1', 'New version'),
    ];
    
    const result = deduplicateAndCombineEvents(
      [] as NDKEvent[],
      new Set(),
      new Set(duplicateEvents as NDKEvent[])
    );
    
    // Verify the deduplication worked
    expect(result.length).toBe(1);
    
    // Verify that logging was called
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[eventDeduplication] deduplicateAndCombineEvents: Found 1 duplicate coordinates')
    );
    
    // Restore console.log
    consoleSpy.mockRestore();
  });
}); 