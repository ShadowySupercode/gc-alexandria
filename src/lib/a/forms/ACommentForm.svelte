<script lang="ts">
  import { Button, Label } from "flowbite-svelte";
  import { userStore } from "$lib/stores/userStore.ts";
  import { parseBasicMarkup } from "$lib/utils/markup/basicMarkupParser.ts";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";
  import { getNdkContext } from "$lib/ndk.ts";
  import { ATextareaWithPreview } from "$lib/a/index.ts";

  const ndk = getNdkContext();

  let {
    // make content bindable
    content = $bindable(""),
    extensions,
    isSubmitting = false,
    onSubmit = () => {},
  } = $props<{
    content?: string;
    extensions?: any;
    isSubmitting?: boolean;
    onSubmit?: (content: string) => Promise<void>;
  }>();

  function clearForm() {
    content = "";
  }

  function removeFormatting() {
    content = content
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/^>\s*/gm, "")
      .replace(/^[-*]\s*/gm, "")
      .replace(/^\d+\.\s*/gm, "")
      .replace(/#(\w+)/g, "$1");
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    await onSubmit(content.trim());
  }
</script>

<form novalidate onsubmit={handleSubmit}>
  <Label for="editor" class="sr-only">Comment</Label>

  <ATextareaWithPreview
    id="editor"
    label=""
    rows={10}
    bind:value={content}
    placeholder="Write a comment"
    parser={parseBasicMarkup}
    previewRenderer={(html) => basicMarkup(html, ndk)}
    {extensions}
  />

  <div class="flex flex-row justify-between mt-2">
    <div class="flex flex-row flex-wrap gap-3 !m-0">
      <Button size="xs" color="alternative" onclick={removeFormatting} class="!m-0">Remove Formatting</Button>
      <Button size="xs" color="alternative" class="!m-0" onclick={clearForm}>Clear</Button>
    </div>
    <Button
      disabled={isSubmitting || !content.trim() || !$userStore.signedIn}
      type="submit"
    >
      {#if !$userStore.signedIn}
        Not Signed In
      {:else if isSubmitting}
        Publishing...
      {:else}
        Post Comment
      {/if}
    </Button>
  </div>
</form>
