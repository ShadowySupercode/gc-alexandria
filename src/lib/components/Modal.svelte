<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  export let showModal;
  export let event: NDKEvent;
</script>

{#if showModal}
  <div class="backdrop">
    <div class="Modal">{event.id}</div>
  </div>
{/if}
