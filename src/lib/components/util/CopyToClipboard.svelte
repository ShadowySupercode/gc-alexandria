<script lang="ts">
  import { Button } from "flowbite-svelte";
  import {
    ClipboardCheckOutline,
    ClipboardCleanOutline,
  } from "flowbite-svelte-icons";
  import { withTimeout } from "$lib/utils/nostrUtils";
  import type { Component } from "svelte";

  let {
    displayText,
    copyText = displayText,
    icon = ClipboardCleanOutline,
  } = $props<{
    displayText: string;
    copyText?: string;
    icon?: Component | false;
  }>();

  let copied: boolean = $state(false);

  async function copyToClipboard() {
    try {
      await withTimeout(navigator.clipboard.writeText(copyText), 2000);
      copied = true;
      await withTimeout(
        new Promise((resolve) => setTimeout(resolve, 4000)),
        4000,
      )
        .then(() => {
          copied = false;
        })
        .catch(() => {
          // If timeout occurs, still reset the state
          copied = false;
        });
    } catch (err) {
      console.error(
        "[CopyToClipboard] Failed to copy:",
        err instanceof Error ? err.message : err,
      );
    }
  }
</script>

<button class="btn-leather w-full text-left dark:text-primary-100 p-1 rounded-xs cursor-pointer" onclick={copyToClipboard}>
  {#if copied}
    <ClipboardCheckOutline class="inline mr-2" /> Copied!
  {:else}
    {@const TheIcon = icon}
    <TheIcon class="inline { displayText !== '' ? 'mr-2' : ''}" />
    {displayText}
  {/if}
</button>
