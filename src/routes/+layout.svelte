<script lang="ts">
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount } from "svelte";
  import { apiKey, advancedMode } from "$lib/stores/apiKey";
  import ChatInterface from "$lib/components/ChatInterface.svelte";
  import ApiKeyEntry from "$lib/components/ApiKeyEntry.svelte";

  let displayHeight = $state(window.innerHeight);

  onMount(() => {
    document.body.style.height = `${displayHeight}px`;
  });
</script>

<div class={"leather min-h-full w-full flex flex-col items-center"}>
  <Navigation />
  <slot />

  {#if $advancedMode}
    {#if $apiKey}
      <ChatInterface />
    {:else}
      <div class="fixed right-0 top-[64px] w-80 z-40">
        <ApiKeyEntry />
      </div>
    {/if}
  {/if}
</div>