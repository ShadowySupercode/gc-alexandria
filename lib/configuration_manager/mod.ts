/**
 * Configuration Manager Library for Alexandria
 *
 * A stateless library that manages application configuration based on YAML files.
 * It uses Deno APIs and Deno standard library utilities. For Node.js, use a different library.
 *
 * Public API for the configuration manager library.
 */

import { ConfigurationError } from "./errors.ts";
import {
  extractRelayConfigValue,
  loadRelayConfig,
  loadRootConfig,
} from "./helpers.ts";
import type { RelayConfigKey, RelayConfigValue } from "./types.ts";

// Re-export public types and errors
export { ConfigurationError } from "./errors.ts";
export type { RelayConfigKey, RelayConfigValue } from "./types.ts";
export type { Disposable } from "./disposables.ts";

/**
 * Retrieves relay configuration values by key.
 *
 * This function reads configuration from YAML files without maintaining state.
 * The configuration files are considered the source of truth.
 *
 * @param key The configuration key to retrieve
 * @returns Promise resolving to the requested configuration value
 * @throws ConfigurationError if configuration loading or parsing fails
 */
export async function getRelayConfig(
  key: RelayConfigKey,
): Promise<RelayConfigValue> {
  try {
    const rootConfig = await loadRootConfig();
    const relayConfig = await loadRelayConfig(rootConfig.value.config.relays);
    return extractRelayConfigValue(relayConfig.value, key);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to retrieve relay configuration for key: ${key}`,
      error as Error,
    );
  }
}
