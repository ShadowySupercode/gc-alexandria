<script lang="ts">
  import { Label, Input, Button, Modal } from "flowbite-svelte";
  import { parseAdvancedmarkup } from "$lib/utils/markup/advancedMarkupParser";
  import { ATextareaWithPreview } from "$lib/a/index.ts";
  import { getNdkContext } from "$lib/ndk.ts";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";

  let {
    subject = $bindable(""),
    content = $bindable(""),
    isSubmitting = false,
    clearSignal = 0,
    onSubmit = async (_subject: string, _content: string) => {},
  } = $props<{
    subject?: string;
    content?: string;
    isSubmitting?: boolean;
    clearSignal?: number;
    onSubmit?: (subject: string, content: string) => Promise<void> | void;
  }>();

  // Local UI state
  let showConfirmDialog = $state(false);

  // Track last clear signal to avoid clearing on mount if default matches
  let _lastClearSignal = $state<number | null>(null);
  $effect(() => {
    if (clearSignal !== _lastClearSignal) {
      if (_lastClearSignal !== null) {
        subject = "";
        content = "";
      }
      _lastClearSignal = clearSignal;
    }
  });

  function clearForm() {
    subject = "";
    content = "";
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    showConfirmDialog = true;
  }

  async function confirmSubmit() {
    showConfirmDialog = false;
    await onSubmit(subject.trim(), content.trim());
  }

  function cancelSubmit() {
    showConfirmDialog = false;
  }

  let ndk = getNdkContext();
</script>

<form class="space-y-4" onsubmit={handleSubmit} autocomplete="off">
  <div>
    <Label for="subject" class="mb-2">Subject</Label>
    <Input
      id="subject"
      class="w-full"
      placeholder="Issue subject"
      bind:value={subject}
      required
      autofocus
    />
  </div>

  <div class="relative">
    <ATextareaWithPreview
      id="content"
      label="Description"
      bind:value={content}
      placeholder="Describe your issue. Use the Eye toggle to preview rendered markup."
      parser={parseAdvancedmarkup}
      previewSnippet={basicMarkup}
      previewArg={ndk}
    />
  </div>

  <div class="flex justify-end space-x-4">
    <Button type="button" color="alternative" onclick={clearForm}
      >Clear Form</Button
    >
    <Button type="submit" tabindex={0} disabled={isSubmitting}>
      {#if isSubmitting}
        Submitting...
      {:else}
        Submit Issue
      {/if}
    </Button>
  </div>
</form>

<!-- Confirmation Dialog -->
<Modal bind:open={showConfirmDialog} size="sm" autoclose={false} class="w-full">
  <div class="text-center">
    <h3 class="mb-5 text-lg font-normal text-gray-700 dark:text-gray-300">
      Would you like to submit the issue?
    </h3>
    <div class="flex justify-center gap-4">
      <Button color="alternative" onclick={cancelSubmit}>Cancel</Button>
      <Button color="primary" onclick={confirmSubmit}>Submit</Button>
    </div>
  </div>
</Modal>
