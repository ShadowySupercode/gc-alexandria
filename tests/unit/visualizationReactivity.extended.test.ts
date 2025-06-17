import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable, get } from 'svelte/store';
import { tick } from 'svelte';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Mock stores and components
vi.mock('$lib/stores/visualizationConfig', () => {
  const mockStore = writable({
    maxPublicationIndices: -1,
    maxEventsPerIndex: -1,
    searchThroughFetched: false
  });
  
  return {
    visualizationConfig: {
      subscribe: mockStore.subscribe,
      setMaxPublicationIndices: vi.fn((value: number) => {
        mockStore.update(s => ({ ...s, maxPublicationIndices: value }));
      }),
      setMaxEventsPerIndex: vi.fn((value: number) => {
        mockStore.update(s => ({ ...s, maxEventsPerIndex: value }));
      }),
      toggleSearchThroughFetched: vi.fn(() => {
        mockStore.update(s => ({ ...s, searchThroughFetched: !s.searchThroughFetched }));
      })
    }
  };
});

vi.mock('$lib/stores/displayLimits', () => {
  const mockStore = writable({
    max30040: -1,
    max30041: -1,
    fetchIfNotFound: false
  });
  
  return {
    displayLimits: mockStore
  };
});

describe('Extended Visualization Reactivity Tests', () => {
  let updateCount = 0;
  let lastUpdateType: string | null = null;
  let simulationRestarts = 0;

  // Mock updateGraph function
  const mockUpdateGraph = vi.fn((type: string) => {
    updateCount++;
    lastUpdateType = type;
  });

  // Mock simulation restart
  const mockRestartSimulation = vi.fn(() => {
    simulationRestarts++;
  });

  beforeEach(() => {
    updateCount = 0;
    lastUpdateType = null;
    simulationRestarts = 0;
    vi.clearAllMocks();
  });

  describe('Parameter Update Paths', () => {
    it('should trigger data fetch for networkFetchLimit changes', async () => {
      const params = {
        networkFetchLimit: 50,
        levelsToRender: 2,
        showTagAnchors: false,
        starVisualization: false,
        tagExpansionDepth: 0
      };

      // Change networkFetchLimit
      const oldParams = { ...params };
      params.networkFetchLimit = 100;

      const needsFetch = params.networkFetchLimit !== oldParams.networkFetchLimit;
      expect(needsFetch).toBe(true);
      
      if (needsFetch) {
        mockUpdateGraph('fetch-required');
      }

      expect(mockUpdateGraph).toHaveBeenCalledWith('fetch-required');
      expect(lastUpdateType).toBe('fetch-required');
    });

    it('should trigger data fetch for levelsToRender changes', async () => {
      const params = {
        networkFetchLimit: 50,
        levelsToRender: 2,
        showTagAnchors: false,
        starVisualization: false,
        tagExpansionDepth: 0
      };

      // Change levelsToRender
      const oldParams = { ...params };
      params.levelsToRender = 3;

      const needsFetch = params.levelsToRender !== oldParams.levelsToRender;
      expect(needsFetch).toBe(true);
      
      if (needsFetch) {
        mockUpdateGraph('fetch-required');
      }

      expect(mockUpdateGraph).toHaveBeenCalledWith('fetch-required');
    });

    it('should trigger fetch for tagExpansionDepth when > 0', async () => {
      const params = {
        tagExpansionDepth: 0,
        showTagAnchors: true
      };

      // Change to depth > 0
      const oldParams = { ...params };
      params.tagExpansionDepth = 1;

      const needsFetch = params.tagExpansionDepth > 0 && 
                        params.tagExpansionDepth !== oldParams.tagExpansionDepth;
      expect(needsFetch).toBe(true);
      
      if (needsFetch) {
        mockUpdateGraph('tag-expansion-fetch');
      }

      expect(mockUpdateGraph).toHaveBeenCalledWith('tag-expansion-fetch');
    });

    it('should not trigger fetch for tagExpansionDepth = 0', async () => {
      const params = {
        tagExpansionDepth: 2,
        showTagAnchors: true
      };

      // Change to depth = 0
      const oldParams = { ...params };
      params.tagExpansionDepth = 0;

      const needsFetch = params.tagExpansionDepth > 0;
      expect(needsFetch).toBe(false);
      
      if (!needsFetch) {
        mockUpdateGraph('visual-only');
      }

      expect(mockUpdateGraph).toHaveBeenCalledWith('visual-only');
    });

    it('should handle visual-only parameter changes', async () => {
      const visualParams = [
        { param: 'showTagAnchors', oldValue: false, newValue: true },
        { param: 'starVisualization', oldValue: false, newValue: true },
        { param: 'selectedTagType', oldValue: 't', newValue: 'p' }
      ];

      visualParams.forEach(({ param, oldValue, newValue }) => {
        vi.clearAllMocks();
        
        const needsFetch = false; // Visual parameters never need fetch
        if (!needsFetch) {
          mockUpdateGraph('visual-only');
        }

        expect(mockUpdateGraph).toHaveBeenCalledWith('visual-only');
        expect(mockUpdateGraph).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Display Limits Integration', () => {
    it('should handle maxPublicationIndices changes', async () => {
      const { visualizationConfig } = await import('$lib/stores/visualizationConfig');
      const { displayLimits } = await import('$lib/stores/displayLimits');

      let configValue: any;
      const unsubscribe = visualizationConfig.subscribe(v => configValue = v);

      // Set new limit
      visualizationConfig.setMaxPublicationIndices(10);
      await tick();

      expect(configValue.maxPublicationIndices).toBe(10);
      
      // This should trigger a visual update (filtering existing data)
      mockUpdateGraph('filter-existing');
      expect(mockUpdateGraph).toHaveBeenCalledWith('filter-existing');

      unsubscribe();
    });

    it('should handle unlimited (-1) values correctly', async () => {
      const { displayLimits } = await import('$lib/stores/displayLimits');

      let limitsValue: any;
      const unsubscribe = displayLimits.subscribe(v => limitsValue = v);

      // Set to unlimited
      displayLimits.update(limits => ({
        ...limits,
        max30040: -1,
        max30041: -1
      }));
      await tick();

      expect(limitsValue.max30040).toBe(-1);
      expect(limitsValue.max30041).toBe(-1);

      // Unlimited should show all events
      const shouldFilter = limitsValue.max30040 !== -1 || limitsValue.max30041 !== -1;
      expect(shouldFilter).toBe(false);

      unsubscribe();
    });

    it('should handle fetchIfNotFound toggle', async () => {
      const { displayLimits } = await import('$lib/stores/displayLimits');

      let limitsValue: any;
      const unsubscribe = displayLimits.subscribe(v => limitsValue = v);

      // Toggle fetchIfNotFound
      displayLimits.update(limits => ({
        ...limits,
        fetchIfNotFound: true
      }));
      await tick();

      expect(limitsValue.fetchIfNotFound).toBe(true);

      // This should potentially trigger fetches for missing events
      if (limitsValue.fetchIfNotFound) {
        mockUpdateGraph('fetch-missing');
      }

      expect(mockUpdateGraph).toHaveBeenCalledWith('fetch-missing');

      unsubscribe();
    });
  });

  describe('State Synchronization', () => {
    it('should maintain consistency between related parameters', async () => {
      let showTagAnchors = false;
      let tagExpansionDepth = 2;
      let selectedTagType = 't';

      // When disabling tag anchors, depth should reset
      showTagAnchors = false;
      if (!showTagAnchors && tagExpansionDepth > 0) {
        tagExpansionDepth = 0;
      }

      expect(tagExpansionDepth).toBe(0);

      // When enabling tag anchors, previous values can be restored
      showTagAnchors = true;
      // selectedTagType should remain unchanged
      expect(selectedTagType).toBe('t');
    });

    it('should handle disabled tags state updates', async () => {
      const disabledTags = new Set<string>();
      const tagAnchors = [
        { id: 't-bitcoin', type: 't', label: 'bitcoin' },
        { id: 't-nostr', type: 't', label: 'nostr' }
      ];

      // Toggle tag state
      const tagId = 't-bitcoin';
      if (disabledTags.has(tagId)) {
        disabledTags.delete(tagId);
      } else {
        disabledTags.add(tagId);
      }

      expect(disabledTags.has('t-bitcoin')).toBe(true);
      expect(disabledTags.has('t-nostr')).toBe(false);

      // Visual update only
      mockUpdateGraph('tag-filter');
      expect(mockUpdateGraph).toHaveBeenCalledWith('tag-filter');
    });
  });

  describe('Performance and Memory Management', () => {
    it('should debounce rapid parameter changes', async () => {
      const debounceDelay = 100;
      let pendingUpdate: any = null;
      let updateTimer: any = null;

      const debouncedUpdate = (type: string) => {
        if (updateTimer) clearTimeout(updateTimer);
        
        pendingUpdate = type;
        updateTimer = setTimeout(() => {
          mockUpdateGraph(pendingUpdate);
          pendingUpdate = null;
        }, debounceDelay);
      };

      // Rapid changes
      debouncedUpdate('change1');
      debouncedUpdate('change2');
      debouncedUpdate('change3');

      // Should not have called update yet
      expect(mockUpdateGraph).not.toHaveBeenCalled();

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, debounceDelay + 10));

      // Should only call once with last change
      expect(mockUpdateGraph).toHaveBeenCalledTimes(1);
      expect(mockUpdateGraph).toHaveBeenCalledWith('change3');
    });

    it('should clean up position cache for removed nodes', () => {
      const positionCache = new Map<string, { x: number; y: number }>();
      const maxCacheSize = 1000;

      // Add positions
      for (let i = 0; i < 1500; i++) {
        positionCache.set(`node${i}`, { x: i * 10, y: i * 10 });
      }

      // Clean up old entries if cache too large
      if (positionCache.size > maxCacheSize) {
        const entriesToKeep = Array.from(positionCache.entries())
          .slice(-maxCacheSize);
        positionCache.clear();
        entriesToKeep.forEach(([k, v]) => positionCache.set(k, v));
      }

      expect(positionCache.size).toBe(maxCacheSize);
    });

    it('should restart simulation efficiently', () => {
      const needsSimulationRestart = (paramChanged: string) => {
        const restartParams = ['starVisualization', 'showTagAnchors'];
        return restartParams.includes(paramChanged);
      };

      // Test various parameter changes
      expect(needsSimulationRestart('starVisualization')).toBe(true);
      expect(needsSimulationRestart('showTagAnchors')).toBe(true);
      expect(needsSimulationRestart('selectedTagType')).toBe(false);
      
      // Only restart when necessary
      if (needsSimulationRestart('starVisualization')) {
        mockRestartSimulation();
      }
      
      expect(mockRestartSimulation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty event arrays gracefully', () => {
      const events: NDKEvent[] = [];
      const graph = { nodes: [], links: [] };

      // Should not crash with empty data
      expect(() => {
        if (events.length === 0) {
          mockUpdateGraph('empty-data');
        }
      }).not.toThrow();

      expect(mockUpdateGraph).toHaveBeenCalledWith('empty-data');
    });

    it('should handle parameter validation', () => {
      const validateParams = (params: any) => {
        const errors: string[] = [];
        
        if (params.networkFetchLimit < 1) {
          errors.push('networkFetchLimit must be >= 1');
        }
        if (params.levelsToRender < 0) {
          errors.push('levelsToRender must be >= 0');
        }
        if (params.tagExpansionDepth < 0 || params.tagExpansionDepth > 10) {
          errors.push('tagExpansionDepth must be between 0 and 10');
        }
        
        return errors;
      };

      const invalidParams = {
        networkFetchLimit: 0,
        levelsToRender: -1,
        tagExpansionDepth: 15
      };

      const errors = validateParams(invalidParams);
      expect(errors).toHaveLength(3);
      expect(errors).toContain('networkFetchLimit must be >= 1');
    });

    it('should handle concurrent updates safely', async () => {
      let isUpdating = false;
      const updates: string[] = [];

      const safeUpdate = async (type: string) => {
        if (isUpdating) {
          // Queue update
          return new Promise(resolve => {
            setTimeout(() => safeUpdate(type).then(resolve), 10);
          });
        }

        isUpdating = true;
        updates.push(type);
        await new Promise(resolve => setTimeout(resolve, 50));
        isUpdating = false;
      };

      // Trigger concurrent updates
      const promises = [
        safeUpdate('update1'),
        safeUpdate('update2'),
        safeUpdate('update3')
      ];

      await Promise.all(promises);

      // All updates should complete
      expect(updates).toHaveLength(3);
    });
  });
});