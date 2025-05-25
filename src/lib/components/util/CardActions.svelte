<script lang="ts">
  import {
    ClipboardCleanOutline,
    DotsVerticalOutline,
    EyeOutline,
  } from "flowbite-svelte-icons";
  import { Button, Modal, Popover } from "flowbite-svelte";
  import { standardRelays, FeedType } from "$lib/consts";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { feedType } from "$lib/stores";
  import { inboxRelays, ndkSignedIn } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import Details from "$components/util/Details.svelte";

  // Component props
  let { event } = $props<{ event: NDKEvent }>();

  // Derive metadata from event
  let title = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "title")?.[1] ?? "",
  );
  let summary = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "summary")?.[1] ?? "",
  );
  let image = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "image")?.[1] ?? null,
  );
  let author = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "author")?.[1] ?? "",
  );
  let originalAuthor = $derived.by(
    () =>
      event.tags.find((t: string[]) => t[0] === "original_author")?.[1] ?? null,
  );
  let version = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "version")?.[1] ?? "",
  );
  let source = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "source")?.[1] ?? null,
  );
  let type = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "type")?.[1] ?? null,
  );
  let language = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "language")?.[1] ?? null,
  );
  let publisher = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "publisher")?.[1] ?? null,
  );
  let identifier = $derived.by(
    () => event.tags.find((t: string[]) => t[0] === "identifier")?.[1] ?? null,
  );

  // UI state
  let detailsModalOpen: boolean = $state(false);
  let isOpen: boolean = $state(false);

  /**
   * Selects the appropriate relay set based on user state and feed type
   * - Uses user's inbox relays when signed in and viewing personal feed
   * - Falls back to standard relays for anonymous users or standard feed
   */
  let activeRelays = $derived.by(() => {
    const isUserFeed = $ndkSignedIn && $feedType === FeedType.UserRelays;
    const relays = isUserFeed ? $inboxRelays : standardRelays;

    console.debug("[CardActions] Selected relays:", {
      eventId: event.id,
      isSignedIn: $ndkSignedIn,
      feedType: $feedType,
      isUserFeed,
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
  function getIdentifier(type: "nevent" | "naddr"): string {
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
      title: event.title,
      author: event.author,
    });
    detailsModalOpen = true;
  }

  // Log component initialization
  console.debug("[CardActions] Initialized", {
    eventId: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    title: event.title,
    author: event.author,
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
    class=" hover:bg-primary-0 dark:text-highlight dark:hover:bg-primary-800 p-1 dots"
    color="none"
    data-popover-target="popover-actions"
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
              <button
                class="btn-leather w-full text-left"
                onclick={viewDetails}
              >
                <EyeOutline class="inline mr-2" /> View details
              </button>
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
