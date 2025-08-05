<script lang="ts">
  import { Textarea, Button } from "flowbite-svelte";
  import { EyeOutline } from "flowbite-svelte-icons";
  import {
  extractSmartMetadata,
  parseAsciiDocWithMetadata,
  parseAsciiDocIterative,
  generateNostrEvents,
  detectContentType,
  type AsciiDocMetadata,
  metadataToTags,
} from "$lib/utils/asciidoc_metadata";
import asciidoctor from "asciidoctor";

  // Component props
  let {
    content = "",
    placeholder = `// ITERATIVE PARSING - Choose your publishing level:
// Level 2: Only == sections become events (containing === and deeper)
// Level 3: == sections become indices, === sections become events
// Level 4: === sections become indices, ==== sections become events

= Understanding Knowledge
:image: https://i.nostr.build/IUs0xNyUEf5hXTFL.jpg
:published: 2025-04-21
:tags: knowledge, philosophy, education
:type: text

== Preface
:tags: introduction, preface

This essay outlines the purpose of Alexandria...

== Introduction: Knowledge as a Living Ecosystem
:tags: introduction, ecosystem

Knowledge exists as dynamic representations...

=== Why Investigate the Nature of Knowledge?
:difficulty: intermediate

Understanding the nature of knowledge itself...

==== The Four Perspectives
:complexity: high

1. Material Cause: The building blocks...
    `,
    showPreview = false,
    parseLevel = 2,
    onContentChange = (content: string) => {},
    onPreviewToggle = (show: boolean) => {},
    onPublishArticle = (events: any) => {},
    onPublishScatteredNotes = (events: any) => {},
  } = $props<{
    content?: string;
    placeholder?: string;
    showPreview?: boolean;
    parseLevel?: number;
    onContentChange?: (content: string) => void;
    onPreviewToggle?: (show: boolean) => void;
    onPublishArticle?: (events: any) => void;
    onPublishScatteredNotes?: (events: any) => void;
  }>();

  // Parse content using iterative parsing
  let parsedContent = $derived.by(() => {
    if (!content.trim()) return null;
    
    try {
      // Use iterative parsing with selected level
      const parsed = parseAsciiDocIterative(content, parseLevel);
      
      // Debug logging
      console.log("Iterative parsed content:", parsed);
      
      return parsed;
    } catch (error) {
      console.error("Parsing error:", error);
      return null;
    }
  });

  // Generate events from parsed content
  let generatedEvents = $derived.by(() => {
    if (!parsedContent) return null;
    
    try {
      const events = generateNostrEvents(parsedContent, parseLevel);
      console.log("Generated events:", events);
      return events;
    } catch (error) {
      console.error("Event generation error:", error);
      return null;
    }
  });

  // Detect content type for smart publishing
  let contentType = $derived.by(() => {
    return detectContentType(content);
  });

  // Parse sections for preview display
  let parsedSections = $derived.by(() => {
    if (!parsedContent) return [];
    
    return parsedContent.sections.map((section: { metadata: AsciiDocMetadata; content: string; title: string }) => {
      const tags = metadataToTags(section.metadata);
      
      return {
        title: section.title || "Untitled",
        content: section.content.trim(),
        tags,
      };
    });
  });

  // Publishing handlers
  function handlePublish() {
    if (!generatedEvents) return;
    
    if (contentType === 'article' && generatedEvents.indexEvent) {
      // Full article: publish both index event (30040) and content events (30041)
      onPublishArticle(generatedEvents);
    } else if (contentType === 'scattered-notes') {
      // Only notes: publish just the content events (30041)
      const notesOnly = {
        contentEvents: generatedEvents.contentEvents
      };
      onPublishScatteredNotes(notesOnly);
    }
  }

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
  <!-- Smart Publishing Interface -->
  <div class="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <h3 class="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
          Unified AsciiDoc Publisher
        </h3>
        <div class="flex items-center space-x-4 mb-3">
          <div class="flex items-center space-x-2">
            <label for="parse-level" class="text-xs text-gray-600 dark:text-gray-400 font-medium">Parse Level:</label>
            <select 
              id="parse-level"
              bind:value={parseLevel}
              class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value={2}>Level 2 (== sections → events)</option>
              <option value={3}>Level 3 (== → indices, === → events)</option>
              <option value={4}>Level 4 (=== → indices, ==== → events)</option>
            </select>
          </div>
          
          <div class="text-xs text-gray-600 dark:text-gray-400">
            <span class="font-medium">Content Type:</span>
            <span class="ml-1 px-2 py-0.5 rounded-full text-xs font-medium {
              contentType === 'article' ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200' :
              contentType === 'scattered-notes' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200' :
              'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }">
              {contentType === 'article' ? 'Article' : contentType === 'scattered-notes' ? 'Notes' : 'None'}
            </span>
          </div>
          
          {#if generatedEvents}
            <div class="text-xs text-gray-600 dark:text-gray-400">
              <span class="font-medium">Events:</span>
              <span class="ml-1">{generatedEvents.contentEvents.length + (generatedEvents.indexEvent ? 1 : 0)}</span>
            </div>
          {/if}
        </div>
        
        <!-- Unified Publishing Button -->
        <div class="flex space-x-2">
          {#if generatedEvents && contentType !== 'none'}
            <Button
              color={contentType === 'article' ? 'blue' : 'green'}
              size="sm"
              on:click={handlePublish}
              class="flex items-center space-x-1"
            >
              {#if contentType === 'article'}
                <span>📚 Publish Article</span>
                <span class="text-xs opacity-75">({generatedEvents.contentEvents.length + 1} events)</span>
              {:else}
                <span>📝 Publish Notes</span>
                <span class="text-xs opacity-75">({generatedEvents.contentEvents.length} events)</span>
              {/if}
            </Button>
          {:else}
            <div class="text-xs text-gray-500 dark:text-gray-400 italic">
              Add content to enable publishing
            </div>
          {/if}
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
                      {@html asciidoctor().convert(
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

                    <!-- Gray area with tag bubbles for all sections -->
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

                      {#if index < parsedSections.length - 1}
                        <!-- Event boundary line only between sections -->
                        <div
                          class="border-t-2 border-dashed border-blue-400 relative"
                        >
                          <div
                            class="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs font-medium"
                          >
                            Event Boundary
                          </div>
                        </div>
                      {/if}
                    </div>
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
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
