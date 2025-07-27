<script lang="ts">
  import { Textarea, Button } from "flowbite-svelte";
  import { EyeOutline } from "flowbite-svelte-icons";
  import {
    parseAsciiDocSections,
    type ZettelSection,
  } from "$lib/utils/ZettelParser";
  import asciidoctor from "asciidoctor";

  // Component props
  let {
    content = "",
    placeholder = `== Note Title
:author: {author} // author is optional
:tags: tag1, tag2, tag3 // tags are optional

note content here...

== Note Title 2
:tags: tag1, tag2, tag3
Note content here...
    `,
    showPreview = false,
    onContentChange = (content: string) => {},
    onPreviewToggle = (show: boolean) => {},
  } = $props<{
    content?: string;
    placeholder?: string;
    showPreview?: boolean;
    onContentChange?: (content: string) => void;
    onPreviewToggle?: (show: boolean) => void;
  }>();

  // Initialize AsciiDoctor processor
  const asciidoctorProcessor = asciidoctor();

  // Parse sections for preview
  let parsedSections = $derived(parseAsciiDocSections(content, 2));

  // Toggle preview panel
  function togglePreview() {
    const newShowPreview = !showPreview;
    onPreviewToggle(newShowPreview);
  }

  // Handle content changes
  function handleContentChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    onContentChange(target.value);
  }
</script>

<div class="flex flex-col space-y-4">
  <!-- Informative text about ZettelEditor purpose -->
  <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
    <div class="flex items-start space-x-3">
      <div class="flex-shrink-0">
        <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
        </svg>
      </div>
      <div class="flex-1">
        <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
          Note-Taking Tool
        </h3>
        <p class="text-sm text-blue-700 dark:text-blue-300 mb-3">
          This editor is for creating individual notes (30041 events) only. Each section becomes a separate note event.
          To create structured publications with a 30040 index event that ties multiple notes together, 
          use the <a href="/events?kind=30040" class="font-medium underline hover:text-blue-600 dark:hover:text-blue-400">Events form</a>.
        </p>
        <div class="flex space-x-2">
          <a 
            href="/events?kind=30040" 
            class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
          >
            Create Publication
          </a>
        </div>
      </div>
    </div>
  </div>

  <div class="flex items-center justify-between">
    <Button
      color="light"
      size="sm"
      on:click={togglePreview}
      class="flex items-center space-x-1"
    >
      {#if showPreview}
        <EyeOutline class="w-4 h-4" />
        <span>Hide Preview</span>
      {:else}
        <EyeOutline class="w-4 h-4" />
        <span>Show Preview</span>
      {/if}
    </Button>
  </div>

  <div class="flex space-x-4 {showPreview ? 'h-96' : ''}">
    <!-- Editor Panel -->
    <div class="{showPreview ? 'w-1/2' : 'w-full'} flex flex-col space-y-4">
      <div class="flex-1">
        <Textarea
          bind:value={content}
          on:input={handleContentChange}
          {placeholder}
          class="h-full min-h-64 resize-none"
          rows={12}
        />
      </div>
    </div>

    <!-- Preview Panel -->
    {#if showPreview}
      <div class="w-1/2 border-l border-gray-200 dark:border-gray-700 pl-4">
        <div class="sticky top-4">
          <h3
            class="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100"
          >
            AsciiDoc Preview
          </h3>

          <div
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-h-80 overflow-y-auto"
          >
            {#if !content.trim()}
              <div class="text-gray-500 dark:text-gray-400 text-sm">
                Start typing to see the preview...
              </div>
            {:else}
              <div class="prose prose-sm dark:prose-invert max-w-none">
                {#each parsedSections as section, index}
                  <div class="mb-6">
                    <div
                      class="text-sm text-gray-800 dark:text-gray-200 asciidoc-content"
                    >
                      {@html asciidoctorProcessor.convert(
                        `== ${section.title}\n\n${section.content}`,
                        {
                          standalone: false,
                          doctype: "article",
                          attributes: {
                            showtitle: true,
                            sectids: true,
                          },
                        },
                      )}
                    </div>

                    {#if index < parsedSections.length - 1}
                      <!-- Gray area with tag bubbles above event boundary -->
                      <div class="my-4 relative">
                        <!-- Gray background area -->
                        <div
                          class="bg-gray-200 dark:bg-gray-700 rounded-lg p-3 mb-2"
                        >
                          <div class="flex flex-wrap gap-2 items-center">
                            {#if section.tags && section.tags.length > 0}
                              {#each section.tags as tag}
                                <div
                                  class="bg-amber-900 text-amber-100 px-2 py-1 rounded-full text-xs font-medium flex items-baseline"
                                >
                                  <span class="font-mono">{tag[0]}:</span>
                                  <span>{tag[1]}</span>
                                </div>
                              {/each}
                            {:else}
                              <span
                                class="text-gray-500 dark:text-gray-400 text-xs italic"
                                >No tags</span
                              >
                            {/if}
                          </div>
                        </div>

                        <!-- Event boundary line -->
                        <div
                          class="border-t-2 border-dashed border-blue-400 relative"
                        >
                          <div
                            class="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs font-medium"
                          >
                            Event Boundary
                          </div>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <div
                class="mt-4 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-2 rounded border"
              >
                <strong>Event Count:</strong>
                {parsedSections.length} event{parsedSections.length !== 1
                  ? "s"
                  : ""}
                <br />
                <strong>Note:</strong> Currently only the first event will be published.
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
