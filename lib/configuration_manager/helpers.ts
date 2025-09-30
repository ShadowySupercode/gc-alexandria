/**
 * Internal helper functions for configuration management
 */

import { parseArgs } from "@std/cli/parse-args";
import { parse as parseYaml } from "@std/yaml";
import { exists } from "@std/fs";
import { extname, resolve } from "@std/path";
import {
  assertExists,
  assertInstanceOf,
  assertStringIncludes,
} from "@std/assert";

import { ConfigurationError } from "./errors.ts";
import { Disposable } from "./disposables.ts";
import type {
  RelayConfigKey,
  RelayConfiguration,
  RelayConfigValue,
  RootConfig,
} from "./types.ts";

/**
 * Parses command line arguments to extract the configuration file path.
 * @returns The path to the root configuration file.
 * @throws ConfigurationError if `--alex-cfg-path` is not provided or invalid.
 */
export function getConfigPathFromArgs(): string {
  // Precondition: Must be in a Deno runtime environment.
  assertExists(Deno.args);

  const args = parseArgs(Deno.args, {
    string: ["alex-cfg-path"],
  });

  const configPath = args["alex-cfg-path"];

  if (!configPath) {
    throw new ConfigurationError(
      "Missing required argument: --alex-cfg-path",
    );
  }

  if (typeof configPath !== "string") {
    throw new ConfigurationError(
      "Invalid --alex-cfg-path argument: must be a string",
    );
  }

  if (extname(configPath) !== ".yaml") {
    throw new ConfigurationError(
      `Invalid configuration file extension: ${
        extname(configPath)
      }. Must be .yaml`,
    );
  }

  // Postconditions: If we make it here, `configPath` exists, is a string type, and denotes a path
  // to a YAML file.
  assertExists(configPath);
  assertInstanceOf(configPath, String);
  assertStringIncludes(configPath, "yaml");

  return configPath;
}

/**
 * Reads a file and returns its content as string
 * @param filePath Path to the file
 * @returns File content as string
 * @throws ConfigurationError if file can't be read
 */
export async function readConfigFile(filePath: string): Promise<string> {
  // Precondition: The required Deno APIs are available.
  assertExists(Deno.readTextFile);

  if (!await exists(filePath)) {
    throw new ConfigurationError(`Configuration file not found: ${filePath}`);
  }

  return await Deno.readTextFile(filePath);
}

/**
 * Attempts to parse YAML content into the shape defined by the provided type.
 * @param content YAML string to parse.
 * @param expectedType Description of expected structure for error messages
 * @returns Parsed object
 * @throws ConfigurationError if parsing fails
 */
export function parseYamlContent<T>(content: string): T {
  try {
    const parsed = parseYaml(content);
    if (parsed === null || parsed === undefined) {
      throw new ConfigurationError(
        `Empty or invalid configuration`,
      );
    }

    // Postconditions: If we make it this far, `parsed` exists and is an object.
    assertExists(parsed);
    assertInstanceOf(parsed, Object);

    return parsed as T;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to parse YAML configuration`,
      error as Error,
    );
  }
}

/**
 * Loads and parses the root configuration file.
 * @returns Parsed root configuration as a disposable resource.
 */
export async function loadRootConfig(): Promise<Disposable<RootConfig>> {
  // `DisposableStack` is used here for security. Memory is synchronously zeroed out when it goes
  // out of scope to help prevent leaks.
  using disposer = new DisposableStack();

  const configPath = disposer.adopt(
    getConfigPathFromArgs(),
    (val) => val.replaceAll(/[\s\S]*/, "0"),
  );
  const resolvedPath = disposer.adopt(
    resolve(configPath),
    (val) => val.replaceAll(/[\s\S]*/, "0"),
  );
  const content = disposer.adopt(
    await readConfigFile(resolvedPath),
    (val) => val.replaceAll(/[\s\S]*/, "0"),
  );

  return Disposable.from(parseYamlContent<RootConfig>(content));
}

/**
 * Loads and parses the relay configuration file.
 * @param relayConfigPath Path to the relay configuration file.
 * @returns Parsed relay configuration as a disposable resource.
 */
export async function loadRelayConfig(
  relayConfigPath: string,
): Promise<Disposable<RelayConfiguration>> {
  // `DisposableStack` is used here for security. Memory is synchronously zeroed out when it goes
  // out of scope to help prevent leaks.
  using disposer = new DisposableStack();

  const resolvedPath = disposer.adopt(
    resolve(relayConfigPath),
    (val) => val.replaceAll(/[\s\S]*/, "0"),
  );
  const content = disposer.adopt(
    await readConfigFile(resolvedPath),
    (val) => val.replaceAll(/[\s\S]*/, "0"),
  );

  return Disposable.from(parseYamlContent<RelayConfiguration>(content));
}

/**
 * Extracts the requested configuration value from relay configuration
 * @param config Relay configuration object
 * @param key Configuration key to extract
 * @returns The requested configuration value
 * @throws ConfigurationError if key is unknown
 */
export function extractRelayConfigValue(
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
      throw new ConfigurationError(`Unknown relay configuration key: ${key}`);
  }
}
