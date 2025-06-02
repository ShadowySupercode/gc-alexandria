import type { NostrEvent, NostrFilter, NostrRelaySet } from '$lib/types/nostr';
import { getNostrClient } from '$lib/nostr/client';
import { communityRelays, fallbackRelays } from '$lib/consts';
import { selectRelayGroup, createRelaySet } from './relayGroupUtils';
import type { EventSearchResult } from './types';
import { withTimeout } from './commonUtils';

interface RelaySearchResult {
  event: NostrEvent | null;
  relay: string;
  latency: number;
  group: string;
}

// Get relays from event (prefer event.relay or event.relays, fallback to communityRelays)
export function getEventRelays(event: NostrEvent): string[] {
  const eventWithRelays = event as NostrEvent & {
    relay?: string;
    relays?: string[];
  };

  if (eventWithRelays.relay) {
    return [eventWithRelays.relay];
  }
  if (eventWithRelays.relays?.length) {
    return eventWithRelays.relays;
  }
  return communityRelays;
}

/**
 * Fetches an event from a specific relay with timeout
 */
export async function fetchEventFromRelay(
  relay: string,
  filter: NostrFilter,
  timeout = 5000
): Promise<EventSearchResult> {
  const client = getNostrClient();
  const relaySet = client.getRelaySet([relay]);
  const relayInstance = relaySet.getRelay(relay);
  
  if (!relayInstance) {
    return { event: null };
  }

  try {
    const event = await withTimeout(
      new Promise<NostrEvent | null>((resolve) => {
        const subscriptionId = relayInstance.subscribe(filter, (event) => {
          relayInstance.unsubscribe(subscriptionId);
          resolve(event);
        });

        // Set a timeout to close the subscription
        setTimeout(() => {
          relayInstance.unsubscribe(subscriptionId);
          resolve(null);
        }, timeout);
      }),
      timeout
    );

    return { event };
  } catch (error) {
    console.error(`Error fetching from relay ${relay}:`, error);
    return { event: null };
  }
}

/**
 * Fetches an event from multiple relays in parallel
 */
export async function fetchEventFromRelays(
  filter: NostrFilter,
  relays: string[] = [],
  timeout = 5000
): Promise<RelaySearchResult[]> {
  const relayUrls = relays && relays.length > 0 ? relays : selectRelayGroup('inbox');
  const results = await Promise.all(
    relayUrls.map(async (relay) => {
      const startTime = performance.now();
      const { event } = await fetchEventFromRelay(relay, filter, timeout);
      const latency = performance.now() - startTime;

      return {
        event,
        relay,
        latency,
        group: 'inbox'
      };
    })
  );

  return results.filter((result): result is RelaySearchResult => result.event !== null);
}

/**
 * Publishes an event to multiple relays with timeout and retry logic
 */
export async function publishToRelays(
  event: NostrEvent,
  relays: string[] = [],
  maxRetries = 3,
  timeout = 5000
): Promise<string[]> {
  const client = getNostrClient();
  const relayUrls = relays && relays.length > 0 ? relays : selectRelayGroup('outbox');
  const relaySet = client.getRelaySet(relayUrls);
  const successfulRelays: string[] = [];

  // Try publishing with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Start publishing with timeout
      const publishPromise = Promise.all(
        relayUrls.map(async (relayUrl) => {
          const relay = relaySet.getRelay(relayUrl);
          if (!relay) return;

          try {
            await withTimeout(relay.publish(event), timeout);
            successfulRelays.push(relayUrl);
          } catch (error) {
            console.error(`Error publishing to relay ${relayUrl}:`, error);
          }
        })
      );

      await withTimeout(publishPromise, timeout);

      if (successfulRelays.length > 0) {
        break; // Exit retry loop if we have successful publishes
      }

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    } catch (error) {
      if (attempt === maxRetries && successfulRelays.length === 0) {
        throw new Error('Failed to publish to any relays after multiple attempts');
      }
    }
  }

  return successfulRelays;
}

/**
 * Publishes a Nostr event to relays
 * @param event The event to publish
 * @param relays Optional array of relay URLs to publish to. If not provided, uses the outbox relay group.
 * @param options Optional publishing options
 * @returns Array of relay URLs that successfully published the event
 */
export async function publishEvent(
  event: NostrEvent,
  relays?: string[],
  options: {
    maxRetries?: number;
    timeout?: number;
  } = {}
): Promise<string[]> {
  const { maxRetries = 3, timeout = 5000 } = options;
  return publishToRelays(event, relays, maxRetries, timeout);
}

/**
 * Fetches an event with a fallback strategy:
 * 1. First tries the specified relays
 * 2. If not found, falls back to fallback relays
 * 3. Returns the first successful result or null if not found
 */
export async function fetchEventWithFallback(
  filter: NostrFilter,
  options: {
    relays?: string[];
    useFallbackRelays?: boolean;
    timeout?: number;
  } = {}
): Promise<EventSearchResult> {
  const { 
    relays = [], 
    useFallbackRelays = true,
    timeout = 5000 
  } = options;

  // Try primary relays first
  const primaryResults = await fetchEventFromRelays(filter, relays, timeout);
  if (primaryResults.length > 0) {
    // Return the fastest result
    const fastestResult = primaryResults.reduce((fastest, current) => 
      current.latency < fastest.latency ? current : fastest
    );
    return { 
      event: fastestResult.event,
      relayInfo: {
        url: fastestResult.relay,
        latency: fastestResult.latency,
        group: fastestResult.group
      }
    };
  }

  // If not found and fallback is enabled, try fallback relays
  if (useFallbackRelays) {
    const fallbackResults = await fetchEventFromRelays(filter, fallbackRelays, timeout);
    if (fallbackResults.length > 0) {
      const fastestResult = fallbackResults.reduce((fastest, current) => 
        current.latency < fastest.latency ? current : fastest
      );
      return { 
        event: fastestResult.event,
        relayInfo: {
          url: fastestResult.relay,
          latency: fastestResult.latency,
          group: 'fallback'
        }
      };
    }
  }

  // Not found in any relay
  return { event: null };
}
