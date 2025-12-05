<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { FontHighlightOutline } from "flowbite-svelte-icons";

  let { isActive = $bindable(false) }: { isActive?: boolean } = $props();

  function toggleHighlightMode() {
    isActive = !isActive;
  }
</script>

<Button
  color={isActive ? "primary" : "light"}
  size="sm"
  class="btn-leather {isActive ? 'ring-2 ring-primary-500' : ''}"
  onclick={toggleHighlightMode}
  title={isActive ? "Exit highlight mode" : "Enter highlight mode"}
>
  <FontHighlightOutline class="w-4 h-4 mr-2" />
  {isActive ? "Exit Highlight Mode" : "Add Highlight"}
</Button>
