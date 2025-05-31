<script lang="ts">
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { communityRelays } from "$lib/consts";
  import DualPill from "$components/util/DualPill.svelte";
  import { ensureNDKEvent } from "$lib/utils/relayGroupUtils";

  export let tag: string[];

  function getTagLink() {
    if (tag[0] === "a" && tag.length > 1) {
      const [kind, pubkey, d] = tag[1].split(":");
      const ndkEvent = ensureNDKEvent({
        kind: +kind,
        pubkey,
        tags: [["d", d]],
        content: "",
        id: "",
        sig: "",
      });
      return `/events?id=${naddrEncode(ndkEvent, communityRelays)}`;
    } else if (tag[0] === "e" && tag.length > 1) {
      const ndkEvent = ensureNDKEvent({
        id: tag[1],
        kind: 1,
        content: "",
        tags: [],
        pubkey: "",
        sig: "",
      });
      return `/events?id=${neventEncode(ndkEvent, communityRelays)}`;
    }
    return null;
  }

  const link = getTagLink();
</script>

{#if link}
  <a href={link} class="underline text-primary-700">
    {tag[0]}:{tag[1]}
  </a>
{:else}
  <DualPill left={tag[0]} right={tag[1]} />
{/if}
