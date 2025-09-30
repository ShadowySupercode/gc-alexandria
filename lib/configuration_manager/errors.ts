/**
 * Error types for the configuration manager library.
 */

/**
 * Error thrown when configuration-related operations fail
 */
export class ConfigurationError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ConfigurationError";
    if (cause) {
      this.cause = cause;
    }
  }
}
