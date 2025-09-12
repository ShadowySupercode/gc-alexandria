<script lang="ts">
  import { showTech } from "$lib/stores/techStore.ts";
  let revealed = $state(false);
  let { title = "Technical details", className = "", content } = $props();

  let hidden = $derived(!$showTech && !revealed);
</script>

{#if hidden}
  <div
    class="rounded-md border border-dashed border-muted/40 bg-surface/60 px-3 py-2 my-6 flex items-center gap-3 {className}"
  >
    <span class="text-xs opacity-70">{title} hidden</span>
    <button
      class="ml-auto text-sm underline hover:no-underline"
      onclick={() => (revealed = true)}>Reveal this block</button
    >
  </div>
{:else}
  {@render content()}
{/if}
