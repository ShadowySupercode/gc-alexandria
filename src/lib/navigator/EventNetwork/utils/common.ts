/**
 * Common utilities shared across network builders
 */

/**
 * Seeded random number generator for deterministic layouts
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat(min, max + 1));
  }
}

/**
 * Creates a debug function with a prefix
 * @param prefix - The prefix to add to all debug messages
 * @returns A debug function that can be toggled on/off
 */
export function createDebugFunction(prefix: string) {
  const DEBUG = false;
  return function debug(...args: any[]) {
    if (DEBUG) {
      console.log(`[${prefix}]`, ...args);
    }
  };
}