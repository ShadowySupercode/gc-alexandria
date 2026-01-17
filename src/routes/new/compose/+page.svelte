<script lang="ts">
  import { Heading, Button } from "flowbite-svelte";
  import ZettelEditor from "$lib/components/ZettelEditor.svelte";
  import { nip19 } from "nostr-tools";
  import {
    publishSingleEvent,
    processPublishResults,
    type ProcessedPublishResults,
  } from "$lib/services/publisher";
  import { getNdkContext } from "$lib/ndk";
  import { AAlert } from "$lib/a/index";

  const ndk = getNdkContext();

  let content = $state("");
  let showPreview = $state(false);
  let isPublishing = $state(false);
  let publishResults = $state<ProcessedPublishResults | null>(null);
  let publishProgress = $state<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  // Handle content changes from ZettelEditor
  function handleContentChange(newContent: string) {
    content = newContent;
  }

  // Handle preview toggle from ZettelEditor
  function handlePreviewToggle(show: boolean) {
    showPreview = show;
  }

  // Helper function to create error result
  function createErrorResult(error: unknown): ProcessedPublishResults {
    return {
      successCount: 0,
      total: 0,
      errors: [error instanceof Error ? error.message : "Unknown error"],
      successfulEvents: [],
      failedEvents: [],
    };
  }

  // Helper function to log event summaries
  function logEventSummary(
    events: any,
    successfulEvents: Array<{ eventId: string; title: string }>,
  ) {
    console.log("\n=== Events Summary ===");

    if (events.indexEvent) {
      console.log("\nRoot Index:");
      console.log(`Event Summary:`);
      console.log(`  ID: ${successfulEvents[0]?.eventId || "Failed"}`);
      console.log(`  Kind: 30040`);
      console.log(`  Tags:`);
      events.indexEvent.tags.forEach((tag: string[]) => {
        console.log(`    - ${JSON.stringify(tag)}`);
      });
      console.log("  ---");
    }

    console.log("\nContent:");
    events.contentEvents.forEach((event: any, index: number) => {
      const eventId =
        successfulEvents.find((e) => e.title === event.title)?.eventId ||
        "Failed";
      console.log(`\nEvent Summary:`);
      console.log(`  ID: ${eventId}`);
      console.log(`  Kind: 30041`);
      console.log(`  Tags:`);
      event.tags.forEach((tag: any) => {
        console.log(`    - ${JSON.stringify(tag)}`);
      });
      console.log(`  Content preview: ${event.content.substring(0, 100)}...`);
      console.log("  ---");
    });
  }

  // Handle unified publishing from ZettelEditor
  async function handlePublishArticle(events: any) {
    isPublishing = true;
    publishResults = null;

    // Initialize progress tracking
    const totalEvents =
      (events.indexEvent ? 1 : 0) + events.contentEvents.length;
    publishProgress = { current: 0, total: totalEvents };

    // Debug: Log the first content event to see its structure
    if (events.contentEvents.length > 0) {
      console.log("First content event structure:", {
        kind: events.contentEvents[0].kind,
        tags: events.contentEvents[0].tags,
        contentLength: events.contentEvents[0].content.length,
        contentPreview: events.contentEvents[0].content.substring(0, 100),
      });
    }

    try {
      const results: any[] = [];

      // Publish index event first using publishSingleEvent
      if (events.indexEvent) {
        const indexResult = await publishSingleEvent(
          {
            content: events.indexEvent.content,
            kind: events.indexEvent.kind,
            tags: events.indexEvent.tags,
            onError: (error) => {
              console.error("Index event publish failed:", error);
            },
          },
          ndk,
        );
        results.push(indexResult);
        publishProgress.current += 1;
      }

      // Publish content events
      for (let i = 0; i < events.contentEvents.length; i++) {
        const event = events.contentEvents[i];
        console.log(
          `Publishing content event ${i + 1}: ${event.tags.find((t: any) => t[0] === "title")?.[1] || "Untitled"}`,
        );
        const result = await publishSingleEvent(
          {
            content: event.content,
            kind: event.kind,
            tags: event.tags,
            onError: (error) => {
              console.error(`Content event ${i + 1} publish failed:`, error);
            },
          },
          ndk,
        );
        results.push(result);
        publishProgress.current += 1;
      }

      // Process results using shared utility
      publishResults = processPublishResults(
        results,
        events,
        !!events.indexEvent,
      );

      // Show summary
      logEventSummary(events, publishResults.successfulEvents);
    } catch (error) {
      console.error("Publishing failed:", error);
      publishResults = createErrorResult(error);
    }

    isPublishing = false;
  }

  async function handlePublishScatteredNotes(events: any) {
    isPublishing = true;
    publishResults = null;

    // Initialize progress tracking
    const totalEvents = events.contentEvents.length;
    publishProgress = { current: 0, total: totalEvents };

    // Debug: Log the structure of events being published (without content)
    console.log("=== PUBLISHING SCATTERED NOTES ===");
    console.log(`Number of content events: ${events.contentEvents.length}`);

    try {
      const results: any[] = [];

      // Publish only content events for scattered notes
      for (let i = 0; i < events.contentEvents.length; i++) {
        const event = events.contentEvents[i];
        const result = await publishSingleEvent(
          {
            content: event.content,
            kind: event.kind,
            tags: event.tags,
            onError: (error) => {
              console.error(`Content event ${i + 1} publish failed:`, error);
            },
          },
          ndk,
        );
        results.push(result);
        publishProgress.current += 1;
      }

      // Process results using shared utility
      publishResults = processPublishResults(results, events, false);

      // Show summary
      logEventSummary(events, publishResults.successfulEvents);
    } catch (error) {
      console.error("Publishing failed:", error);
      publishResults = createErrorResult(error);
    }

    isPublishing = false;
  }

  async function retryFailedEvent(sectionIndex: number) {
    if (!publishResults) return;

    // Find the failed event to retry
    const failedEvent = publishResults.failedEvents.find(
      (event) => event.sectionIndex === sectionIndex,
    );

    if (!failedEvent) return;

    isPublishing = true;

    try {
      // Retry publishing the failed content
      // Note: This is a simplified retry - in production you'd want to store the original event data
      // For now, we'll just show an error message
      console.error(
        "Retry not implemented - would need to store original event data",
      );
      // Just return early since retry is not implemented
      isPublishing = false;
      return;
    } catch (error) {
      console.error("Retry failed:", error);
      isPublishing = false;
    }
  }
</script>

<svelte:head>
  <title>Compose Note - Alexandria</title>
</svelte:head>

<!-- Main container with max 1536px width and centered -->
<div class="flex flex-col self-center items-center w-full max-w-[1536px] mx-auto px-2 space-y-4">
    <Heading
      tag="h1" class="h-leather mb-2">
      Compose Notes
    </Heading>

    <ZettelEditor
      {content}
      {showPreview}
      {isPublishing}
      {publishProgress}
      onContentChange={handleContentChange}
      onPreviewToggle={handlePreviewToggle}
      onPublishArticle={handlePublishArticle}
      onPublishScatteredNotes={handlePublishScatteredNotes}
    />

    <!-- Status Messages -->
    {#if publishResults}
      {#if publishResults.successCount === publishResults.total}
        <AAlert color="green" dismissable>
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
        </AAlert>
      {:else}
        <AAlert color="red" dismissable>
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
                    <div class="text-red-600 dark:text-red-400 text-xs">
                      {failedEvent.error}
                    </div>
                    <Button
                      size="xs"
                      color="light"
                      onclick={() => retryFailedEvent(failedEvent.sectionIndex)}
                      disabled={isPublishing}
                      class="mt-1"
                    >
                      {isPublishing ? "Retrying..." : "Retry"}
                    </Button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </AAlert>
      {/if}
    {/if}
</div>
