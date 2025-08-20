<script lang="ts">
  import { Modal } from "flowbite-svelte";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import {
    createRelaySetFromUrls,
  } from "$lib/utils/nostrUtils";
  import RelayDisplay, {
    getEventRelays,
  } from "./RelayDisplay.svelte";

  const { event } = $props<{
    event: NDKEvent;
  }>();

  const ndk = getNdkContext();

  let showRelayModal = $state(false);
  let relaySearchResults = $state<
    Record<string, "pending" | "found" | "notfound">
  >({});
  let allRelays = $state<string[]>([]);

  function openRelayModal() {
    showRelayModal = true;
    relaySearchResults = {};
    searchAllRelaysLive();
  }

  async function searchAllRelaysLive() {
    if (!event) return;
    relaySearchResults = {};
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
</script>

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
