<script lang='ts'>
  import { ClipboardCheckOutline, ClipboardCleanOutline } from "flowbite-svelte-icons";
  import { withTimeout } from "$lib/utils/nostrUtils";
  import type { Component } from "svelte";

  let { displayText, copyText = displayText, icon = ClipboardCleanOutline } = $props<{
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
        new Promise(resolve => setTimeout(resolve, 4000)),
        4000
      ).then(() => {
        copied = false;
      }).catch(() => {
        // If timeout occurs, still reset the state
        copied = false;
      });
    } catch (err) {
      console.error("[CopyToClipboard] Failed to copy:", err instanceof Error ? err.message : err);
    }
  }
</script>

<button class='btn-leather w-full text-left' onclick={copyToClipboard}>
  {#if copied}
    <ClipboardCheckOutline class="inline mr-2" /> Copied!
  {:else}
    {#if icon === ClipboardCleanOutline}
      <ClipboardCleanOutline class="inline mr-2" />
    {:else if icon === ClipboardCheckOutline}
      <ClipboardCheckOutline class="inline mr-2" />
    {/if}
    {displayText}
  {/if}
</button>
