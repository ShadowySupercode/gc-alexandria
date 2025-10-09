/**
 * Configuration provider adapter for the `relay_selector` WASM library.
 *
 * This module implements the Rust library's configuration callback interface to provide
 * application-specific configuration values to the `relay_selector`.
 *
 * The WASM library will call these functions to retrieve configuration values, which are fetched
 * from the server using remote queries when running in the browser, or read directly from the
 * filesystem when running on the server.
 */
import {
  getServerAllowList,
  getTrustLevels,
  getVendorScores,
} from "../config/config.remote.ts";

/**
 * Configuration keys that the `relay_selector` library can request.
 */
export type ConfigKey = "serverAllowList" | "trustLevels" | "vendorScores";

/**
 * Configuration value types corresponding to each key.
 */
export type ConfigValue = string[] | Record<string, number>;

/**
 * Gets a configuration value by key.
 *
 * This function is intended to be provided to the `relay_selector` library as a callback.
 *
 * The function fetches data using SvelteKit remote functions, which run only on the server but can
 * run anywhere in the application.
 *
 * @param key - The configuration key to retrieve
 * @returns Promise resolving to the configuration value
 * @throws Error if the key is invalid or config cannot be loaded
 */
export async function getConfigValue(key: ConfigKey): Promise<ConfigValue> {
  switch (key) {
    case "serverAllowList":
      return await getServerAllowList();

    case "trustLevels":
      return await getTrustLevels();

    case "vendorScores":
      return await getVendorScores();

    default:
      throw new Error(`Unknown configuration key: ${key}`);
  }
}
