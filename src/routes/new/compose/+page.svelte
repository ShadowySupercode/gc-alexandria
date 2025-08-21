<script lang="ts">
  import { Heading, Button, Alert } from "flowbite-svelte";
  import { PaperPlaneOutline } from "flowbite-svelte-icons";
  import ZettelEditor from "$lib/components/ZettelEditor.svelte";
  import { goto } from "$app/navigation";
  import { nip19 } from "nostr-tools";
  import { publishSingleEvent } from "$lib/services/publisher";
  import { getNdkContext } from "$lib/ndk";

  const ndk = getNdkContext();

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

  // Handle unified publishing from ZettelEditor
  async function handlePublishArticle(events: any) {
    isPublishing = true;
    publishResults = null;

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
        const indexResult = await publishSingleEvent({
          content: events.indexEvent.content,
          kind: events.indexEvent.kind,
          tags: events.indexEvent.tags,
          onError: (error) => {
            console.error("Index event publish failed:", error);
          },
        }, ndk);
        results.push(indexResult);
      }

      // Publish content events
      for (let i = 0; i < events.contentEvents.length; i++) {
        const event = events.contentEvents[i];
        console.log(
          `Publishing content event ${i + 1}: ${event.tags.find((t: any) => t[0] === "title")?.[1] || "Untitled"}`,
        );
        const result = await publishSingleEvent({
          content: event.content,
          kind: event.kind,
          tags: event.tags,
          onError: (error) => {
            console.error(`Content event ${i + 1} publish failed:`, error);
          },
        }, ndk);
        results.push(result);
      }

      // Process results
      const successCount = results.filter((r) => r.success).length;
      const errors = results
        .filter((r) => !r.success && r.error)
        .map((r) => r.error!);

      // Extract successful events with their titles
      const successfulEvents = results
        .filter((r) => r.success && r.eventId)
        .map((r, index) => ({
          eventId: r.eventId!,
          title:
            index === 0 && events.indexEvent
              ? "Article Index"
              : events.contentEvents[index - (events.indexEvent ? 1 : 0)]
                  ?.title || `Note ${index}`,
        }));

      // Extract failed events with their titles and errors
      const failedEvents = results
        .map((r, index) => ({ result: r, index }))
        .filter(({ result }) => !result.success)
        .map(({ result, index }) => ({
          title:
            index === 0 && events.indexEvent
              ? "Article Index"
              : events.contentEvents[index - (events.indexEvent ? 1 : 0)]
                  ?.title || `Note ${index}`,
          error: result.error || "Unknown error",
          sectionIndex: index,
        }));

      publishResults = {
        successCount,
        total: results.length,
        errors,
        successfulEvents,
        failedEvents,
      };

      // Show summary
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
    } catch (error) {
      console.error("Publishing failed:", error);
      publishResults = {
        successCount: 0,
        total: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
        successfulEvents: [],
        failedEvents: [],
      };
    }

    isPublishing = false;
  }

  async function handlePublishScatteredNotes(events: any) {
    isPublishing = true;
    publishResults = null;

    // Debug: Log the structure of events being published (without content)
    console.log("=== PUBLISHING SCATTERED NOTES ===");
    console.log(`Number of content events: ${events.contentEvents.length}`);

    try {
      const results: any[] = [];

      // Publish only content events for scattered notes
      for (let i = 0; i < events.contentEvents.length; i++) {
        const event = events.contentEvents[i];
        const result = await publishSingleEvent({
          content: event.content,
          kind: event.kind,
          tags: event.tags,
          onError: (error) => {
            console.error(`Content event ${i + 1} publish failed:`, error);
          },
        }, ndk);
        results.push(result);
      }

      // Process results
      const successCount = results.filter((r) => r.success).length;
      const errors = results
        .filter((r) => !r.success && r.error)
        .map((r) => r.error!);

      // Extract successful events with their titles
      const successfulEvents = results
        .filter((r) => r.success && r.eventId)
        .map((r, index) => ({
          eventId: r.eventId!,
          title: events.contentEvents[index]?.title || `Note ${index + 1}`,
        }));

      // Extract failed events with their titles and errors
      const failedEvents = results
        .map((r, index) => ({ result: r, index }))
        .filter(({ result }) => !result.success)
        .map(({ result, index }) => ({
          title: events.contentEvents[index]?.title || `Note ${index + 1}`,
          error: result.error || "Unknown error",
          sectionIndex: index,
        }));

      publishResults = {
        successCount,
        total: results.length,
        errors,
        successfulEvents,
        failedEvents,
      };

      // Show summary
      console.log("\n=== Events Summary ===");
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
    } catch (error) {
      console.error("Publishing failed:", error);
      publishResults = {
        successCount: 0,
        total: 0,
        errors: [error instanceof Error ? error.message : "Unknown error"],
        successfulEvents: [],
        failedEvents: [],
      };
    }

    isPublishing = false;
  }

  async function retryFailedEvent(sectionIndex: number) {
    if (!publishResults) return;

    // Find the failed event to retry
    const failedEvent = publishResults.failedEvents.find(
      (event) => event.sectionIndex === sectionIndex
    );
    
    if (!failedEvent) return;

    isPublishing = true;

    try {
      // Retry publishing the failed content
      // Note: This is a simplified retry - in production you'd want to store the original event data
      // For now, we'll just show an error message
      console.error("Retry not implemented - would need to store original event data");
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
      onPublishArticle={handlePublishArticle}
      onPublishScatteredNotes={handlePublishScatteredNotes}
    />

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
        </Alert>
      {/if}
    {/if}
  </div>
</div>
