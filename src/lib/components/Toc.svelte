<script lang="ts">
  import type { NostrEvent } from '$lib/types/nostr';
  import { neventEncode } from '$lib/utils/identifierUtils';
  import { communityRelays } from '$lib/consts';
  import { getTagValue } from '$lib/utils/eventUtils';
  export let notes: NostrEvent[] = [];
  // check if notes is empty
  if (notes.length === 0) {
    console.debug("notes is empty");
  }
</script>

<div class="toc">
  <h2>Table of contents</h2>
  <ul>
    {#each notes as note}
      <li>
        <a href="#{neventEncode(note, communityRelays)}">{getTagValue(note, "title")}</a>
      </li>
    {/each}
  </ul>
</div>

<style>
  .toc h2 {
    text-align: center;
  }
</style>
