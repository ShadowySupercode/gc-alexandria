<script lang="ts">
  import {
    ClipboardCleanOutline,
    DotsVerticalOutline,
    EyeOutline,
  } from "flowbite-svelte-icons";
  import { Button, Modal, Popover } from "flowbite-svelte";
  import { neventEncode, naddrEncode } from "$lib/utils/identifierUtils";
  import { feedType } from "$lib/stores";
  import { getNostrClient } from '$lib/nostr/client';
  import type { NostrEvent } from "$lib/types/nostr";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import Details from "$components/util/Details.svelte";
  import { selectRelayGroup } from '$lib/utils';

  // Component props
  let { event } = $props<{ event: NostrEvent }>();

  // UI state
  let detailsModalOpen: boolean = $state(false);
  let isOpen: boolean = $state(false);

  // Get the Nostr client
  const client = getNostrClient();

  /**
   * Selects the appropriate relay set based on user settings
   * Uses the selectRelayGroup utility to determine which relays to use
   */
  let activeRelays = $derived.by(() => {
    const relays = selectRelayGroup('inbox');
    const user = client.getActiveUser();

    console.debug("[CardActions] Selected relays:", {
      eventId: event.id,
      isSignedIn: !!user,
      feedType: $feedType,
      relayCount: relays.length,
      relayUrls: relays,
    });

    return relays;
  });

  /**
   * Opens the actions popover menu
   */
  function openPopover() {
    console.debug("[CardActions] Opening menu", { eventId: event.id });
    isOpen = true;
  }

  /**
   * Closes the actions popover menu and removes focus
   */
  function closePopover() {
    console.debug("[CardActions] Closing menu", { eventId: event.id });
    isOpen = false;
    const menu = document.getElementById("dots-" + event.id);
    if (menu) menu.blur();
  }

  /**
   * Gets the appropriate identifier (nevent or naddr) for copying
   * @param type - The type of identifier to get ('nevent' or 'naddr')
   * @returns The encoded identifier string
   */
  function getIdentifier(type: 'nevent' | 'naddr'): string {
    const encodeFn = type === "nevent" ? neventEncode : naddrEncode;
    const identifier = encodeFn(event, activeRelays);
    console.debug(
      "[CardActions] ${type} identifier for event ${event.id}:",
      identifier,
    );
    return identifier;
  }

  /**
   * Opens the event details modal
   */
  function viewDetails() {
    console.debug("[CardActions] Opening details modal", {
      eventId: event.id,
      title: event.tags.find((tag: string[]) => tag[0] === 'title')?.[1],
      author: event.tags.find((tag: string[]) => tag[0] === 'author')?.[1],
    });
    detailsModalOpen = true;
  }

  // Log component initialization
  console.debug("[CardActions] Initialized", {
    eventId: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    title: event.tags.find((tag: string[]) => tag[0] === 'title')?.[1],
    author: event.tags.find((tag: string[]) => tag[0] === 'author')?.[1],
  });
</script>

<div
  class="group bg-highlight dark:bg-primary-1000 rounded"
  role="group"
  onmouseenter={openPopover}
>
  <!-- Main button -->
  <Button
    type="button"
    id="dots-{event.id}"
    class="hover:bg-primary-0 dark:text-highlight dark:hover:bg-primary-800 p-1 dots"
    color="none"
    data-popover-target="popover-actions"
    tabindex={0}
    on:click={e => e.stopPropagation()}
  >
    <DotsVerticalOutline class="h-6 w-6" />
    <span class="sr-only">Open actions menu</span>
  </Button>

  {#if isOpen}
    <Popover
      id="popover-actions"
      placement="bottom"
      trigger="click"
      class="popover-leather w-fit z-10"
      onmouseleave={closePopover}
    >
      <div class="flex flex-row justify-between space-x-4">
        <div class="flex flex-col text-nowrap">
          <ul class="space-y-2">
            <li>
              <a
                href="/events?id={getIdentifier('naddr')}"
                class="btn-leather w-full text-left inline-flex items-center"
              >
                <EyeOutline class="inline mr-2" /> View event
              </a>
            </li>
            <li>
              <CopyToClipboard
                displayText="Copy naddr address"
                copyText={getIdentifier("naddr")}
                icon={ClipboardCleanOutline}
              />
            </li>
          </ul>
        </div>
      </div>
    </Popover>
  {/if}
  <!-- Event details -->
  <Modal
    class="modal-leather"
    title="Publication details"
    bind:open={detailsModalOpen}
    autoclose
    outsideclose
    size="sm"
  >
    <Details {event} isModal={true} />
    <a
      href="/events?id={getIdentifier('nevent')}"
      class="mt-4 btn-leather text-center text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-semibold"
    >
      View Event Details
    </a>
  </Modal>
</div>
