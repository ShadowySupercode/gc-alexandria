<script lang="ts">
  import { Heading, Button, Alert } from "flowbite-svelte";
  import { PaperPlaneOutline } from "flowbite-svelte-icons";
  import ZettelEditor from "$lib/components/ZettelEditor.svelte";
  import { goto } from "$app/navigation";
  import { nip19 } from "nostr-tools";
  import { publishMultipleZettels } from "$lib/services/publisher";

  let content = $state("");
  let showPreview = $state(false);
  let isPublishing = $state(false);
  let publishResults = $state<{
    successCount: number;
    total: number;
    errors: string[];
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
        publishResults = { successCount: 0, total: 0, errors: [error] };
      },
    });

    const successCount = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success && r.error).map(r => r.error!);
    publishResults = {
      successCount,
      total: results.length,
      errors,
    };
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
        </Alert>
      {:else}
        <Alert color="red" dismissable>
          <span class="font-medium">Some events failed to publish.</span>
          {publishResults.successCount} of {publishResults.total} events published.<br />
          {#each publishResults.errors as error}
            <div>{error}</div>
          {/each}
        </Alert>
      {/if}
    {/if}
  </div>
</div>
