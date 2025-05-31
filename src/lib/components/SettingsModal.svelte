<script lang="ts">
  // UI and Svelte imports
  import { Modal, Button, Label } from "flowbite-svelte";
  import { InfoCircleOutline } from 'flowbite-svelte-icons';

  // State and relay group management
  import { setRelayGroupArray, useFallbackRelays, setUseFallbackRelays } from "$lib/stores/relayGroup";
  import type { RelayGroupOption } from "$lib/stores/relayGroup";
  import { userRelays } from '$lib/stores/relayStore';
  import { get } from 'svelte/store';

  // NDK and relays
  import { ndkInstance, ndkSignedIn, getActiveUser, getUserPreferredRelays } from '$lib/ndk';
  import { fallbackRelays, localRelays, communityRelays } from "$lib/consts";

  // Theme store (move to its own file if needed)
  import { writable } from 'svelte/store';

  // Modal props
  const { show = false, onClose = () => {} } = $props<{
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

  // Theme store
  const theme = writable(localStorage.getItem('theme') || 'light');
  theme.subscribe(value => {
    localStorage.setItem('theme', value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  });

  $effect(() => {
    let relays: RelayGroupOption[] = [];
    let logMsg = '';

    if (relayGroupSelection === 'localOnly') {
      relays = [];
      logMsg = `Using only local relays: ${JSON.stringify(localRelays)}`;
    } else {
      if (relayGroupSelection === 'community') {
        relays = ['community'];
      } else if (relayGroupSelection === 'user') {
        relays = ['user'];
      } else if (relayGroupSelection === 'both') {
        relays = ['community', 'user'];
      }
      logMsg = `Relay group selection: ${relayGroupSelection}, Relays: ${JSON.stringify(relays)}`;
      if (includeLocalRelays && localRelays.length > 0) {
        logMsg += `, Including local relays: ${JSON.stringify(localRelays)}`;
      }
    }
    setRelayGroupArray(relays);
  });

  $effect(() => {
    if (relayGroupSelection === 'localOnly') {
      includeLocalRelays = false;
      setUseFallbackRelays(false);
    }
  });

  /**
   * Refreshes the user relays from the NDK instance and sets the userRelays store.
   * Called automatically when the modal is opened.
   */
  async function refreshUserRelays() {
    const ndk = get(ndkInstance);
    const user = getActiveUser();
    if (!ndk || !user) {
      console.warn('NDK or user not available');
      return;
    }
    const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
    // Merge inbox and outbox relays, deduplicate, and set the store
    const relayUrls = Array.from(
      new Set([
        ...Array.from(inboxes).map(r => r.url),
        ...Array.from(outboxes).map(r => r.url),
      ])
    );
    userRelays.set(relayUrls);
  }

  $effect(() => {
    if (show) {
      refreshUserRelays();
    }
  });

  $effect(() => {
    // Persist relay group and local relays selection
    localStorage.setItem('relayGroupSelection', relayGroupSelection);
    localStorage.setItem('includeLocalRelays', includeLocalRelays.toString());
  });

  $effect(() => {
    // Persist fallback relays selection (already handled in store, but ensure on mount)
    // This is a no-op if already handled by the store, but ensures consistency
    localStorage.setItem('useFallbackRelays', $useFallbackRelays.toString());
  });
</script>

<Modal
  class="modal-leather min-h-[28rem]"
  title="Settings"
  open={show}
  onclose={onClose}
  outsideclose
  size="md"
>
  <div class="flex flex-col h-full">
    <div class="space-y-6">
      <!-- Theme Selection Section -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Theme Selection</h3>
        <div class="flex flex-row space-x-8 items-center">
          <label class="flex items-center space-x-2">
            <input type="radio" name="theme" value="light" checked={$theme === 'light'} onchange={() => theme.set('light')} />
            <span>Light Mode</span>
          </label>
          <label class="flex items-center space-x-2">
            <input type="radio" name="theme" value="dark" checked={$theme === 'dark'} onchange={() => theme.set('dark')} />
            <span>Dark Mode</span>
          </label>
        </div>
      </div>
      <!-- Relay Configuration Section -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Relay Configuration</h3>
        <div class="grid grid-cols-2 gap-x-8 items-start">
          <!-- Relay Group (left) -->
          <div class="flex flex-col space-y-2">
            <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">Relay Group</div>
            {#each [
              { value: 'community', label: "Community's Relays", info: communityRelays, showIcon: true },
              { value: 'user', label: "Your Relays", info: $userRelays.filter(r => typeof r === 'string' && r.startsWith('ws')), showIcon: true },
              { value: 'both', label: 'Use both groups', info: [], showIcon: false },
              { value: 'localOnly', label: 'Only use local relays', info: [], showIcon: false }
            ].filter(opt =>
              $ndkSignedIn || opt.value === 'community' || opt.value === 'localOnly'
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
                  disabled={opt.value === 'user' || opt.value === 'both'
                    ? !$ndkSignedIn
                    : false}
                />
                <span>{opt.label}</span>
                {#if opt.showIcon}
                  <span class="relative">
                    <InfoCircleOutline
                      class="w-4 h-4 ml-1 cursor-help"
                      onmouseenter={() => showTooltip = i}
                      onmouseleave={() => showTooltip = null}
                    />
                    {#if showTooltip === i}
                      <div
                        class="absolute bottom-full left-full ml-2 mb-1 z-10 p-2 bg-gray-50 dark:bg-gray-800 rounded shadow max-h-64 overflow-y-auto min-w-80 w-max text-left"
                      >
                        {#if opt.info.length === 0}
                          <div class="text-sm text-gray-500">(No relays configured)</div>
                        {:else}
                          {#each opt.info as relay}
                            <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                          {/each}
                        {/if}
                      </div>
                    {/if}
                  </span>
                {/if}
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
                disabled={relayGroupSelection === 'localOnly'}
              />
              <span>Include local relays</span>
              <span class="relative">
                <InfoCircleOutline
                  class="w-4 h-4 ml-1 cursor-help"
                  onmouseenter={() => showTooltip = 'local'}
                  onmouseleave={() => showTooltip = null}
                />
                {#if showTooltip === 'local'}
                  <div
                    class="absolute bottom-full right-0 mb-1 z-10 p-2 bg-gray-50 dark:bg-gray-800 rounded shadow max-h-64 overflow-y-auto min-w-80 w-max"
                  >
                    {#each localRelays as relay}
                      <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                    {/each}
                  </div>
                {/if}
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
              />
              <span>Include fallback relays</span>
              <span class="relative">
                <InfoCircleOutline
                  class="w-4 h-4 ml-1 cursor-help"
                  onmouseenter={() => showTooltip = 'fallback'}
                  onmouseleave={() => showTooltip = null}
                />
                {#if showTooltip === 'fallback'}
                  <div
                    class="absolute bottom-full right-0 mb-1 z-10 p-2 bg-gray-50 dark:bg-gray-800 rounded shadow max-h-64 overflow-y-auto min-w-80 w-max"
                  >
                    {#each fallbackRelays as relay}
                      <div class="text-sm font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">{relay}</div>
                    {/each}
                  </div>
                {/if}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-auto flex justify-end">
      <Button onclick={() => {
        // Log concise settings summary
        console.log(`[Settings] Relay group: ${relayGroupSelection}, includeLocalRelays: ${includeLocalRelays}, useFallbackRelays: ${$useFallbackRelays}`);
        onClose();
      }}>Apply</Button>
    </div>
  </div>
</Modal> 