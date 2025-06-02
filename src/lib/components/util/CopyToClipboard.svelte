<script lang="ts">
  import {
    ClipboardCheckOutline,
    ClipboardCleanOutline,
  } from "flowbite-svelte-icons";
  import { withTimeout } from '$lib/utils';
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

  let copyPromise = $state<Promise<void> | null>(null);
  let copied = $derived.by(() => copyPromise !== null);

  async function copyToClipboard() {
    try {
      copyPromise = withTimeout(navigator.clipboard.writeText(copyText), 2000);
      await copyPromise;
      // Simple delay to show the "Copied!" state
      await new Promise((resolve) => setTimeout(resolve, 4000));
      copyPromise = null;
    } catch (err) {
      console.error(
        "[CopyToClipboard] Failed to copy:",
        err instanceof Error ? err.message : err,
      );
      copyPromise = null;
    }
  }
</script>

<button class="btn-leather w-full text-left" onclick={copyToClipboard}>
  {#if copied}
    <ClipboardCheckOutline class="inline mr-2" /> Copied!
  {:else}
    {#if icon === ClipboardCleanOutline}
      <ClipboardCleanOutline class="inline !fill-none  bg-transparent  mr-2" />
    {:else if icon === ClipboardCheckOutline}
      <ClipboardCheckOutline class="inline mr-2" />
    {:else if icon}
      <icon class="inline mr-2"></icon>
    {/if}
    {displayText}
  {/if}
</button>
