import { writable, derived, get } from "svelte/store";

export interface EventKindConfig {
  kind: number;
  limit: number;
  enabled?: boolean; // Whether this kind is enabled for display
  nestedLevels?: number; // Only for kind 30040
  depth?: number; // Only for kind 3 (follow lists)
  showAll?: boolean; // Only for content kinds (30041, 30818) - show all loaded content instead of limit
}

/**
 * VisualizationConfig now uses a Map<number, string> for eventConfigs.
 * The key is the event kind (number), and the value is a JSON stringified EventKindConfig.
 * This allows O(1) retrieval of config by kind.
 */
export interface VisualizationConfig {
  /**
   * Event configurations with per-kind limits.
   */
  eventConfigs: EventKindConfig[];

  /**
   * Whether to search through all fetched events during graph traversal.
   */
  searchThroughFetched: boolean;
}

// Default configurations for common event kinds
const DEFAULT_EVENT_CONFIGS: EventKindConfig[] = [
  { kind: 30040, limit: 20, nestedLevels: 1, enabled: true },
  { kind: 30041, limit: 20, enabled: false },
  { kind: 30818, limit: 20, enabled: false },
  { kind: 30023, limit: 20, enabled: false },
];

function createVisualizationConfig() {
  const initialConfig: VisualizationConfig = {
    eventConfigs: DEFAULT_EVENT_CONFIGS,
    searchThroughFetched: true,
  };
  
  const { subscribe, set, update } = writable<VisualizationConfig>(initialConfig);

  function reset() {
    set(initialConfig);
  }

  function addEventKind(kind: number, limit: number = 10) {
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
      
      return {
        ...config,
        eventConfigs: [...config.eventConfigs, newConfig],
      };
    });
  }

  function removeEventKind(kind: number) {
    update((config) => ({
      ...config,
      eventConfigs: config.eventConfigs.filter((ec) => ec.kind !== kind),
    }));
  }

  function updateEventLimit(kind: number, limit: number) {
    update((config) => ({
      ...config,
      eventConfigs: config.eventConfigs.map((ec) =>
        ec.kind === kind ? { ...ec, limit } : ec,
      ),
    }));
  }

  function updateNestedLevels(levels: number) {
    update((config) => ({
      ...config,
      eventConfigs: config.eventConfigs.map((ec) =>
        ec.kind === 30040 ? { ...ec, nestedLevels: levels } : ec,
      ),
    }));
  }

  function updateFollowDepth(depth: number) {
    update((config) => ({
      ...config,
      eventConfigs: config.eventConfigs.map((ec) =>
        ec.kind === 3 ? { ...ec, depth: depth } : ec,
      ),
    }));
  }

  function toggleShowAllContent(kind: number) {
    update((config) => ({
      ...config,
      eventConfigs: config.eventConfigs.map((ec) =>
        ec.kind === kind ? { ...ec, showAll: !ec.showAll } : ec,
      ),
    }));
  }

  function getEventConfig(kind: number) {
    let config: EventKindConfig | undefined;
    subscribe((c) => {
      config = c.eventConfigs.find((ec) => ec.kind === kind);
    })();
    return config;
  }

  function toggleSearchThroughFetched() {
    update((config) => ({
      ...config,
      searchThroughFetched: !config.searchThroughFetched,
    }));
  }

  function toggleKind(kind: number) {
    update((config) => ({
      ...config,
      eventConfigs: config.eventConfigs.map((ec) =>
        ec.kind === kind ? { ...ec, enabled: !ec.enabled } : ec,
      ),
    }));
  }

  return {
    subscribe,
    update,
    reset,
    addEventKind,
    removeEventKind,
    updateEventLimit,
    updateNestedLevels,
    updateFollowDepth,
    toggleShowAllContent,
    getEventConfig,
    toggleSearchThroughFetched,
    toggleKind,
  };
}

export const visualizationConfig = createVisualizationConfig();

// Helper to get all enabled event kinds
export const enabledEventKinds = derived(visualizationConfig, ($config) =>
  $config.eventConfigs
    .filter((ec) => ec.enabled !== false)
    .map((ec) => ec.kind),
);

/**
 * Returns true if the given event kind is enabled in the config.
 * @param config - The VisualizationConfig object.
 * @param kind - The event kind number to check.
 */
export function isKindEnabledFn(config: VisualizationConfig, kind: number): boolean {
  const eventConfig = config.eventConfigs.find((ec) => ec.kind === kind);
  // If not found, return false. Otherwise, return true unless explicitly disabled.
  return !!eventConfig && eventConfig.enabled !== false;
}

// Derived store: returns a function that checks if a kind is enabled in the current config.
export const isKindEnabledStore = derived(
  visualizationConfig,
  ($config) => (kind: number) => isKindEnabledFn($config, kind)
);
