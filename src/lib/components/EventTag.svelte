<script lang="ts">
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";

  export let tag: string[];

  function getTagLink() {
    if (tag[0] === 'a' && tag.length > 1) {
      const [kind, pubkey, d] = tag[1].split(':');
      return `/events?id=${naddrEncode({kind: +kind, pubkey, tags: [['d', d]], content: '', id: '', sig: ''} as any, standardRelays)}`;
    } else if (tag[0] === 'e' && tag.length > 1) {
      return `/events?id=${neventEncode({id: tag[1], kind: 1, content: '', tags: [], pubkey: '', sig: ''} as any, standardRelays)}`;
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
  <span class="bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono">
    {tag[0]}:{tag[1]}
  </span>
{/if} 