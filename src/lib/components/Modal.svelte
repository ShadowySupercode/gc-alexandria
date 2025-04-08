<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  export let showModal;
  export let event: NDKEvent;
  // let str: string = JSON.stringify(event);
</script>

{#if showModal}
  <div class="backdrop">
    <div class="Modal">{event.id}</div>
  </div>
{/if}
