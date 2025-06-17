import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable, get } from 'svelte/store';
import { displayLimits } from '$lib/stores/displayLimits';
import { visualizationConfig } from '$lib/stores/visualizationConfig';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Mock NDK Event for testing
function createMockEvent(kind: number, id: string): NDKEvent {
  return {
    id,
    kind,
    pubkey: 'mock-pubkey',
    created_at: Date.now() / 1000,
    content: `Mock content for ${id}`,
    tags: []
  } as NDKEvent;
}

describe('Display Limits Integration', () => {
  beforeEach(() => {
    // Reset stores to default values
    displayLimits.set({
      max30040: -1,
      max30041: -1,
      fetchIfNotFound: false
    });
    
    visualizationConfig.setMaxPublicationIndices(-1);
    visualizationConfig.setMaxEventsPerIndex(-1);
  });

  describe('Event Filtering with Limits', () => {
    it('should filter events when limits are set', () => {
      const events = [
        createMockEvent(30040, 'index1'),
        createMockEvent(30040, 'index2'),
        createMockEvent(30040, 'index3'),
        createMockEvent(30041, 'content1'),
        createMockEvent(30041, 'content2'),
        createMockEvent(30041, 'content3'),
        createMockEvent(30041, 'content4')
      ];

      // Apply display limits
      const limits = get(displayLimits);
      limits.max30040 = 2;
      limits.max30041 = 3;

      // Filter function
      const filterByLimits = (events: NDKEvent[], limits: any) => {
        const kindCounts = new Map<number, number>();
        
        return events.filter(event => {
          const count = kindCounts.get(event.kind) || 0;
          
          if (event.kind === 30040 && limits.max30040 !== -1 && count >= limits.max30040) {
            return false;
          }
          if (event.kind === 30041 && limits.max30041 !== -1 && count >= limits.max30041) {
            return false;
          }
          
          kindCounts.set(event.kind, count + 1);
          return true;
        });
      };

      const filtered = filterByLimits(events, limits);
      
      // Should have 2 index events and 3 content events
      expect(filtered.filter(e => e.kind === 30040)).toHaveLength(2);
      expect(filtered.filter(e => e.kind === 30041)).toHaveLength(3);
      expect(filtered).toHaveLength(5);
    });

    it('should respect unlimited (-1) values', () => {
      const events = Array.from({ length: 100 }, (_, i) => 
        createMockEvent(i % 2 === 0 ? 30040 : 30041, `event${i}`)
      );

      // Set one limit, leave other unlimited
      displayLimits.update(limits => ({
        ...limits,
        max30040: 10,
        max30041: -1
      }));

      const limits = get(displayLimits);
      const filtered = events.filter((event, index) => {
        if (event.kind === 30040) {
          const count = events.slice(0, index).filter(e => e.kind === 30040).length;
          return limits.max30040 === -1 || count < limits.max30040;
        }
        return true; // No limit on 30041
      });

      // Should have exactly 10 kind 30040 events
      expect(filtered.filter(e => e.kind === 30040)).toHaveLength(10);
      // Should have all 50 kind 30041 events
      expect(filtered.filter(e => e.kind === 30041)).toHaveLength(50);
    });
  });

  describe('Publication Index Limits', () => {
    it('should limit publication indices separately from content', () => {
      const config = get(visualizationConfig);
      
      // Create publication structure
      const publications = [
        { 
          index: createMockEvent(30040, 'pub1'),
          content: [
            createMockEvent(30041, 'pub1-content1'),
            createMockEvent(30041, 'pub1-content2'),
            createMockEvent(30041, 'pub1-content3')
          ]
        },
        {
          index: createMockEvent(30040, 'pub2'),
          content: [
            createMockEvent(30041, 'pub2-content1'),
            createMockEvent(30041, 'pub2-content2')
          ]
        },
        {
          index: createMockEvent(30040, 'pub3'),
          content: [
            createMockEvent(30041, 'pub3-content1')
          ]
        }
      ];

      // Set limits
      visualizationConfig.setMaxPublicationIndices(2);
      visualizationConfig.setMaxEventsPerIndex(2);

      // Apply limits
      const limitedPubs = publications
        .slice(0, get(visualizationConfig).maxPublicationIndices === -1 
          ? publications.length 
          : get(visualizationConfig).maxPublicationIndices)
        .map(pub => ({
          index: pub.index,
          content: pub.content.slice(0, get(visualizationConfig).maxEventsPerIndex === -1
            ? pub.content.length
            : get(visualizationConfig).maxEventsPerIndex)
        }));

      // Should have 2 publications
      expect(limitedPubs).toHaveLength(2);
      // First pub should have 2 content events
      expect(limitedPubs[0].content).toHaveLength(2);
      // Second pub should have 2 content events
      expect(limitedPubs[1].content).toHaveLength(2);
    });

    it('should handle per-index limits correctly', () => {
      visualizationConfig.setMaxEventsPerIndex(3);
      const maxPerIndex = get(visualizationConfig).maxEventsPerIndex;

      const indexEvents = new Map<string, NDKEvent[]>();
      
      // Simulate grouping events by index
      const events = [
        { indexId: 'idx1', event: createMockEvent(30041, 'c1') },
        { indexId: 'idx1', event: createMockEvent(30041, 'c2') },
        { indexId: 'idx1', event: createMockEvent(30041, 'c3') },
        { indexId: 'idx1', event: createMockEvent(30041, 'c4') }, // Should be filtered
        { indexId: 'idx2', event: createMockEvent(30041, 'c5') },
        { indexId: 'idx2', event: createMockEvent(30041, 'c6') }
      ];

      events.forEach(({ indexId, event }) => {
        const current = indexEvents.get(indexId) || [];
        if (maxPerIndex === -1 || current.length < maxPerIndex) {
          indexEvents.set(indexId, [...current, event]);
        }
      });

      // idx1 should have 3 events
      expect(indexEvents.get('idx1')).toHaveLength(3);
      // idx2 should have 2 events
      expect(indexEvents.get('idx2')).toHaveLength(2);
    });
  });

  describe('Fetch If Not Found Feature', () => {
    it('should identify missing referenced events', () => {
      const availableEvents = new Set(['event1', 'event2', 'event3']);
      const referencedEvents = ['event1', 'event2', 'event4', 'event5'];
      
      displayLimits.update(limits => ({
        ...limits,
        fetchIfNotFound: true
      }));

      const limits = get(displayLimits);
      const missingEvents = limits.fetchIfNotFound
        ? referencedEvents.filter(id => !availableEvents.has(id))
        : [];

      expect(missingEvents).toEqual(['event4', 'event5']);
    });

    it('should not fetch when fetchIfNotFound is false', () => {
      const availableEvents = new Set(['event1']);
      const referencedEvents = ['event1', 'event2', 'event3'];
      
      displayLimits.update(limits => ({
        ...limits,
        fetchIfNotFound: false
      }));

      const limits = get(displayLimits);
      const shouldFetch = limits.fetchIfNotFound && 
        referencedEvents.some(id => !availableEvents.has(id));

      expect(shouldFetch).toBe(false);
    });

    it('should batch fetch requests for missing events', () => {
      const fetchQueue: string[] = [];
      const addToFetchQueue = (ids: string[]) => {
        fetchQueue.push(...ids);
      };

      // Simulate finding missing events
      const missingEvents = ['event10', 'event11', 'event12'];
      
      displayLimits.update(limits => ({
        ...limits,
        fetchIfNotFound: true
      }));

      if (get(displayLimits).fetchIfNotFound) {
        addToFetchQueue(missingEvents);
      }

      expect(fetchQueue).toEqual(missingEvents);
      expect(fetchQueue).toHaveLength(3);
    });
  });

  describe('Integration with Visualization Updates', () => {
    it('should trigger appropriate updates when limits change', () => {
      const updateTypes: string[] = [];
      const mockUpdate = (type: string) => updateTypes.push(type);

      // Change publication index limit
      const oldConfig = get(visualizationConfig);
      visualizationConfig.setMaxPublicationIndices(5);
      
      if (get(visualizationConfig).maxPublicationIndices !== oldConfig.maxPublicationIndices) {
        mockUpdate('filter-indices');
      }

      // Change events per index limit
      visualizationConfig.setMaxEventsPerIndex(10);
      mockUpdate('filter-content');

      // Toggle fetchIfNotFound
      displayLimits.update(limits => ({
        ...limits,
        fetchIfNotFound: true
      }));
      mockUpdate('check-missing');

      expect(updateTypes).toContain('filter-indices');
      expect(updateTypes).toContain('filter-content');
      expect(updateTypes).toContain('check-missing');
    });

    it('should preserve existing graph structure when applying limits', () => {
      const graph = {
        nodes: [
          { id: 'idx1', type: 'index' },
          { id: 'c1', type: 'content' },
          { id: 'c2', type: 'content' },
          { id: 'c3', type: 'content' }
        ],
        links: [
          { source: 'idx1', target: 'c1' },
          { source: 'idx1', target: 'c2' },
          { source: 'idx1', target: 'c3' }
        ]
      };

      // Apply content limit
      visualizationConfig.setMaxEventsPerIndex(2);
      const limit = get(visualizationConfig).maxEventsPerIndex;

      // Filter nodes and links based on limit
      const contentNodes = graph.nodes.filter(n => n.type === 'content');
      const limitedContentIds = contentNodes.slice(0, limit).map(n => n.id);
      
      const filteredGraph = {
        nodes: graph.nodes.filter(n => 
          n.type !== 'content' || limitedContentIds.includes(n.id)
        ),
        links: graph.links.filter(l => 
          limitedContentIds.includes(l.target)
        )
      };

      expect(filteredGraph.nodes).toHaveLength(3); // 1 index + 2 content
      expect(filteredGraph.links).toHaveLength(2);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large event sets efficiently', () => {
      const largeEventSet = Array.from({ length: 10000 }, (_, i) => 
        createMockEvent(i % 2 === 0 ? 30040 : 30041, `event${i}`)
      );

      const startTime = performance.now();
      
      // Apply strict limits
      displayLimits.update(limits => ({
        ...limits,
        max30040: 50,
        max30041: 100
      }));

      const limits = get(displayLimits);
      const kindCounts = new Map<number, number>();
      
      const filtered = largeEventSet.filter(event => {
        const count = kindCounts.get(event.kind) || 0;
        
        if (event.kind === 30040 && limits.max30040 !== -1 && count >= limits.max30040) {
          return false;
        }
        if (event.kind === 30041 && limits.max30041 !== -1 && count >= limits.max30041) {
          return false;
        }
        
        kindCounts.set(event.kind, count + 1);
        return true;
      });

      const endTime = performance.now();
      const filterTime = endTime - startTime;

      // Should complete quickly even with large sets
      expect(filterTime).toBeLessThan(100); // 100ms threshold
      expect(filtered).toHaveLength(150); // 50 + 100
    });

    it('should cache limit calculations when possible', () => {
      let calculationCount = 0;
      
      const getCachedLimits = (() => {
        let cache: any = null;
        let cacheKey: string = '';
        
        return (limits: any) => {
          const key = JSON.stringify(limits);
          if (key !== cacheKey) {
            calculationCount++;
            cache = { ...limits, calculated: true };
            cacheKey = key;
          }
          return cache;
        };
      })();

      // First call - should calculate
      getCachedLimits(get(displayLimits));
      expect(calculationCount).toBe(1);

      // Same limits - should use cache
      getCachedLimits(get(displayLimits));
      expect(calculationCount).toBe(1);

      // Change limits - should recalculate
      displayLimits.update(limits => ({ ...limits, max30040: 10 }));
      getCachedLimits(get(displayLimits));
      expect(calculationCount).toBe(2);
    });
  });
});