import { writable, derived, get } from "svelte/store";

export interface EventKindConfig {
  kind: number;
  limit: number;
  nestedLevels?: number; // Only for kind 30040
  depth?: number; // Only for kind 3 (follow lists)
}

export interface VisualizationConfig {
  // Event configurations with per-kind limits
  eventConfigs: EventKindConfig[];

  // Graph traversal
  searchThroughFetched: boolean;
  
  // Append mode - add new events to existing graph instead of replacing
  appendMode?: boolean;

  // Legacy properties for backward compatibility
  allowedKinds?: number[];
  disabledKinds?: number[];
  allowFreeEvents?: boolean;
  maxPublicationIndices?: number;
  maxEventsPerIndex?: number;
}

// Default configurations for common event kinds
const DEFAULT_EVENT_CONFIGS: EventKindConfig[] = [
  { kind: 0, limit: 50 }, // Metadata events (profiles) - controls how many profiles to display
  { kind: 3, limit: 0, depth: 0 }, // Follow lists - limit 0 = don't fetch, >0 = fetch follow lists
  { kind: 30040, limit: 20, nestedLevels: 1 },
  { kind: 30041, limit: 20 },
  { kind: 30818, limit: 20 },
];

function createVisualizationConfig() {
  // Initialize with both new and legacy properties
  const initialConfig: VisualizationConfig = {
    eventConfigs: DEFAULT_EVENT_CONFIGS,
    searchThroughFetched: true,
    appendMode: false,
    // Legacy properties
    allowedKinds: DEFAULT_EVENT_CONFIGS.map(ec => ec.kind),
    disabledKinds: [30041, 30818],
    allowFreeEvents: false,
    maxPublicationIndices: -1,
    maxEventsPerIndex: -1,
  };

  const { subscribe, set, update } =
    writable<VisualizationConfig>(initialConfig);

  // Helper to sync legacy properties with eventConfigs
  const syncLegacyProperties = (config: VisualizationConfig) => {
    config.allowedKinds = config.eventConfigs.map((ec) => ec.kind);
    return config;
  };

  return {
    subscribe,
    update,
    reset: () => set(initialConfig),

    // Add a new event kind with default limit
    addEventKind: (kind: number, limit: number = 10) =>
      update((config) => {
        // Check if kind already exists
        if (config.eventConfigs.some((ec) => ec.kind === kind)) {
          return config;
        }

        const newConfig: EventKindConfig = { kind, limit };
        // Add nestedLevels for 30040
        if (kind === 30040) {
          newConfig.nestedLevels = 1;
        }
        // Add depth for kind 3
        if (kind === 3) {
          newConfig.depth = 0;
        }

        const updated = {
          ...config,
          eventConfigs: [...config.eventConfigs, newConfig],
        };
        return syncLegacyProperties(updated);
      }),

    // Legacy method for backward compatibility
    addKind: (kind: number) =>
      update((config) => {
        if (config.eventConfigs.some((ec) => ec.kind === kind)) {
          return config;
        }
        const updated = {
          ...config,
          eventConfigs: [...config.eventConfigs, { kind, limit: 10 }],
        };
        return syncLegacyProperties(updated);
      }),

    // Remove an event kind
    removeEventKind: (kind: number) =>
      update((config) => {
        const updated = {
          ...config,
          eventConfigs: config.eventConfigs.filter((ec) => ec.kind !== kind),
        };
        return syncLegacyProperties(updated);
      }),

    // Legacy method for backward compatibility
    removeKind: (kind: number) =>
      update((config) => {
        const updated = {
          ...config,
          eventConfigs: config.eventConfigs.filter((ec) => ec.kind !== kind),
        };
        return syncLegacyProperties(updated);
      }),

    // Update limit for a specific kind
    updateEventLimit: (kind: number, limit: number) =>
      update((config) => ({
        ...config,
        eventConfigs: config.eventConfigs.map((ec) =>
          ec.kind === kind ? { ...ec, limit } : ec,
        ),
      })),

    // Update nested levels for kind 30040
    updateNestedLevels: (levels: number) =>
      update((config) => ({
        ...config,
        eventConfigs: config.eventConfigs.map((ec) =>
          ec.kind === 30040 ? { ...ec, nestedLevels: levels } : ec,
        ),
      })),

    // Update depth for kind 3
    updateFollowDepth: (depth: number) =>
      update((config) => ({
        ...config,
        eventConfigs: config.eventConfigs.map((ec) =>
          ec.kind === 3 ? { ...ec, depth: depth } : ec,
        ),
      })),


    // Get config for a specific kind
    getEventConfig: (kind: number) => {
      let config: EventKindConfig | undefined;
      subscribe((c) => {
        config = c.eventConfigs.find((ec) => ec.kind === kind);
      })();
      return config;
    },

    toggleSearchThroughFetched: () =>
      update((config) => ({
        ...config,
        searchThroughFetched: !config.searchThroughFetched,
      })),
      
    toggleAppendMode: () =>
      update((config) => ({
        ...config,
        appendMode: !config.appendMode,
      })),

    // Legacy methods for backward compatibility
    toggleKind: (kind: number) =>
      update((config) => {
        const isDisabled = config.disabledKinds?.includes(kind) || false;
        if (isDisabled) {
          // Re-enable it
          return {
            ...config,
            disabledKinds:
              config.disabledKinds?.filter((k) => k !== kind) || [],
          };
        } else {
          // Disable it
          return {
            ...config,
            disabledKinds: [...(config.disabledKinds || []), kind],
          };
        }
      }),

    toggleFreeEvents: () =>
      update((config) => ({
        ...config,
        allowFreeEvents: !config.allowFreeEvents,
      })),

    setMaxPublicationIndices: (max: number) =>
      update((config) => ({
        ...config,
        maxPublicationIndices: max,
      })),

    setMaxEventsPerIndex: (max: number) =>
      update((config) => ({
        ...config,
        maxEventsPerIndex: max,
      })),
  };
}

export const visualizationConfig = createVisualizationConfig();

// Helper to get all enabled event kinds
export const enabledEventKinds = derived(visualizationConfig, ($config) =>
  $config.eventConfigs.map((ec) => ec.kind),
);

// Helper to check if a kind is enabled
export const isKindEnabled = derived(
  visualizationConfig,
  ($config) => (kind: number) =>
    $config.eventConfigs.some((ec) => ec.kind === kind),
);

// Legacy helper for backward compatibility
export const isKindAllowed = derived(
  visualizationConfig,
  ($config) => (kind: number) => {
    const inEventConfigs = $config.eventConfigs.some((ec) => ec.kind === kind);
    const notDisabled = !($config.disabledKinds?.includes(kind) || false);
    return inEventConfigs && notDisabled;
  },
);
