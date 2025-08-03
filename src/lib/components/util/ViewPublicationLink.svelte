<script lang="ts">
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import { naddrEncode } from "$lib/utils";
  import { getEventType } from "$lib/utils/mime";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { communityRelays } from "$lib/consts";
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

  // AI-NOTE: Always ensure the returned address is a valid naddr1... string.
  // If the tag value is a raw coordinate (kind:pubkey:d-tag), encode it.
  // If it's already naddr1..., use as-is. Otherwise, fallback to event's own naddr.
  function getViewPublicationNaddr(event: NDKEvent): string | null {
    // First, check for a-tags with 'defer' - these indicate the event is deferring to someone else's version
    const aTags = getMatchingTags(event, "a");
    for (const tag of aTags) {
      if (tag.length >= 2 && tag.includes("defer")) {
        const value = tag[1];
        if (value.startsWith("naddr1")) {
          return value;
        }
        // Check for coordinate format: kind:pubkey:d-tag
        const coordMatch = value.match(/^(\d+):([0-9a-fA-F]{64}):(.+)$/);
        if (coordMatch) {
          const [_, kind, pubkey, dTag] = coordMatch;
          try {
            return naddrEncode({ kind: Number(kind), pubkey, tags: [["d", dTag]] } as NDKEvent, $activeInboxRelays);
          } catch {
            return null;
          }
        }
        // Fallback: if not naddr1 or coordinate, ignore
      }
    }

    // For deferred events with deferral tag, use the deferral naddr instead of the event's own naddr
    const deferralNaddr = getDeferralNaddr(event);
    if (deferralNaddr) {
      if (deferralNaddr.startsWith("naddr1")) {
        return deferralNaddr;
      }
      const coordMatch = deferralNaddr.match(/^(\d+):([0-9a-fA-F]{64}):(.+)$/);
      if (coordMatch) {
        const [_, kind, pubkey, dTag] = coordMatch;
        try {
          return naddrEncode({ kind: Number(kind), pubkey, tags: [["d", dTag]] } as NDKEvent, $activeInboxRelays);
        } catch {
          return null;
        }
      }
    }

    // Otherwise, use the event's own naddr if it's addressable
    return getNaddrAddress(event);
  }

  function getNaddrAddress(event: NDKEvent): string | null {
    if (!isAddressableEvent(event)) {
      return null;
    }
    try {
      return naddrEncode(event, $activeInboxRelays);
    } catch {
      return null;
    }
  }

  function navigateToPublication() {
    const naddrAddress = getViewPublicationNaddr(event);
    if (naddrAddress) {
      const url = `/publication/naddr/${naddrAddress}`;
      goto(url);
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
