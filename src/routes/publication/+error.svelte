<script lang="ts">
  import { invalidateAll, goto } from "$app/navigation";
  import { Alert, P, Button } from "flowbite-svelte";
  import { ExclamationCircleOutline } from "flowbite-svelte-icons";
  import { page } from "$app/state";

  // Parse error message to extract search parameters and format it nicely
  function parseErrorMessage(message: string): { 
    errorType: string; 
    identifier: string; 
    searchUrl?: string;
    shortIdentifier?: string;
  } {
    const searchLinkMatch = message.match(/href="([^"]+)"/);
    let searchUrl: string | undefined;
    let baseMessage = message;
    
    if (searchLinkMatch) {
      searchUrl = searchLinkMatch[1];
      baseMessage = message.replace(/href="[^"]+"/, '').trim();
    }

    // Extract error type and identifier from the message
    const match = baseMessage.match(/Event not found for (\w+): (.+)/);
    if (match) {
      const errorType = match[1];
      const fullIdentifier = match[2];
      const shortIdentifier = fullIdentifier.length > 50 
        ? fullIdentifier.substring(0, 47) + '...' 
        : fullIdentifier;
      
      return { 
        errorType, 
        identifier: fullIdentifier, 
        searchUrl, 
        shortIdentifier 
      };
    }

    return { 
      errorType: 'unknown', 
      identifier: baseMessage, 
      searchUrl,
      shortIdentifier: baseMessage.length > 50 
        ? baseMessage.substring(0, 47) + '...' 
        : baseMessage 
    };
  }

  $: errorInfo = page.error?.message ? parseErrorMessage(page.error.message) : { 
    errorType: 'unknown', 
    identifier: '', 
    shortIdentifier: '' 
  };
</script>

<main class="max-w-2xl mx-auto p-6">
  <Alert class="border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20">
    <div class="flex items-center space-x-2 mb-4">
      <ExclamationCircleOutline class="w-6 h-6 text-red-600 dark:text-red-400" />
      <span class="text-lg font-medium text-red-800 dark:text-red-200">
        Failed to load publication
      </span>
    </div>
    
    <P size="sm" class="text-gray-700 dark:text-gray-300 mb-4">
      Alexandria failed to find one or more of the events comprising this publication.
    </P>
    
    <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4">
      <div class="flex items-start space-x-2">
        <span class="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-0">
          Error Type:
        </span>
        <span class="text-sm text-gray-800 dark:text-gray-200 font-mono">
          {errorInfo.errorType}
        </span>
      </div>
      
      <div class="flex items-start space-x-2 mt-2">
        <span class="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-0">
          Identifier:
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-gray-800 dark:text-gray-200 font-mono break-all">
            {errorInfo.shortIdentifier}
          </div>
          {#if errorInfo.identifier.length > 50}
            <details class="mt-2">
              <summary class="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                Show full identifier
              </summary>
              <div class="mt-2 text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                {errorInfo.identifier}
              </div>
            </details>
          {/if}
        </div>
      </div>
    </div>
    
    {#if errorInfo.searchUrl}
      <div class="mb-4">
        <Button
          class="btn-leather !w-fit bg-blue-600 hover:bg-blue-700 text-white"
          size="sm"
          onclick={() => {
            if (errorInfo.searchUrl) {
              goto(errorInfo.searchUrl);
            }
          }}
        >
          🔍 Search for this event
        </Button>
      </div>
    {/if}
    
    <div class="flex space-x-2">
      <Button
        class="btn-leather !w-fit"
        size="sm"
        onclick={() => invalidateAll()}
      >
        🔄 Try Again
      </Button>
      <Button
        class="btn-leather !w-fit"
        size="sm"
        outline
        onclick={() => goto("/")}
      >
        🏠 Return home
      </Button>
    </div>
  </Alert>
</main>
