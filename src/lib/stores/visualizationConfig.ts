import { writable, derived } from 'svelte/store';

export interface VisualizationConfig {
  // Event filtering
  allowedKinds: number[];  // Using array for ordered display
  allowFreeEvents: boolean;
  
  // Display limits (moving from displayLimits store)
  maxPublicationIndices: number;  // -1 unlimited
  maxEventsPerIndex: number;      // -1 unlimited
  
  // Graph traversal
  searchThroughFetched: boolean;
}

function createVisualizationConfig() {
  const { subscribe, set, update } = writable<VisualizationConfig>({
    allowedKinds: [30040, 30041, 30818],
    allowFreeEvents: false,
    maxPublicationIndices: -1,
    maxEventsPerIndex: -1,
    searchThroughFetched: true
  });

  return {
    subscribe,
    update,
    reset: () => set({
      allowedKinds: [30040, 30041, 30818],
      allowFreeEvents: false,
      maxPublicationIndices: -1,
      maxEventsPerIndex: -1,
      searchThroughFetched: true
    }),
    addKind: (kind: number) => update(config => {
      if (!config.allowedKinds.includes(kind)) {
        return { ...config, allowedKinds: [...config.allowedKinds, kind] };
      }
      return config;
    }),
    removeKind: (kind: number) => update(config => ({
      ...config,
      allowedKinds: config.allowedKinds.filter(k => k !== kind)
    })),
    toggleFreeEvents: () => update(config => ({
      ...config,
      allowFreeEvents: !config.allowFreeEvents
    })),
    setMaxPublicationIndices: (max: number) => update(config => ({
      ...config,
      maxPublicationIndices: max
    })),
    setMaxEventsPerIndex: (max: number) => update(config => ({
      ...config,
      maxEventsPerIndex: max
    })),
    toggleSearchThroughFetched: () => update(config => ({
      ...config,
      searchThroughFetched: !config.searchThroughFetched
    }))
  };
}

export const visualizationConfig = createVisualizationConfig();

// Helper to check if a kind is allowed
export const isKindAllowed = derived(
  visualizationConfig,
  $config => (kind: number) => $config.allowedKinds.includes(kind)
);