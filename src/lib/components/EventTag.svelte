<script lang="ts">
  import { neventEncode, naddrEncode } from "$lib/utils/identifierUtils";
  import { communityRelays } from "$lib/consts";
  import DualPill from "$components/util/DualPill.svelte";
  import type { NostrEvent } from "$lib/types/nostr";

  export let tag: string[];

  function getTagLink() {
    if (tag[0] === "a" && tag.length > 1) {
      const [kind, pubkey, d] = tag[1].split(":");
      const event: NostrEvent = {
        kind: +kind,
        pubkey,
        tags: [["d", d]],
        content: "",
        id: "",
        sig: "",
        created_at: Math.floor(Date.now() / 1000),
      };
      return `/events?id=${naddrEncode(event, communityRelays)}`;
    } else if (tag[0] === "e" && tag.length > 1) {
      const event: NostrEvent = {
        id: tag[1],
        kind: 1,
        content: "",
        tags: [],
        pubkey: "",
        sig: "",
        created_at: Math.floor(Date.now() / 1000),
      };
      return `/events?id=${neventEncode(event, communityRelays)}`;
    }
    return null;
  }

  const link = getTagLink();
</script>

{#if link}
  <a href={link} class="underline break-all text-primary-700">
    {tag[0]}:{tag[1]}
  </a>
{:else}
  {#if tag.length === 2}
    <DualPill left={tag[0]} right={tag[1]} />
  {:else}
    <!-- loop over the tag array -->
    <ul class="mb-2">
      {#each tag as item, index}
        {#if index === 0}
          <li class="font-bold">{item}:</li>
        {:else}
          <li class="break-all">{item}</li>
        {/if}
      {/each}
    </ul>
  {/if}
{/if}
