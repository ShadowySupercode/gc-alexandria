/**
 * Configuration service for reading and managing JSON configuration files.
 *
 * This service is intended to run server-side only.
 *
 * Note that this service uses Deno-specific APIs. To run Alexandria with Node.js, provide an
 * alternative implementation that uses Node APIs.
 */

export { getRelayConfig };

type RelayConfigKey =
  | "serverAllowList"
  | "trustLevels"
  | "vendorScores";

type RelayConfigValue = string[] | Record<string, number>;

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

function getConfigPath(): string {
  const configPath = Deno.env.get("RELAY_CONFIGURATION");
  if (!configPath) {
    throw new Error("RELAY_CONFIGURATION environment variable is not set");
  }
  return configPath;
}

async function readConfigFile(filePath: string): Promise<string> {
  try {
    return await Deno.readTextFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read configuration file at ${filePath}: ${message}`,
    );
  }
}

function parseConfig(content: string): RelayConfiguration {
  try {
    return JSON.parse(content) as RelayConfiguration;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse configuration JSON: ${message}`);
  }
}

async function loadConfig(): Promise<RelayConfiguration> {
  const configPath = getConfigPath();
  const content = await readConfigFile(configPath);
  return parseConfig(content);
}

function extractConfigValue(
  config: RelayConfiguration,
  key: RelayConfigKey,
): RelayConfigValue {
  switch (key) {
    case "serverAllowList":
      return config.server.allowList;
    case "trustLevels":
      return config.weights.trustLevel;
    case "vendorScores":
      return config.weights.vendorScore;
    default:
      throw new Error(`Unknown configuration key: ${key}`);
  }
}

/**
 * Retrieves the value of a configuration key from the relay configuration.
 *
 * This function is asynchronous to ensure it does not block while waiting for file retrieval.
 *
 * @param key The configuration key to retrieve. Must be one of the strings defined in
 * `RelayConfigKey`.
 *
 * @returns A promise that resolves to the retrieved configuration value.
 */
async function getRelayConfig(key: RelayConfigKey): Promise<RelayConfigValue> {
  const config = await loadConfig();
  return extractConfigValue(config, key);
}
