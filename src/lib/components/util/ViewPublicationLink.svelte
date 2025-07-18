<script lang="ts">
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import { naddrEncode } from "$lib/utils";
  import { getEventType } from "$lib/utils/mime";
  import { standardRelays } from "$lib/consts";
  import { goto } from "$app/navigation";

  let { event, className = "" } = $props<{
    event: NDKEvent;
    className?: string;
  }>();

  function getDeferralNaddr(event: NDKEvent): string | undefined {
    // Look for a 'deferral' tag, e.g. ['deferral', 'naddr1...']
    return getMatchingTags(event, "deferral")[0]?.[1];
  }

  function isAddressableEvent(event: NDKEvent): boolean {
    return getEventType(event.kind || 0) === "addressable";
  }

  function getNaddrAddress(event: NDKEvent): string | null {
    if (!isAddressableEvent(event)) {
      return null;
    }
    try {
      return naddrEncode(event, standardRelays);
    } catch {
      return null;
    }
  }

  function getViewPublicationNaddr(event: NDKEvent): string | null {
    // First, check for a-tags with 'defer' - these indicate the event is deferring to someone else's version
    const aTags = getMatchingTags(event, "a");
    for (const tag of aTags) {
      if (tag.length >= 2 && tag.includes("defer")) {
        // This is a deferral to someone else's addressable event
        return tag[1]; // Return the addressable event address
      }
    }

    // For deferred events with deferral tag, use the deferral naddr instead of the event's own naddr
    const deferralNaddr = getDeferralNaddr(event);
    if (deferralNaddr) {
      return deferralNaddr;
    }

    // Otherwise, use the event's own naddr if it's addressable
    return getNaddrAddress(event);
  }

  function navigateToPublication() {
    const naddrAddress = getViewPublicationNaddr(event);
    console.log("ViewPublicationLink: navigateToPublication called", {
      eventKind: event.kind,
      naddrAddress,
      isAddressable: isAddressableEvent(event),
    });
    if (naddrAddress) {
      console.log(
        "ViewPublicationLink: Navigating to publication:",
        naddrAddress,
      );
      goto(`/publication?id=${encodeURIComponent(naddrAddress)}`);
    } else {
      console.log("ViewPublicationLink: No naddr address found for event");
    }
  }

  let naddrAddress = $derived(getViewPublicationNaddr(event));
</script>

{#if naddrAddress}
  <button
    class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg transition-colors {className}"
    onclick={navigateToPublication}
    tabindex="0"
  >
    View Publication
  </button>
{/if}
