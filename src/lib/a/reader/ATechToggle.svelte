<script lang="ts">
  import { showTech } from '$lib/stores/techStore.ts';
  import ASwitch from '../primitives/ASwitch.svelte';
  let label = 'Show technical details';
  $: checked = $showTech;
</script>

<div class="inline-flex items-center gap-2 select-none">
  <ASwitch bind:checked={$showTech} aria-label={label} />
  <span class="text-sm">{label}</span>
</div>
