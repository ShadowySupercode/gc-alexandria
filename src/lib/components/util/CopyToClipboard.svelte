<script lang='ts'>
  import { ClipboardCheckOutline, ClipboardCleanOutline } from "flowbite-svelte-icons";

  let { displayText, copyText = displayText} = $props();

  let copied: boolean = $state(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(copyText);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 4000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  }
</script>

<a role="button" class='btn-leather text-nowrap' onclick={copyToClipboard}>
  {#if copied}
    <ClipboardCheckOutline class="!fill-none dark:!fill-none inline mr-1" /> Copied!
  {:else}
    <ClipboardCleanOutline class="!fill-none dark:!fill-none inline mr-1" /> {displayText}
  {/if}
</a>