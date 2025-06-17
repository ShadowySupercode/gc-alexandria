import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateGraph, generateStarGraph } from '$lib/navigator/EventNetwork/utils/networkBuilder';
import { enhanceGraphWithTags } from '$lib/navigator/EventNetwork/utils/tagNetworkBuilder';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Mock NDKEvent
function createMockEvent(id: string, kind: number, tags: string[][] = []): NDKEvent {
  return {
    id,
    kind,
    pubkey: 'test-pubkey',
    created_at: Date.now() / 1000,
    content: `Content for ${id}`,
    tags,
    getMatchingTags: (tagName: string) => tags.filter(t => t[0] === tagName)
  } as NDKEvent;
}

describe('Link Rendering Debug Tests', () => {
  describe('Link Generation in Graph Builders', () => {
    it('should generate links in standard graph', () => {
      const events = [
        createMockEvent('index1', 30040),
        createMockEvent('content1', 30041, [['a', '30040:test-pubkey:index1']]),
        createMockEvent('content2', 30041, [['a', '30040:test-pubkey:index1']])
      ];

      const graph = generateGraph(events, 2);
      
      console.log('Standard graph:', {
        nodes: graph.nodes.map(n => ({ id: n.id, type: n.type })),
        links: graph.links.map(l => ({ 
          source: typeof l.source === 'string' ? l.source : l.source.id,
          target: typeof l.target === 'string' ? l.target : l.target.id
        }))
      });

      expect(graph.nodes).toHaveLength(3);
      expect(graph.links).toHaveLength(2); // Two content nodes linking to index
    });

    it('should generate links in star graph', () => {
      const events = [
        createMockEvent('index1', 30040),
        createMockEvent('content1', 30041, [['a', '30040:test-pubkey:index1']]),
        createMockEvent('content2', 30041, [['a', '30040:test-pubkey:index1']])
      ];

      const graph = generateStarGraph(events, 2);
      
      console.log('Star graph:', {
        nodes: graph.nodes.map(n => ({ id: n.id, type: n.type })),
        links: graph.links.map(l => ({ 
          source: typeof l.source === 'string' ? l.source : l.source.id,
          target: typeof l.target === 'string' ? l.target : l.target.id
        }))
      });

      expect(graph.nodes).toHaveLength(3);
      expect(graph.links).toHaveLength(2);
    });

    it('should generate links with tag anchors', () => {
      const events = [
        createMockEvent('index1', 30040, [['t', 'bitcoin']]),
        createMockEvent('content1', 30041, [['a', '30040:test-pubkey:index1'], ['t', 'bitcoin']]),
      ];

      const baseGraph = generateGraph(events, 2);
      const enhancedGraph = enhanceGraphWithTags(baseGraph, events, 't', 1000, 600);
      
      console.log('Enhanced graph with tags:', {
        nodes: enhancedGraph.nodes.map(n => ({ 
          id: n.id, 
          type: n.type,
          isTagAnchor: n.isTagAnchor 
        })),
        links: enhancedGraph.links.map(l => ({ 
          source: typeof l.source === 'string' ? l.source : l.source.id,
          target: typeof l.target === 'string' ? l.target : l.target.id
        }))
      });

      // Should have original nodes plus tag anchor
      expect(enhancedGraph.nodes.length).toBeGreaterThan(baseGraph.nodes.length);
      // Should have original links plus tag connections
      expect(enhancedGraph.links.length).toBeGreaterThan(baseGraph.links.length);
    });
  });

  describe('Link Data Structure', () => {
    it('should have proper source and target references', () => {
      const events = [
        createMockEvent('index1', 30040),
        createMockEvent('content1', 30041, [['a', '30040:test-pubkey:index1']])
      ];

      const graph = generateGraph(events, 2);
      
      graph.links.forEach(link => {
        expect(link.source).toBeDefined();
        expect(link.target).toBeDefined();
        
        // Check if source/target are strings (IDs) or objects
        if (typeof link.source === 'string') {
          const sourceNode = graph.nodes.find(n => n.id === link.source);
          expect(sourceNode).toBeDefined();
        } else {
          expect(link.source.id).toBeDefined();
        }
        
        if (typeof link.target === 'string') {
          const targetNode = graph.nodes.find(n => n.id === link.target);
          expect(targetNode).toBeDefined();
        } else {
          expect(link.target.id).toBeDefined();
        }
      });
    });
  });

  describe('D3 Force Simulation Link Format', () => {
    it('should verify link format matches D3 requirements', () => {
      const events = [
        createMockEvent('index1', 30040),
        createMockEvent('content1', 30041, [['a', '30040:test-pubkey:index1']])
      ];

      const graph = generateGraph(events, 2);
      
      // D3 expects links to have source/target that reference node objects or IDs
      graph.links.forEach(link => {
        // For D3, links should initially have string IDs
        if (typeof link.source === 'string') {
          expect(graph.nodes.some(n => n.id === link.source)).toBe(true);
        }
        if (typeof link.target === 'string') {
          expect(graph.nodes.some(n => n.id === link.target)).toBe(true);
        }
      });
    });
  });
});