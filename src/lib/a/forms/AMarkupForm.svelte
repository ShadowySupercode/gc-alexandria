<script lang="ts">
  /**
   * @fileoverview AMarkupForm Component - Alexandria
   *
   * A comprehensive form component for creating content with subject/title and rich markup body.
   * Provides advanced markup editing with preview, confirmation dialogs, and form management.
   *
   * @component
   * @category Forms
   *
   * @prop {string} [subject=""] - The content title/subject (bindable)
   * @prop {string} [content=""] - The main content body (bindable)
   * @prop {boolean} [isSubmitting=false] - Whether form is currently submitting
   * @prop {number} [clearSignal=0] - Signal to clear form (increment to trigger clear)
   * @prop {(subject: string, content: string) => Promise<void>} [onSubmit] - Submit callback
   *
   * @example
   * ```svelte
   * <AMarkupForm
   *   bind:subject={title}
   *   bind:content={body}
   *   {isSubmitting}
   *   onSubmit={handlePublish}
   * />
   * ```
   *
   * @example Basic markup form
   * ```svelte
   * <AMarkupForm
   *   bind:subject={articleTitle}
   *   bind:content={articleContent}
   *   onSubmit={publishArticle}
   * />
   * ```
   *
   * @example Form with clear signal control
   * ```svelte
   * <AMarkupForm
   *   bind:subject={title}
   *   bind:content={body}
   *   clearSignal={resetCounter}
   *   isSubmitting={publishing}
   *   onSubmit={handleSubmit}
   * />
   * ```
   *
   * @features
   * - Subject/title input field
   * - Advanced markup editor with preview
   * - Clear form functionality with confirmation dialog
   * - Form validation and submission states
   * - Integration with advanced markup parser
   * - Responsive layout with proper spacing
   *
   * @accessibility
   * - Proper form labels and structure
   * - Keyboard accessible controls
   * - Screen reader friendly
   * - Modal dialogs with focus management
   * - Clear form validation feedback
   */

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
