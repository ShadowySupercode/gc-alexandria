<script lang="ts">
  export let relay: string;
  export let showStatus = false;
  export let status: "pending" | "found" | "notfound" | null = null;

  // Use a static fallback icon for all relays
  function relayFavicon(relay: string): string {
    return "/favicon.png";
  }
</script>

<div
  class="flex items-center gap-2 p-2 rounded border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
>
  <img
    src={relayFavicon(relay)}
    alt="relay icon"
    class="w-5 h-5 object-contain"
    onerror={(e) => {
      (e.target as HTMLImageElement).src = "/favicon.png";
    }}
  />
  <span class="font-mono text-xs flex-1">{relay}</span>
  {#if showStatus && status}
    {#if status === "pending"}
      <svg
        class="w-4 h-4 animate-spin text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"
        ></path>
      </svg>
    {:else if status === "found"}
      <span class="text-green-600">&#10003;</span>
    {:else}
      <span class="text-red-500">&#10007;</span>
    {/if}
  {/if}
</div>
