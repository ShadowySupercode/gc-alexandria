<script lang="ts">
  import { showTech } from '$lib/stores/techStore.ts';
  import { Toggle } from "flowbite-svelte";
  let label = 'Show technical details';
  $: checked = $showTech;
</script>

<div class="inline-flex items-center gap-2 select-none">
  <Toggle {checked} ontoggle={() => $showTech = checked} aria-label={label} />
  <span class="text-sm">{label}</span>
</div>
