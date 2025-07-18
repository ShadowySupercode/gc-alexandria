<script lang="ts">
  import { Button, Modal } from "flowbite-svelte";
  import { ndkInstance, activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { get } from "svelte/store";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import {
    createRelaySetFromUrls,
    createNDKEvent,
  } from "$lib/utils/nostrUtils";
  import RelayDisplay, {
    getConnectedRelays,
    getEventRelays,
  } from "./RelayDisplay.svelte";
  import { communityRelays, secondaryRelays } from "$lib/consts";

  const { event } = $props<{
    event: NDKEvent;
  }>();

  let searchingRelays = $state(false);
  let foundRelays = $state<string[]>([]);
  let showRelayModal = $state(false);
  let relaySearchResults = $state<
    Record<string, "pending" | "found" | "notfound">
  >({});
  let allRelays = $state<string[]>([]);

  // Magnifying glass icon SVG
  const searchIcon = `<svg class="w-4 h-4 mr-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
  </svg>`;

  function openRelayModal() {
    showRelayModal = true;
    relaySearchResults = {};
    searchAllRelaysLive();
  }

  async function searchAllRelaysLive() {
    if (!event) return;
    relaySearchResults = {};
    const ndk = get(ndkInstance);
    const userRelays = Array.from(ndk?.pool?.relays.values() || []).map(
      (r) => r.url,
    );
    allRelays = [...$activeInboxRelays, ...$activeOutboxRelays, ...userRelays].filter(
      (url, idx, arr) => arr.indexOf(url) === idx,
    );
    relaySearchResults = Object.fromEntries(
      allRelays.map((r: string) => [r, "pending"]),
    );
    await Promise.all(
      allRelays.map(async (relay: string) => {
        try {
          const relaySet = createRelaySetFromUrls([relay], ndk);
          const found = await ndk
            .fetchEvent({ ids: [event?.id || ""] }, undefined, relaySet)
            .withTimeout(2000);
          relaySearchResults = {
            ...relaySearchResults,
            [relay]: found ? "found" : "notfound",
          };
        } catch {
          relaySearchResults = { ...relaySearchResults, [relay]: "notfound" };
        }
      }),
    );
  }

  function closeRelayModal() {
    showRelayModal = false;
  }
</script>

<div class="mt-4 flex flex-wrap gap-2">
  <Button on:click={openRelayModal} class="flex items-center">
    {@html searchIcon}
    Where can I find this event?
  </Button>
</div>

{#if foundRelays.length > 0}
  <div class="mt-2">
    <span class="font-semibold">Found on {foundRelays.length} relay(s):</span>
    <div class="flex flex-wrap gap-2 mt-1">
      {#each foundRelays as relay}
        <RelayDisplay {relay} />
      {/each}
    </div>
  </div>
{/if}

<div class="mt-2">
  <span class="font-semibold">Found on:</span>
  <div class="flex flex-wrap gap-2 mt-1">
    {#each getEventRelays(event) as relay}
      <RelayDisplay {relay} />
    {/each}
  </div>
</div>

<Modal
  class="modal-leather"
  title="Relay Search Results"
  bind:open={showRelayModal}
  autoclose
  outsideclose
  size="lg"
>
  <div class="flex flex-col gap-4 max-h-96 overflow-y-auto">
    {#each Object.entries( { "Active Inbox Relays": $activeInboxRelays, "Active Outbox Relays": $activeOutboxRelays }, ) as [groupName, groupRelays]}
      {#if groupRelays.length > 0}
        <div class="flex flex-col gap-2">
          <h3
            class="font-medium text-gray-900 dark:text-gray-100 sticky top-0 bg-white dark:bg-gray-900 py-2"
          >
            {groupName}
          </h3>
          {#each groupRelays as relay}
            <RelayDisplay
              {relay}
              showStatus={true}
              status={relaySearchResults[relay] || null}
            />
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</Modal>
