<script lang="ts">
  // UI and Svelte imports
  import { Modal, Button, Heading } from "flowbite-svelte";
  import { get } from 'svelte/store';

  // State and relay group management
  import { useFallbackRelays, setUseFallbackRelays, setRelayGroupArray, relayGroup } from "$lib/stores/relayGroup";
  import type { RelayGroupOption } from "$lib/stores/relayGroup";
  import { userInboxRelays, userOutboxRelays, responsiveLocalRelays, updateResponsiveLocalRelays, blockRelay, unblockRelay, blockedRelays, fetchBlockedRelays, filterBlockedRelays } from '$lib/stores/relayStore';
  import { getNostrClient } from '$lib/nostr/nostr_client_singleton';
  import { fallbackRelays, communityRelays } from "$lib/consts";
  import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';

  // Theme store
  import { writable } from 'svelte/store';

  // Modal props
  const props = $props<{
    show?: boolean;
    onClose?: () => void;
  }>();

  let includeLocalRelays = $state(
    localStorage.getItem('includeLocalRelays') === 'true'
  );
  let localRelaysResponsive = $state(true);

  // Get the Nostr client
  const client = getNostrClient(get(selectedRelayGroup).inbox);

  // Track login state
  let isLoggedIn = $state(false);
  $effect(() => {
    isLoggedIn = !!client.getActiveUser();
  });

  // Add derived state for current relay configuration
  let currentRelayConfig = $derived({
    groupSelection: $relayGroup[0],
    includeLocal: includeLocalRelays && localRelaysResponsive,
    useFallback: $useFallbackRelays,
    effectiveRelays: (() => {
      const groups: RelayGroupOption[] = [];
      let allInboxRelays: string[] = [];
      let allOutboxRelays: string[] = [];

      // Community relays
      if ($relayGroup[0] === 'community' || $relayGroup[0] === 'both') {
        groups.push('community');
        allInboxRelays = allInboxRelays.concat(filterBlockedRelays(communityRelays));
        allOutboxRelays = allOutboxRelays.concat(filterBlockedRelays(communityRelays));
      }

      // User relays
      if ($relayGroup[0] === 'user' || $relayGroup[0] === 'both') {
        groups.push('user');
        allInboxRelays = allInboxRelays.concat(
          filterBlockedRelays($userInboxRelays.filter(r => typeof r === 'string' && r.startsWith('ws')))
        );
        allOutboxRelays = allOutboxRelays.concat(
          filterBlockedRelays($userOutboxRelays.filter(r => typeof r === 'string' && r.startsWith('ws')))
        );
      }

      // Local relays
      if (includeLocalRelays && $responsiveLocalRelays.length > 0) {
        // Always include all responsive local relays
        allInboxRelays = allInboxRelays.concat($responsiveLocalRelays);
        allOutboxRelays = allOutboxRelays.concat($responsiveLocalRelays);
      }

      // Fallback relays
      if ($useFallbackRelays && fallbackRelays.length > 0) {
        allInboxRelays = allInboxRelays.concat(filterBlockedRelays(fallbackRelays));
        allOutboxRelays = allOutboxRelays.concat(filterBlockedRelays(fallbackRelays));
      }

      // Local only
      if ($relayGroup[0] === 'localOnly') {
        const normalized = Array.from(
          new Set($responsiveLocalRelays.map(normalizeRelayUrl))
        );
        return {
          groups: [],
          localRelays: normalized,
          fallbackRelays: [],
          inboxRelays: normalized,
          outboxRelays: normalized
        };
      }

      // Normalize and deduplicate across all sources
      allInboxRelays = Array.from(
        new Set(allInboxRelays.map(normalizeRelayUrl))
      );
      allOutboxRelays = Array.from(
        new Set(allOutboxRelays.map(normalizeRelayUrl))
      );

      // At the very end, filter out blocked relays
      allInboxRelays = filterBlockedRelays(allInboxRelays);
      allOutboxRelays = filterBlockedRelays(allOutboxRelays);

      return {
        groups,
        localRelays: includeLocalRelays
          ? Array.from(new Set($responsiveLocalRelays.map(normalizeRelayUrl)))
          : [],
        fallbackRelays: $useFallbackRelays
          ? Array.from(new Set(fallbackRelays.map(normalizeRelayUrl)))
          : [],
        inboxRelays: allInboxRelays,
        outboxRelays: allOutboxRelays
      };
    })()
  });

  // Theme store
  const theme = writable(localStorage.getItem('theme') || 'light');
  theme.subscribe(value => {
    localStorage.setItem('theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  });

  // Ensure local relays are disabled when local-only is selected
  $effect(() => {
    if ($relayGroup[0] === 'localOnly') {
      includeLocalRelays = false;
      setUseFallbackRelays(false);
    }
  });

  /**
   * Pings all local relays to check if they are responsive.
   * Updates the responsiveLocalRelays store with only the responsive relays.
   */
  import { localRelays } from '$lib/consts';
  async function checkLocalRelays() {
    if (localRelays.length === 0) {
      localRelaysResponsive = false;
      updateResponsiveLocalRelays([]);
      return;
    }

    const pingPromises = localRelays.map(async (relayUrl) => {
      try {
        const ws = new WebSocket(relayUrl);
        return new Promise<{ url: string; responsive: boolean }>((resolve) => {
          const timeout = setTimeout(() => {
            ws.close();
            resolve({ url: relayUrl, responsive: false });
          }, 2000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve({ url: relayUrl, responsive: true });
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve({ url: relayUrl, responsive: false });
          };
        });
      } catch (err) {
        // Only log, don't throw
        console.info(`Could not connect to relay ${relayUrl}:`, err);
        return { url: relayUrl, responsive: false };
      }
    });

    const results = await Promise.all(pingPromises);
    const responsiveRelays = results
      .filter(result => result.responsive)
      .map(result => result.url);
    
    localRelaysResponsive = responsiveRelays.length > 0;
    updateResponsiveLocalRelays(responsiveRelays);
  }

  $effect(() => {
    if (props.show) {
      checkLocalRelays();
    }
  });

  $effect(() => {
    // Persist relay group and local relays selection
    localStorage.setItem('relayGroupSelection', $relayGroup[0]);
    localStorage.setItem('includeLocalRelays', includeLocalRelays.toString());
  });

  $effect(() => {
    // Persist fallback relays selection (already handled in store, but ensure on mount)
    localStorage.setItem('useFallbackRelays', $useFallbackRelays.toString());
  });

  /**
   * Normalize a relay URL for deduplication and display.
   * - Removes trailing slashes.
   * - Converts to lowercase.
   */
  function normalizeRelayUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }

  import { logCurrentRelays } from '$lib/utils/relayLog';

  // Add blocked relays state
  let newBlockedRelay = $state('');
  let blockingError = $state<string | null>(null);
  let isBlocking = $state(false);

  // Add function to handle blocking/unblocking relays
  async function handleBlockRelay() {
    if (!newBlockedRelay.trim() || !newBlockedRelay.startsWith('ws')) {
      return;
    }

    isBlocking = true;
    blockingError = null;

    try {
      await blockRelay(newBlockedRelay.trim());
      newBlockedRelay = '';
    } catch (err) {
      console.error('Error blocking relay:', err);
      blockingError = err instanceof Error ? err.message : 'Failed to block relay';
    } finally {
      isBlocking = false;
    }
  }

  async function handleUnblockRelay(relay: string) {
    isBlocking = true;
    blockingError = null;

    try {
      await unblockRelay(relay);
    } catch (err) {
      console.error('Error unblocking relay:', err);
      blockingError = err instanceof Error ? err.message : 'Failed to unblock relay';
    } finally {
      isBlocking = false;
    }
  }

  // Fetch blocked relays when user logs in
  $effect(() => {
    if (isLoggedIn && props.show) {
      const user = client.getActiveUser();
      if (user) {
        fetchBlockedRelays(user.pubkey).catch(error => {
          const err = error as Error;
          console.error('Error fetching blocked relays:', err);
          blockingError = 'Failed to fetch blocked relays';
        });
      }
    }
  });

  import { userHydrated } from '$lib/stores/userStore';
  import { blockedRelaysHydrated } from '$lib/stores/relayStore';
  let ready = $derived(() => $userHydrated && $blockedRelaysHydrated);
</script>

{#if !ready}
  <div class="flex justify-center items-center h-40">
    <span class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 dark:border-gray-100"></span>
  </div>
{:else}
  <Modal
    class="modal-leather min-h-[28rem]"
    title="Settings"
    open={props.show}
    onclose={props.onClose}
    outsideclose
    size="md"
  >
    <div class="flex justify-center">
      <main class="main-leather max-w-2xl w-full flex flex-col space-y-6 px-4 py-6 rounded-lg">
        
        <!-- Theme Section -->
        <section class="space-y-4">
          <Heading tag="h2" class="h-leather text-2xl font-bold mb-2">Theme Selection</Heading>
          <div class="ml-4">
            <div class="flex flex-row space-x-8 items-center">
              <label class="flex items-center space-x-2">
                <input type="radio" name="theme" value="light" checked={$theme === 'light'} onchange={() => theme.set('light')} class="accent-amber-700 dark:accent-amber-400" />
                <span>Light Mode</span>
              </label>
              <label class="flex items-center space-x-2">
                <input type="radio" name="theme" value="dark" checked={$theme === 'dark'} onchange={() => theme.set('dark')} class="accent-amber-700 dark:accent-amber-400" />
                <span>Dark Mode</span>
              </label>
            </div>
          </div>
        </section>
        <!-- Relay Section -->
        <section class="space-y-4">
          <Heading tag="h2" class="h-leather text-2xl font-bold mb-2">Relay Configuration</Heading>
          <div class="ml-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <!-- Community Relays (unfiltered) -->
              <div class="text-sm font-semibold mb-1">Community Relays:</div>
              {#if communityRelays.length === 0}
                <div class="text-sm text-gray-500">(No community relays configured)</div>
              {:else}
                {#each communityRelays as relay}
                  <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
              <!-- Inbox Relays (unfiltered) -->
              <div class="mt-2 text-sm font-semibold mb-1">Inbox Relays:</div>
              {#if $userInboxRelays.length === 0}
                <div class="text-sm text-gray-500">(No inbox relays configured)</div>
              {:else}
                {#each $userInboxRelays as relay}
                  <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
              <!-- Outbox Relays (unfiltered) -->
              <div class="mt-2 text-sm font-semibold mb-1">Outbox Relays:</div>
              {#if $userOutboxRelays.length === 0}
                <div class="text-sm text-gray-500">(No outbox relays configured)</div>
              {:else}
                {#each $userOutboxRelays as relay}
                  <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
            </div>
            <div>
              <!-- Local Relays (unfiltered) -->
              <div class="text-sm font-semibold mb-1">Local Relays:</div>
              {#if $responsiveLocalRelays.length === 0}
                <div class="text-sm text-gray-500">(No responsive local relays)</div>
              {:else}
                {#each $responsiveLocalRelays as relay}
                  <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
              <!-- Fallback Relays (unfiltered) -->
              <div class="mt-2 text-sm font-semibold mb-1">Fallback Relays:</div>
              {#if fallbackRelays.length === 0}
                <div class="text-sm text-gray-500">(No fallback relays configured)</div>
              {:else}
                {#each fallbackRelays as relay}
                  <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-x-8 items-start mt-6">
            <!-- Relay Group (left) -->
            <div class="flex flex-col space-y-2">
              <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">Relay Group</div>
              {#each [
                { value: 'community', label: "Community's Relays" },
                { value: 'user', label: 'Your Relays' },
                { value: 'both', label: 'Use both groups' },
                { value: 'localOnly', label: 'Only use local relays' }
              ] as opt}
                <label class="flex items-center space-x-2 relative">
                  <input
                    type="radio"
                    name="relayGroup"
                    value={opt.value}
                    checked={$relayGroup[0] === opt.value}
                    onchange={() => setRelayGroupArray([opt.value as RelayGroupOption])}
                    class="accent-amber-700 dark:accent-amber-400"
                  />
                  <span>{opt.label}</span>
                </label>
              {/each}
            </div>

            <!-- Relay Options (right) -->
            <div class="flex flex-col space-y-4">
              <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">Relay Options</div>
              <label class="flex items-center space-x-2 relative">
                <input
                  type="checkbox"
                  checked={includeLocalRelays}
                  onchange={(e) => {
                    const target = e.target as HTMLInputElement | null;
                    if (target && typeof target.checked === 'boolean') {
                      includeLocalRelays = target.checked;
                      // If user wants local relays and relay group is 'user', ensure store is updated
                      if (includeLocalRelays && $relayGroup[0] === 'user') {
                        setRelayGroupArray(['user']);
                      }
                      // If user disables local relays, just update the store with current relay group
                      if (!includeLocalRelays) {
                        setRelayGroupArray([$relayGroup[0]]);
                      }
                    }
                  }}
                  disabled={$relayGroup[0] === 'localOnly' || !localRelaysResponsive}
                  style="accent-color: #c6a885 !important"
                />
                <span class={!localRelaysResponsive ? 'text-gray-400' : ''}>
                  Include local relays
                  {!localRelaysResponsive ? ' (unavailable)' : ''}
                </span>
              </label>
              <label class="flex items-center space-x-2 relative">
                <input
                  type="checkbox"
                  checked={$useFallbackRelays}
                  onchange={(e) => {
                    const target = e.target as HTMLInputElement | null;
                    if (target && typeof target.checked === 'boolean') {
                      setUseFallbackRelays(target.checked);
                    }
                  }}
                  disabled={$relayGroup[0] === 'localOnly'}
                  class="accent-amber-700 dark:accent-amber-400"
                />
                <span>Include fallback relays</span>
              </label>
            </div>
          </div>
        </section>
        <!-- After the relay lists, show the effective relays in two columns -->
        <div class="mt-4">
          <div class="text-lg font-bold mb-1">Effective Relays</div>
          <div class="text-xs text-gray-500 mb-2">Relays the app will apply to your profile.</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <div class="text-sm font-semibold mb-1">Inboxes</div>
              {#if $selectedRelayGroup.inbox.length === 0}
                <div class="text-sm text-gray-500">(No effective inbox relays)</div>
              {:else}
                {#each $selectedRelayGroup.inbox as relay}
                  <div class="text-sm font-mono text-primary-700 dark:text-primary-300 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
            </div>
            <div>
              <div class="text-sm font-semibold mb-1">Outboxes</div>
              {#if $selectedRelayGroup.outbox.length === 0}
                <div class="text-sm text-gray-500">(No effective outbox relays)</div>
              {:else}
                {#each $selectedRelayGroup.outbox as relay}
                  <div class="text-sm font-mono text-primary-700 dark:text-primary-300 whitespace-nowrap">{relay}</div>
                {/each}
              {/if}
            </div>
          </div>
        </div>
        <!-- Add blocked relays section -->
        <div class="flex flex-col space-y-4 mt-4">
          <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">Blocked Relays</div>
          
          {#if blockingError}
            <div class="text-sm text-red-600 dark:text-red-400 mb-2">
              {blockingError}
            </div>
          {/if}
          
          <!-- Add new blocked relay -->
          <div class="flex space-x-2">
            <input
              type="text"
              bind:value={newBlockedRelay}
              placeholder="wss://relay.url"
              class="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={isBlocking}
            />
            <Button 
              on:click={handleBlockRelay} 
              disabled={!newBlockedRelay.trim() || !newBlockedRelay.startsWith('ws') || isBlocking}
            >
              {isBlocking ? 'Blocking...' : 'Block'}
            </Button>
          </div>

          <!-- List of blocked relays -->
          {#if $blockedRelays.length > 0}
            <div class="mt-2 space-y-2">
              {#each $blockedRelays as relay}
                <div class="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <span class="text-sm text-gray-700 dark:text-gray-300">{relay}</span>
                  <Button 
                    size="xs" 
                    color="red" 
                    on:click={() => handleUnblockRelay(relay)}
                    disabled={isBlocking}
                  >
                    {isBlocking ? 'Unblocking...' : 'Unblock'}
                  </Button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-sm text-gray-500 dark:text-gray-400 italic">
              No blocked relays
            </div>
          {/if}
        </div>
        <div class="mt-auto flex justify-end">
          <Button onclick={() => {
            logCurrentRelays('settings close');
            props.onClose();
          }}>Close</Button>
        </div>
      </main>
    </div>
  </Modal>
{/if} 