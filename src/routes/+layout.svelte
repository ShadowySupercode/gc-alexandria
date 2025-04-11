<script>
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount } from "svelte";

  let displayHeight;

  onMount(() => {
    // Compute viewport height only after component is mounted in the browser
    displayHeight = window.innerHeight;
    document.body.style.height = `${displayHeight}px`;
  });
</script>

<div class={'leather min-h-full w-full flex flex-col items-center'}>
  <Navigation class='sticky top-0' />
  <slot />
</div>
