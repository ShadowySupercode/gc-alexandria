<script lang="ts">
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount } from "svelte";
  import { advancedMode, apiKey } from "$lib/stores/apiKey";
  import ChatInterface from "$lib/components/ChatInterface.svelte";
  import { page } from "$app/stores";
  import ApiKeyEntry from "$lib/components/ApiKeyEntry.svelte";

  let displayHeight = $state(window.innerHeight);
  let isPublicationPage = $derived($page.url.pathname.startsWith("/publication"));

  onMount(() => {
    document.body.style.height = `${displayHeight}px`;
  });
</script>

<div class={"leather min-h-full w-full flex flex-col items-center"}>
  <Navigation class="sticky top-0" />
  <slot />
  {#if $advancedMode}
    {#if !$apiKey}
      <ApiKeyEntry />
    {:else}
      <ChatInterface events={[]} />
    {/if}
  {/if}
</div>