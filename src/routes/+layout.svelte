<script>
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount } from "svelte";

  // Compute viewport height.
  $: displayHeight = window.innerHeight;

  onMount(() => {
    document.body.style.height = `${displayHeight}px`;
  });
</script>

<div class={'leather min-h-full w-full flex flex-col items-center'}>
  <Navigation class='sticky top-0' />
  <slot />
</div>
