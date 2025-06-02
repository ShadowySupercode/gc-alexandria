<script lang="ts">
  // UI and Svelte imports
  import { Modal, Button, Heading } from "flowbite-svelte";

  // State and relay group management
  import { setRelayGroupArray, useFallbackRelays, setUseFallbackRelays } from "$lib/stores/relayGroup";
  import type { RelayGroupOption } from "$lib/stores/relayGroup";
  import { userInboxRelays, userOutboxRelays, responsiveLocalRelays, updateResponsiveLocalRelays } from '$lib/stores/relayStore';
  import { getNostrClient } from '$lib/nostr/client';
  import { fallbackRelays, communityRelays } from "$lib/consts";

  // Theme store
  import { writable } from 'svelte/store';

  // Modal props
  const props = $props<{
    show?: boolean;
    onClose?: () => void;
  }>();

  let relayGroupSelection = $state<'community' | 'user' | 'both' | 'localOnly'>(
    localStorage.getItem('relayGroupSelection') as any || 'community'
  );
  let includeLocalRelays = $state(
    localStorage.getItem('includeLocalRelays') === 'true'
  );
  let showTooltip = $state<number | string | null>(null);
  let localRelaysResponsive = $state(true);

  // Get the Nostr client
  const client = getNostrClient();

  // Track login state
  let isLoggedIn = $state(false);
  $effect(() => {
    isLoggedIn = !!client.getActiveUser();
  });

  // Add derived state for current relay configuration
  let currentRelayConfig = $derived({
    groupSelection: relayGroupSelection,
    includeLocal: includeLocalRelays && localRelaysResponsive,
    useFallback: $useFallbackRelays,
    effectiveRelays: (() => {
      const groups: RelayGroupOption[] = [];
      let allInboxRelays: string[] = [];
      let allOutboxRelays: string[] = [];

      // Community relays
      if (relayGroupSelection === 'community' || relayGroupSelection === 'both') {
        groups.push('community');
        allInboxRelays = allInboxRelays.concat(communityRelays);
        allOutboxRelays = allOutboxRelays.concat(communityRelays);
      }

      // User relays
      if (relayGroupSelection === 'user' || relayGroupSelection === 'both') {
        groups.push('user');
        allInboxRelays = allInboxRelays.concat(
          $userInboxRelays.filter(r => typeof r === 'string' && r.startsWith('ws'))
        );
        allOutboxRelays = allOutboxRelays.concat(
          $userOutboxRelays.filter(r => typeof r === 'string' && r.startsWith('ws'))
        );
      }

      // Local relays
      if (includeLocalRelays && $responsiveLocalRelays.length > 0) {
        allInboxRelays = allInboxRelays.concat($responsiveLocalRelays);
        allOutboxRelays = allOutboxRelays.concat($responsiveLocalRelays);
      }

      // Fallback relays
      if ($useFallbackRelays && fallbackRelays.length > 0) {
        allInboxRelays = allInboxRelays.concat(fallbackRelays);
        allOutboxRelays = allOutboxRelays.concat(fallbackRelays);
      }

      // Local only
      if (relayGroupSelection === 'localOnly') {
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

  // Update relay group array whenever configuration changes
  $effect(() => {
    const { groups, inboxRelays, outboxRelays } = currentRelayConfig.effectiveRelays;
    setRelayGroupArray(groups);
  });

  // Ensure local relays are disabled when local-only is selected
  $effect(() => {
    if (relayGroupSelection === 'localOnly') {
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
    localStorage.setItem('relayGroupSelection', relayGroupSelection);
    localStorage.setItem('includeLocalRelays', includeLocalRelays.toString());
  });

  $effect(() => {
    // Persist fallback relays selection (already handled in store, but ensure on mount)
    // This is a no-op if already handled by the store, but ensures consistencyimage.png
    localStorage.setItem('useFallbackRelays', $useFallbackRelays.toString());
  });

  // Import selectedRelayGroup from $lib/utils/relayGroupUtils
  import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';

  /**
   * Normalize a relay URL for deduplication and display.
   * - Removes trailing slashes.
   * - Converts to lowercase.
   */
  function normalizeRelayUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
</script>

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
            <div class="text-sm font-semibold mb-1">Community Relays:</div>
            {#if communityRelays.length === 0}
              <div class="text-sm text-gray-500">(No community relays configured)</div>
            {:else}
              {#each communityRelays as relay}
                <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
              {/each}
            {/if}
            <div class="mt-2 text-sm font-semibold mb-1">Inbox Relays:</div>
            {#if $userInboxRelays.length === 0}
              <div class="text-sm text-gray-500">(No inbox relays configured)</div>
            {:else}
              {#each $userInboxRelays as relay}
                <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
              {/each}
            {/if}
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
            <div class="text-sm font-semibold mb-1">Local Relays:</div>
            {#if $responsiveLocalRelays.length === 0}
              <div class="text-sm text-gray-500">(No responsive local relays)</div>
            {:else}
              {#each $responsiveLocalRelays as relay}
                <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
              {/each}
            {/if}
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
              { value: 'community', label: "Community's Relays", info: communityRelays, showIcon: true },
              { value: 'user', label: "Your Relays", info: $userInboxRelays.filter(r => typeof r === 'string' && r.startsWith('ws')), showIcon: true },
              { value: 'both', label: 'Use both groups', info: [], showIcon: false },
              { value: 'localOnly', label: 'Only use local relays', info: [], showIcon: false, disabled: !localRelaysResponsive }
            ].filter(opt =>
              isLoggedIn || opt.value === 'community' || opt.value === 'localOnly'
            ) as opt, i}
              <label class="flex items-center space-x-2 relative">
                <input
                  type="radio"
                  name="relayGroup"
                  value={opt.value}
                  checked={relayGroupSelection === opt.value}
                  onchange={(e) => {
                    const target = e.target as HTMLInputElement | null;
                    if (target && typeof target.value === 'string') {
                      relayGroupSelection = target.value as 'community' | 'user' | 'both' | 'localOnly';
                    }
                  }}
                  disabled={opt.disabled || (opt.value === 'user' || opt.value === 'both'
                    ? !isLoggedIn
                    : false)}
                  class="accent-amber-700 dark:accent-amber-400"
                />
                <span class={!localRelaysResponsive && opt.value === 'localOnly' ? 'text-gray-400' : ''}>
                  {opt.label}
                  {!localRelaysResponsive && opt.value === 'localOnly' ? ' (unavailable)' : ''}
                </span>
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
                  }
                }}
                disabled={relayGroupSelection === 'localOnly' || !localRelaysResponsive}
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
                disabled={relayGroupSelection === 'localOnly'}
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
        <div class="text-xs text-gray-500 mb-2">Relays the app will use, if you click "Apply".</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
          <div>
            <div class="text-sm font-semibold mb-1">Inboxes</div>
            {#if currentRelayConfig.effectiveRelays.inboxRelays.length === 0}
              <div class="text-sm text-gray-500">(No effective inbox relays)</div>
            {:else}
              {#each currentRelayConfig.effectiveRelays.inboxRelays as relay}
                <div class="text-sm font-mono text-primary-700 dark:text-primary-300 whitespace-nowrap">{relay}</div>
              {/each}
            {/if}
          </div>
          <div>
            <div class="text-sm font-semibold mb-1">Outboxes</div>
            {#if currentRelayConfig.effectiveRelays.outboxRelays.length === 0}
              <div class="text-sm text-gray-500">(No effective outbox relays)</div>
            {:else}
              {#each currentRelayConfig.effectiveRelays.outboxRelays as relay}
                <div class="text-sm font-mono text-primary-700 dark:text-primary-300 whitespace-nowrap">{relay}</div>
              {/each}
            {/if}
          </div>
        </div>
      </div>
      <div class="mt-auto flex justify-end">
        <Button onclick={() => {
          // Log final settings summary
          console.log('[Settings] Final relay configuration:', {
            groupSelection: currentRelayConfig.groupSelection,
            includeLocal: currentRelayConfig.includeLocal,
            useFallback: currentRelayConfig.useFallback,
            effectiveGroups: currentRelayConfig.effectiveRelays.groups,
            localRelays: currentRelayConfig.effectiveRelays.localRelays,
            fallbackRelays: currentRelayConfig.effectiveRelays.fallbackRelays,
            inboxRelays: currentRelayConfig.effectiveRelays.inboxRelays,
            outboxRelays: currentRelayConfig.effectiveRelays.outboxRelays
          });
          props.onClose();
        }}>Apply</Button>
      </div>
    </main>
  </div>
</Modal> 