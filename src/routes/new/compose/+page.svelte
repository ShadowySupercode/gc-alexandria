<script lang="ts">
  import { Heading, Button, Alert } from "flowbite-svelte";
  import { PaperPlaneOutline } from "flowbite-svelte-icons";
  import ZettelEditor from "$lib/components/ZettelEditor.svelte";
  import { goto } from "$app/navigation";
  import { nip19 } from "nostr-tools";
  import { publishMultipleZettels } from "$lib/services/publisher";
  import { parseAsciiDocWithMetadata } from "$lib/utils/asciidoc_metadata";

  let content = $state("");
  let showPreview = $state(false);
  let isPublishing = $state(false);
  let publishResults = $state<{
    successCount: number;
    total: number;
    errors: string[];
    successfulEvents: Array<{ eventId: string; title: string }>;
    failedEvents: Array<{ title: string; error: string; sectionIndex: number }>;
  } | null>(null);

  // Handle content changes from ZettelEditor
  function handleContentChange(newContent: string) {
    content = newContent;
  }

  // Handle preview toggle from ZettelEditor
  function handlePreviewToggle(show: boolean) {
    showPreview = show;
  }

  async function handlePublish() {
    isPublishing = true;
    publishResults = null;

    const results = await publishMultipleZettels({
      content,
      onError: (error) => {
        // Only used for catastrophic errors
        publishResults = { successCount: 0, total: 0, errors: [error], successfulEvents: [], failedEvents: [] };
      },
    });

    const successCount = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success && r.error).map(r => r.error!);
    
    // Extract successful events with their titles
    const parsed = parseAsciiDocWithMetadata(content);
    const successfulEvents = results
      .filter(r => r.success && r.eventId)
      .map((r, index) => ({
        eventId: r.eventId!,
        title: parsed.sections[index]?.title || `Note ${index + 1}`
      }));
    
    // Extract failed events with their titles and errors
    const failedEvents = results
      .map((r, index) => ({ result: r, index }))
      .filter(({ result }) => !result.success)
      .map(({ result, index }) => ({
        title: parsed.sections[index]?.title || `Note ${index + 1}`,
        error: result.error || 'Unknown error',
        sectionIndex: index
      }));
    
    publishResults = {
      successCount,
      total: results.length,
      errors,
      successfulEvents,
      failedEvents,
    };
    isPublishing = false;
  }

  async function retryFailedEvent(sectionIndex: number) {
    if (!publishResults) return;
    
    isPublishing = true;
    
    // Get the specific section content
    const parsed = parseAsciiDocWithMetadata(content);
    const section = parsed.sections[sectionIndex];
    if (!section) return;
    
    // Reconstruct the section content for publishing
    const sectionContent = `== ${section.title}\n\n${section.content}`;
    
    try {
      const result = await publishMultipleZettels({
        content: sectionContent,
        onError: (error) => {
          console.error('Retry failed:', error);
        },
      });
      
      if (result[0]?.success && result[0]?.eventId) {
        // Update the successful events list
        const newSuccessfulEvent = {
          eventId: result[0].eventId,
          title: section.title
        };
        
        // Remove from failed events
        const updatedFailedEvents = publishResults.failedEvents.filter(
          (_, index) => index !== sectionIndex
        );
        
        // Add to successful events
        const updatedSuccessfulEvents = [...publishResults.successfulEvents, newSuccessfulEvent];
        
        publishResults = {
          ...publishResults,
          successCount: publishResults.successCount + 1,
          successfulEvents: updatedSuccessfulEvents,
          failedEvents: updatedFailedEvents,
        };
      }
    } catch (error) {
      console.error('Retry failed:', error);
    }
    
    isPublishing = false;
  }
</script>

<svelte:head>
  <title>Compose Note - Alexandria</title>
</svelte:head>

<!-- Main container with 75% width and centered -->
<div class="w-3/4 mx-auto">
  <div class="flex flex-col space-y-4">
    <Heading
      tag="h1"
      class="text-2xl font-bold text-gray-900 dark:text-gray-100"
    >
      Compose Notes
    </Heading>

    <ZettelEditor
      {content}
      {showPreview}
      onContentChange={handleContentChange}
      onPreviewToggle={handlePreviewToggle}
    />

    <!-- Publish Button -->
    <Button
      on:click={handlePublish}
      disabled={isPublishing || !content.trim()}
      class="w-full"
    >
      {#if isPublishing}
        Publishing...
      {:else}
        <PaperPlaneOutline class="w-4 h-4 mr-2" />
        Publish
      {/if}
    </Button>

    <!-- Status Messages -->
    {#if publishResults}
      {#if publishResults.successCount === publishResults.total}
        <Alert color="green" dismissable>
          <span class="font-medium">Success!</span>
          {publishResults.successCount} events published.
          {#if publishResults.successfulEvents.length > 0}
            <div class="mt-2">
              <span class="text-sm font-medium">Published events:</span>
              <div class="mt-1 space-y-1">
                {#each publishResults.successfulEvents as event}
                  {@const nevent = nip19.neventEncode({ id: event.eventId })}
                  <div class="text-sm">
                    <a 
                      href="/events?id={encodeURIComponent(event.eventId)}" 
                      class="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                    >
                      {event.title} ({nevent})
                    </a>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </Alert>
      {:else}
        <Alert color="red" dismissable>
          <span class="font-medium">Some events failed to publish.</span>
          {publishResults.successCount} of {publishResults.total} events published.
          
          {#if publishResults.successfulEvents.length > 0}
            <div class="mt-2">
              <span class="text-sm font-medium">Successfully published:</span>
              <div class="mt-1 space-y-1">
                {#each publishResults.successfulEvents as event}
                  {@const nevent = nip19.neventEncode({ id: event.eventId })}
                  <div class="text-sm">
                    <a 
                      href="/events?id={encodeURIComponent(event.eventId)}" 
                      class="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                    >
                      {event.title} ({nevent})
                    </a>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          
          {#if publishResults.failedEvents.length > 0}
            <div class="mt-2">
              <span class="text-sm font-medium">Failed to publish:</span>
              <div class="mt-1 space-y-2">
                {#each publishResults.failedEvents as failedEvent, index}
                  <div class="text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    <div class="font-medium">{failedEvent.title}</div>
                    <div class="text-red-600 dark:text-red-400 text-xs">{failedEvent.error}</div>
                    <Button
                      size="xs"
                      color="light"
                      onclick={() => retryFailedEvent(failedEvent.sectionIndex)}
                      disabled={isPublishing}
                      class="mt-1"
                    >
                      {isPublishing ? 'Retrying...' : 'Retry'}
                    </Button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </Alert>
      {/if}
    {/if}
  </div>
</div>
