import { writable, derived, get } from "svelte/store";

export interface EventKindConfig {
  kind: number;
  limit: number;
  enabled?: boolean; // Whether this kind is enabled for display
  nestedLevels?: number; // Only for kind 30040
  depth?: number; // Only for kind 3 (follow lists)
  showAll?: boolean; // Only for content kinds (30041, 30818) - show all loaded content instead of limit
}

export interface VisualizationConfig {
  // Event configurations with per-kind limits
  eventConfigs: EventKindConfig[];

  // Graph traversal
  searchThroughFetched: boolean;
}

// Default configurations for common event kinds
const DEFAULT_EVENT_CONFIGS: EventKindConfig[] = [
  { kind: 0, limit: 5, enabled: false }, // Metadata events (profiles) - controls how many profiles to display
  { kind: 3, limit: 0, depth: 0, enabled: false }, // Follow lists - limit 0 = don't fetch, >0 = fetch follow lists
  { kind: 30040, limit: 20, nestedLevels: 1, enabled: true },
  { kind: 30041, limit: 20, enabled: false },
  { kind: 30818, limit: 20, enabled: false },
];

function createVisualizationConfig() {
  const initialConfig: VisualizationConfig = {
    eventConfigs: DEFAULT_EVENT_CONFIGS,
    searchThroughFetched: true,
  };

  const { subscribe, set, update } =
    writable<VisualizationConfig>(initialConfig);

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

        const newConfig: EventKindConfig = { kind, limit, enabled: true };
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
        return updated;
      }),

    // Remove an event kind
    removeEventKind: (kind: number) =>
      update((config) => {
        const updated = {
          ...config,
          eventConfigs: config.eventConfigs.filter((ec) => ec.kind !== kind),
        };
        return updated;
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

    // Toggle showAll for content kinds (30041, 30818)
    toggleShowAllContent: (kind: number) =>
      update((config) => ({
        ...config,
        eventConfigs: config.eventConfigs.map((ec) =>
          ec.kind === kind ? { ...ec, showAll: !ec.showAll } : ec,
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

    // Toggle enabled state for a specific kind
    toggleKind: (kind: number) =>
      update((config) => ({
        ...config,
        eventConfigs: config.eventConfigs.map((ec) =>
          ec.kind === kind ? { ...ec, enabled: !ec.enabled } : ec,
        ),
      })),
  };
}

export const visualizationConfig = createVisualizationConfig();

// Helper to get all enabled event kinds
export const enabledEventKinds = derived(visualizationConfig, ($config) =>
  $config.eventConfigs
    .filter((ec) => ec.enabled !== false)
    .map((ec) => ec.kind),
);

// Helper to check if a kind is enabled
export const isKindEnabled = derived(
  visualizationConfig,
  ($config) => (kind: number) => {
    const eventConfig = $config.eventConfigs.find((ec) => ec.kind === kind);
    return eventConfig ? eventConfig.enabled !== false : false;
  },
);
