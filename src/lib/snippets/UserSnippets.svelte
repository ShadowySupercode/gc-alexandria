<script module lang="ts">
  import {
    toNpub,
  } from "$lib/utils/nostrUtils";
  import { goto } from "$app/navigation";

  export { userBadge };
</script>

{#snippet userBadge(identifier: string, displayText: string | undefined)}
  {#if toNpub(identifier)}
    {@const npub = toNpub(identifier) as string}
    {@const cleanId = npub.replace(/^nostr:/, "")}
    {@const defaultText = `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}`}
    {@const displayTextFinal = displayText || defaultText}
    
    <button
      class="npub-badge hover:underline"
      onclick={() => goto(`/events?id=${encodeURIComponent(cleanId)}`)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goto(`/events?id=${encodeURIComponent(cleanId)}`);
        }
      }}
    >
      @{displayTextFinal}
    </button>
  {:else}
    {displayText ?? ""}
  {/if}
{/snippet}
