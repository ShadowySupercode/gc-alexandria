<script lang="ts">
  import { Textarea, Toolbar, ToolbarGroup, ToolbarButton, Label, Button } from "flowbite-svelte";
  import { Bold, Italic, Strikethrough, Quote, Link2, Image, Hash, List, ListOrdered, Eye, EyeClosed } from "@lucide/svelte";

  // Reusable editor with toolbar (from ACommentForm) and toolbar-only Preview
  let {
    value = $bindable(""),
    id = "editor",
    label = "",
    rows = 10,
    placeholder = "",
    // async parser that returns HTML string
    parser = async (s: string) => s,
    // optional snippet renderer (e.g., (html) => basicMarkup(html, ndk))
    previewRenderer,
    // extra toolbar extensions (snippet returning toolbar buttons)
    extensions,
  } = $props<{
    value?: string;
    id?: string;
    label?: string;
    rows?: number;
    placeholder?: string;
    parser?: (s: string) => Promise<string> | string;
    previewRenderer?: (html: string) => any;
    extensions?: any;
  }>();

  let preview = $state("");
  let activeTab = $state<"write" | "preview">("write");
  let wrapper: HTMLElement | null = null;
  let isExpanded = $state(false);

  const markupButtons = [
    { label: "Bold", icon: Bold, action: () => insertMarkup("**", "**") },
    { label: "Italic", icon: Italic, action: () => insertMarkup("_", "_") },
    { label: "Strike", icon: Strikethrough, action: () => insertMarkup("~~", "~~") },
    { label: "Link", icon: Link2, action: () => insertMarkup("[", "](url)") },
    { label: "Image", icon: Image, action: () => insertMarkup("![", "](url)") },
    { label: "Quote", icon: Quote, action: () => insertMarkup("> ", "") },
    { label: "List", icon: List, action: () => insertMarkup("* ", "") },
    { label: "Numbered List", icon: ListOrdered, action: () => insertMarkup("1. ", "") },
    { label: "Hashtag", icon: Hash, action: () => insertMarkup("#", "") },
  ];

  function insertMarkup(prefix: string, suffix: string) {
    const textarea = wrapper?.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    value = value.substring(0, start) + prefix + selectedText + suffix + value.substring(end);

    // Set cursor position after the inserted markup
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + prefix.length + selectedText.length + suffix.length;
    }, 0);
  }

  function togglePreview() {
    activeTab = activeTab === "write" ? "preview" : "write";
  }

  function toggleSize() {
    isExpanded = !isExpanded;
  }

  $effect(() => {
    if (activeTab !== "preview") return;
    const src = value.trim();
    if (!src) {
      preview = "";
      return;
    }
    Promise.resolve(parser(src)).then((html) => {
      preview = html || "";
    });
  });
</script>

{#if label}
  <Label for={id} class="mb-2">{label}</Label>
{/if}

<div bind:this={wrapper} class="rounded-lg">
  <div class="min-h-[180px] relative">
    {#if activeTab === 'write'}
      <div class="inset-0">
        <Textarea
          id={id}
          rows={isExpanded ? 30 : rows}
          bind:value={value}
          class="!m-0 p-0 h-full"
          innerClass="!m-0 !bg-transparent !dark:bg-transparent"
          headerClass="!m-0 !bg-transparent !dark:bg-transparent"
          footerClass="!m-0 !bg-transparent"
          addonClass="!m-0 top-3 hidden md:flex"
          textareaClass="!m-0 !bg-transparent !dark:bg-transparent !border-0 !rounded-none !shadow-none !focus:ring-0"
          placeholder={placeholder}
        >
          {#snippet header()}
            <Toolbar embedded class="flex-row !m-0 !dark:bg-transparent !bg-transparent">
              <ToolbarGroup class="flex-row flex-wrap !m-0">
                {#each markupButtons as button}
                  {@const TheIcon = button.icon}
                  <ToolbarButton title={button.label} color="dark" size="md" onclick={button.action}>
                    <TheIcon size={24} />
                  </ToolbarButton>
                {/each}
                {#if extensions}
                  {@render extensions()}
                {/if}
                <ToolbarButton title="Toggle preview" color="dark" size="md" onclick={togglePreview}>
                  <Eye size={24} />
                </ToolbarButton>
              </ToolbarGroup>
            </Toolbar>
          {/snippet}
        </Textarea>
        <Button
          type="button"
          size="xs"
          class="absolute bottom-2 right-2 z-10 opacity-60 hover:opacity-100"
          color="light"
          onclick={toggleSize}
        >
          {isExpanded ? "⌃" : "⌄"}
        </Button>
      </div>
    {:else}
      <div class="absolute rounded-lg inset-0 flex flex-col bg-white">
        <div class="py-2 px-3 border-gray-200 dark:border-gray-500 border-b">
          <Toolbar embedded class="flex-row !m-0 !dark:bg-transparent !bg-transparent">
            <ToolbarGroup class="flex-row flex-wrap !m-0">
              <ToolbarButton title="Back to editor" color="dark" size="md" onclick={togglePreview}>
                <EyeClosed size={24} />
              </ToolbarButton>
            </ToolbarGroup>
          </Toolbar>
        </div>
        <div class="flex-1 overflow-auto px-4 max-w-none bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 prose-content markup-content rounded-b-lg">
          {#if preview}
            {#if previewRenderer}
              {@render previewRenderer(preview)}
            {:else}
              {@html preview}
            {/if}
          {:else}
            <p class="text-xs text-gray-500">Nothing to preview</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
