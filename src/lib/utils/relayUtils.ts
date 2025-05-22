import type { NDKEvent } from '$lib/utils/nostrUtils';
import { get } from 'svelte/store';
import { ndkInstance } from "$lib/ndk";
import { standardRelays } from "$lib/consts";

// Get relays from event (prefer event.relay or event.relays, fallback to standardRelays)
export function getEventRelays(event: NDKEvent): string[] {
  if (event && (event as any).relay) {
    const relay = (event as any).relay;
    return [typeof relay === 'string' ? relay : relay.url];
  }
  if (event && (event as any).relays && (event as any).relays.length) {
    return (event as any).relays.map((r: any) => typeof r === 'string' ? r : r.url);
  }
  return standardRelays;
}

export function getConnectedRelays(): string[] {
  const ndk = get(ndkInstance);
  return Array.from(ndk?.pool?.relays.values() || [])
    .filter(r => r.status === 1) // Only use connected relays
    .map(r => r.url);
} 