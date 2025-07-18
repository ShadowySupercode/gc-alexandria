import { standardRelays, anonymousRelays, fallbackRelays } from "$lib/consts";
import NDK from "@nostr-dev-kit/ndk";
import { TIMEOUTS } from "./search_constants";

export interface RelayDiagnostic {
  url: string;
  connected: boolean;
  requiresAuth: boolean;
  error?: string;
  responseTime?: number;
}

/**
 * Tests connection to a single relay
 */
export async function testRelay(url: string): Promise<RelayDiagnostic> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve({
          url,
          connected: false,
          requiresAuth: false,
          error: "Connection timeout",
          responseTime: Date.now() - startTime,
        });
      }
    }, TIMEOUTS.RELAY_DIAGNOSTICS);

    ws.onopen = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        resolve({
          url,
          connected: true,
          requiresAuth: false,
          responseTime: Date.now() - startTime,
        });
      }
    };

    ws.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          url,
          connected: false,
          requiresAuth: false,
          error: "WebSocket error",
          responseTime: Date.now() - startTime,
        });
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data[0] === "NOTICE" && data[1]?.includes("auth-required")) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          resolve({
            url,
            connected: true,
            requiresAuth: true,
            responseTime: Date.now() - startTime,
          });
        }
      }
    };
  });
}

/**
 * Tests all relays and returns diagnostic information
 */
export async function testAllRelays(): Promise<RelayDiagnostic[]> {
  const allRelays = [
    ...new Set([...standardRelays, ...anonymousRelays, ...fallbackRelays]),
  ];

  console.log("[RelayDiagnostics] Testing", allRelays.length, "relays...");

  const results = await Promise.allSettled(
    allRelays.map((url) => testRelay(url)),
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        url: allRelays[index],
        connected: false,
        requiresAuth: false,
        error: "Test failed",
      };
    }
  });
}

/**
 * Gets working relays from diagnostic results
 */
export function getWorkingRelays(diagnostics: RelayDiagnostic[]): string[] {
  return diagnostics.filter((d) => d.connected).map((d) => d.url);
}

/**
 * Logs relay diagnostic results to console
 */
export function logRelayDiagnostics(diagnostics: RelayDiagnostic[]): void {
  console.group("[RelayDiagnostics] Results");

  const working = diagnostics.filter((d) => d.connected);
  const failed = diagnostics.filter((d) => !d.connected);

  console.log(`✅ Working relays (${working.length}):`);
  working.forEach((d) => {
    console.log(
      `  - ${d.url}${d.requiresAuth ? " (requires auth)" : ""}${d.responseTime ? ` (${d.responseTime}ms)` : ""}`,
    );
  });

  if (failed.length > 0) {
    console.log(`❌ Failed relays (${failed.length}):`);
    failed.forEach((d) => {
      console.log(`  - ${d.url}: ${d.error || "Unknown error"}`);
    });
  }

  console.groupEnd();
}
