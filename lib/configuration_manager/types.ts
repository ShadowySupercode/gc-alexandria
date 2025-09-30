/**
 * Type definitions for configuration structures
 */

export type RelayConfigKey = "serverAllowList" | "trustLevels" | "vendorScores";
export type RelayConfigValue = string[] | Record<string, number>;

export interface ServerConfig {
  allowList: string[];
}

export interface WeightsConfig {
  trustLevel: Record<string, number>;
  vendorScore: Record<string, number>;
}

export interface RelayConfiguration {
  server: ServerConfig;
  weights: WeightsConfig;
}

export interface RootConfig {
  config: {
    relays: string;
  };
}
