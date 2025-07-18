<script lang='ts'>
  import { Heading, Button, Alert } from "flowbite-svelte";
  import { PaperPlaneOutline } from "flowbite-svelte-icons";
  import ZettelEditor from '$lib/components/ZettelEditor.svelte';
  import { goto } from "$app/navigation";
  import { nip19 } from "nostr-tools";
  import { publishZettel } from '$lib/services/publisher';

  let content = $state('');
  let showPreview = $state(false);
  let isPublishing = $state(false);
  let publishResult = $state<{ success: boolean; eventId?: string; error?: string } | null>(null);

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
    publishResult = null;

    const result = await publishZettel({
      content,
      onSuccess: (eventId) => {
        publishResult = { success: true, eventId };
        const nevent = nip19.neventEncode({ id: eventId });
        goto(`/events?id=${nevent}`);
      },
      onError: (error) => {
        publishResult = { success: false, error };
      }
    });

    isPublishing = false;
  }
</script>

<svelte:head>
  <title>Compose Note - Alexandria</title>
</svelte:head>

<!-- Main container with 75% width and centered -->
<div class="w-3/4 mx-auto">
  <div class="flex flex-col space-y-4">
    <Heading tag="h1" class="text-2xl font-bold text-gray-900 dark:text-gray-100">
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
    {#if publishResult}
      {#if publishResult.success}
        <Alert color="green" dismissable>
          <span class="font-medium">Success!</span> 
          Event published successfully. Event ID: {publishResult.eventId}
        </Alert>
      {:else}
        <Alert color="red" dismissable>
          <span class="font-medium">Error!</span> 
          {publishResult.error}
        </Alert>
      {/if}
    {/if}
  </div>
</div>
