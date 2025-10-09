/**
 * Remote query functions for accessing relay configuration.
 *
 * These functions run on the server but can be called from anywhere in the app. Thus,
 * configuration files never leave the server, though specific values may be provided to clients
 * via calls to remote functions.
 *
 * The results of remote functions are cached client-side by SvelteKit. Call the `.refresh()`
 * method on a remote function to get updated values.
 *
 * CODE IN THIS FILE IS SECURITY-CRITICAL. Carefully audit all changes to ensure that sensitive
 * data is not leaked to the client.
 */
import { query } from "$app/server";
import { parse } from "@std/yaml";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface ServerConfig {
  allowList: string[];
}

interface WeightsConfig {
  trustLevel: Record<string, number>;
  vendorScore: Record<string, number>;
}

interface RelayConfiguration {
  server: ServerConfig;
  weights: WeightsConfig;
}

interface RootConfig {
  config: {
    relays: string;
  };
}

/**
 * Loads the relay configuration from YAML files.
 * Results are cached in memory to avoid repeated filesystem reads.
 */
export const getRelayConfig = query(async (): Promise<RelayConfiguration> => {
  // Load root config to get the path to relay config
  const rootConfigPath = resolve("cfg/alex_config.yaml");
  const rootConfigContent = await readFile(rootConfigPath, "utf-8");
  const rootConfig = parse(rootConfigContent) as RootConfig;

  // Load relay config
  const relayConfigPath = resolve(rootConfig.config.relays);
  const relayConfigContent = await readFile(relayConfigPath, "utf-8");
  return parse(relayConfigContent) as RelayConfiguration;
});

/**
 * Gets the server-side relay allowlist.
 * This is the list of relays that the server is permitted to connect to.
 */
export const getServerAllowList = query(async (): Promise<string[]> => {
  const config = await getRelayConfig();
  return config.server.allowList;
});

/**
 * Gets trust level scores for all configured relays.
 * Returns a map of relay URL to trust level.
 */
export const getTrustLevels = query(
  async (): Promise<Record<string, number>> => {
    const config = await getRelayConfig();
    return config.weights.trustLevel;
  },
);

/**
 * Gets vendor scores for all configured relays.
 * Returns a map of relay URL to vendor score.
 */
export const getVendorScores = query(
  async (): Promise<Record<string, number>> => {
    const config = await getRelayConfig();
    return config.weights.vendorScore;
  },
);
