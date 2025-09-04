<script lang="ts">
  import { showTech } from '$lib/stores/techStore.ts';
  import { Toggle, P } from "flowbite-svelte";
  let label = 'Show technical details';
</script>

<div class="inline-flex items-center gap-2 select-none my-3">
  <Toggle bind:checked={$showTech} aria-label={label} />
  <P class="text-sm">{label}</P>
</div>
