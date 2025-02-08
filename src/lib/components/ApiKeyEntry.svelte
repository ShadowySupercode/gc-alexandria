<!-- ApiKeyEntry.svelte -->
<script lang="ts">
  import { apiKey } from "$lib/stores/apiKey";
  import { Button, Input, Label } from "flowbite-svelte";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let tempApiKey = "";

  function saveApiKey() {
    if (!tempApiKey.startsWith("sk-ant-")) {
      alert("Invalid API key format. Key must start with 'sk-ant-'");
      return;
    }

    $apiKey = tempApiKey;
    tempApiKey = "";
  }
</script>

<div
  class="fixed right-0 top-[64px] h-auto w-80 bg-white dark:bg-gray-800 p-4 shadow-lg z-40 overflow-y-auto max-h-[calc(100vh-64px)]"
  transition:fly={{ duration: 300, x: 320, opacity: 1, easing: quintOut }}
>
  <div class="card">
    <h2 class="text-xl font-bold mb-4">API Key Required</h2>
    <div class="space-y-4">
      <Label for="api-key-input" class="mb-2">API Key</Label>
      <Input
        id="api-key-input"
        type="password"
        bind:value={tempApiKey}
        class="mb-4"
        placeholder="Enter your API key (starts with sk-ant-)"
      />
      <Button
        on:click={saveApiKey}
        class="w-full"
        disabled={!tempApiKey}
      >
        Save API Key
      </Button>
      <p class="text-sm text-red-500 mt-2">
        Warning: Entering your API key here may pose security risks. Never share
        your key or use it on untrusted sites.
      </p>
    </div>
  </div>
</div>