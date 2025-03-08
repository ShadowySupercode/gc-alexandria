<script lang='ts'>
  import { Tooltip } from 'flowbite-svelte';
  import { FileCopyOutline } from 'flowbite-svelte-icons';
  export let displayText = "";  // Shown in UI
  export let copyText = displayText;  // Copied to clipboard (default to same if not provided)

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(copyText);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  }
</script>

<div role='tooltip'>
  <span>
      {displayText} <button class='btn-leather' id='copy-button' onclick={copyToClipboard}><FileCopyOutline class='w-4 h-4 !fill-none dark:!fill-none' /></button>
  </span>
  <Tooltip
    class='tooltip-leather'
    triggeredBy='#copy-button'
    trigger='click'
    placement='bottom'
    type="auto"
  >
    Copied!
  </Tooltip>
</div>
