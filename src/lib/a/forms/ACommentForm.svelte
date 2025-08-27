<script lang="ts">
  import { Textarea, Toolbar, ToolbarGroup, ToolbarButton, Button, Label, P } from "flowbite-svelte";
  import {
    Bold, Italic, Strikethrough,
    Quote, Link2, Image, Hash,
    List, ListOrdered
  } from "@lucide/svelte";
  import { userStore } from "$lib/stores/userStore.ts";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser.ts";

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

  let preview = $state("");

  const markupButtons = [
    { label: "Bold", icon: Bold, action: () => insertMarkup("**", "**") },
    { label: "Italic", icon: Italic, action: () => insertMarkup("_", "_") },
    { label: "Strike", icon: Strikethrough, action: () => insertMarkup("~~", "~~") },
    { label: "Link", icon: Link2, action: () => insertMarkup("[", "](url)") },
    { label: "Image", icon: Image,  action: () => insertMarkup("![", "](url)") },
    { label: "Quote", icon: Quote, action: () => insertMarkup("> ", "") },
    { label: "List", icon: List, action: () => insertMarkup("* ", "") },
    { label: "Numbered List", icon: ListOrdered,  action: () => insertMarkup("1. ", "") },
    { label: "Hashtag", icon: Hash, action: () => insertMarkup("#", "") },
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

  $effect(() => {
    console.log("Content changed, updating preview...");
    if (content.trim() === "") {
      preview = "";
      return;
    }

    parseBasicmarkup(content).then((html) => {
      preview = html;
    });
  });
</script>


<form novalidate
      onsubmit={handleSubmit}>
  <Label for="editor" class="sr-only">Comment</Label>
  <Textarea id="editor" rows={10}
            bind:value={content}
            class="!m-0 p-4"
            innerClass="!m-0 !bg-transparent"
            headerClass="!m-0 !bg-transparent"
            footerClass="!m-0 !bg-transparent"
            addonClass="!m-0 top-3 hidden md:flex"
            textareaClass="!m-0 !bg-transparent !border-0 !rounded-none !shadow-none !focus:ring-0"
            placeholder="Write a comment">
    {#snippet header()}
      <Toolbar embedded class="flex-row !m-0">
        <ToolbarGroup class="flex-row flex-wrap !m-0">
          {#each markupButtons as button}
            {#if button.icon}
              {@const TheIcon = button.icon}
              <ToolbarButton title={button.label} color="dark" size="md" onclick={button.action} >
                <TheIcon size={24} />
              </ToolbarButton>
            {:else}
              <ToolbarButton onclick={button.action}>{button.label}</ToolbarButton>
            {/if}
          {/each}
          {@render extensions()}
        </ToolbarGroup>
      </Toolbar>
    {/snippet}
    {#snippet footer()}
      <div class="flex flex-row justify-between">
          <div class="flex flex-row flex-wrap gap-3 !m-0">
            <Button size="xs" color="alternative" onclick={removeFormatting} class="!m-0">Remove Formatting</Button>
            <Button size="xs" color="alternative" class="!m-0" onclick={clearForm}>Clear</Button>
          </div>
        <Button
          disabled={isSubmitting || !content.trim() || !$userStore.signedIn}
          type="submit">
          {#if !$userStore.signedIn}
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

<div class="prose dark:prose-invert max-w-none p-4 border border-primary-500 border-s-4 rounded-lg">
  {#if preview}
    {@html preview}
  {:else}
    <P class="text-xs text-gray-500">Preview will appear here...</P>
  {/if}
</div>