<script lang="ts">
  import type { DisplayBadge } from "$lib/nostr/nip58";
  import ANostrBadge from "./ANostrBadge.svelte";
  export let badges: DisplayBadge[] = [];
  export let size: "xs" | "s" | "m" | "l" = "s";
  export let limit: number = 6;
  const shown = () => badges.slice(0, limit);
</script>

<div class="flex flex-wrap gap-1.5 items-center">
  {#each shown() as b (b.def.id)}
    <ANostrBadge badge={b} {size} />
  {/each}
  {#if badges.length > limit}
    <span
      class="text-[10px] px-1.5 py-0.5 rounded-md border border-muted/30 bg-surface/70"
    >
      +{badges.length - limit}
    </span>
  {/if}
</div>
