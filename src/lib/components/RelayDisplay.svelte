<script lang="ts" context="module">
  import type { NDKEvent } from '$lib/utils/nostrUtils';

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
</script>

<script lang="ts">
  import { get } from 'svelte/store';
  import { ndkInstance } from "$lib/ndk";
  import { standardRelays } from "$lib/consts";

  export let relay: string;
  export let showStatus = false;
  export let status: 'pending' | 'found' | 'notfound' | null = null;

  // Use a static fallback icon for all relays
  function relayFavicon(relay: string): string {
    return '/favicon.png';
  }
</script>

<div class="flex items-center gap-2 p-2 rounded border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
  <img
    src={relayFavicon(relay)}
    alt="relay icon"
    class="w-5 h-5 object-contain"
    onerror={(e) => { (e.target as HTMLImageElement).src = '/favicon.png'; }}
  />
  <span class="font-mono text-xs flex-1">{relay}</span>
  {#if showStatus && status}
    {#if status === 'pending'}
      <svg class="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
    {:else if status === 'found'}
      <span class="text-green-600">&#10003;</span>
    {:else}
      <span class="text-red-500">&#10007;</span>
    {/if}
  {/if}
</div> 