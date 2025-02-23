<script lang="ts">
  import { apiKey } from "$lib/stores/apiKey";
  import { Button, Input } from "flowbite-svelte";

  let tempApiKey = "";

  function saveApiKey() {
    if (!tempApiKey.trim()) return;
    $apiKey = tempApiKey;
    tempApiKey = "";
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      saveApiKey();
    }
  }
</script>

<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
  <h2 class="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Enter API Key</h2>
  <div class="space-y-4">
    <Input
      type="password"
      bind:value={tempApiKey}
      on:keydown={handleKeyPress}
      placeholder="Enter your API key"
    />
    <Button 
      color="primary"
      class="w-full"
      on:click={saveApiKey} 
      disabled={!tempApiKey.trim()}
    >
      Save API Key
    </Button>
  </div>
</div>