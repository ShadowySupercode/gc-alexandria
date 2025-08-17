<script lang="ts">
  import { Textarea, Toolbar, ToolbarGroup, ToolbarButton, Button, Label } from "flowbite-svelte";
  import {
    LetterBoldOutline,
    LetterItalicOutline
  } from "flowbite-svelte-icons";
  import { userPubkey } from "$lib/stores/authStore.Svelte";

  let {
    content = "",
    extensions,
    profile,
    isSubmitting = false,
    onSubmit = () => {}
  } = $props<{
    content?: string;
    extensions?: any;
    profile?: any;
    isSubmitting?: boolean;
    onSubmit?: (content: string) => Promise<void>;
  }>();

  const markupButtons = [
    { label: "Bold", icon: LetterBoldOutline, action: () => insertMarkup("**", "**") },
    { label: "Italic", icon: LetterItalicOutline, action: () => insertMarkup("_", "_") },
    { label: "Strike", action: () => insertMarkup("~~", "~~") },
    { label: "Link", action: () => insertMarkup("[", "](url)") },
    { label: "Image", action: () => insertMarkup("![", "](url)") },
    { label: "Quote", action: () => insertMarkup("> ", "") },
    { label: "List", action: () => insertMarkup("* ", "") },
    { label: "Numbered List", action: () => insertMarkup("1. ", "") },
    { label: "Hashtag", action: () => insertMarkup("#", "") },
    ];

  function insertMarkup(prefix: string, suffix: string) {
    const textarea = document.querySelector("textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    content =
      content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      content.substring(end);

    // Set cursor position after the inserted markup
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd =
        start + prefix.length + selectedText.length + suffix.length;
    }, 0);
  }

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
  <Textarea id="editor" rows={8}
            bind:value={content}
            class="!m-0 p-4"
            innerClass="!m-0 !bg-transparent"
            headerClass="!m-0 !bg-transparent"
            footerClass="!m-0 !bg-transparent"
            addonClass="!m-0 top-3"
            textareaClass="!m-0 !bg-transparent !border-0 !rounded-none !shadow-none !focus:ring-0"
            placeholder="Write a comment">
    {#snippet header()}
      <Toolbar embedded class="flex-row !m-0">
        <ToolbarGroup class="flex-row !m-0">
          {#each markupButtons as button}
            {#if button.icon}
              {@const TheIcon = button.icon}
              <ToolbarButton size="xs" onclick={button.action} >
                <TheIcon />
              </ToolbarButton>
            {:else}
              <ToolbarButton onclick={button.action}>{button.label}</ToolbarButton>
            {/if}
          {/each}
          {@render extensions()}
        </ToolbarGroup>
      </Toolbar>
    {/snippet}
    {#snippet addon()}
      {@render profile()}
    {/snippet}
    {#snippet footer()}
      <div class="flex flex-row justify-between">
          <div class="flex flex-row gap-3 !m-0">
            <Button size="xs" color="alternative" onclick={removeFormatting} class="!m-0">Remove Formatting</Button>
            <Button size="xs" color="alternative" class="!m-0" onclick={clearForm}>Clear</Button>
          </div>
        <Button
          disabled={isSubmitting || !content.trim() || !$userPubkey}
          type="submit">
          {#if !$userPubkey}
            Not Signed In
          {:else if isSubmitting}
            Publishing...
          {:else}
            Post Comment
          {/if}
        </Button>
      </div>
    {/snippet}
  </Textarea>
</form>
