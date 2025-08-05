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
  parseSimpleAttributes,
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

  // Helper function to get section level from content
  function getSectionLevel(sectionContent: string): number {
    const lines = sectionContent.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^(=+)\s+/);
      if (match) {
        return match[1].length;
      }
    }
    return 2; // Default to level 2
  }

  // Parse sections for preview display
  let parsedSections = $derived.by(() => {
    if (!parsedContent) return [];
    
    return parsedContent.sections.map((section: { metadata: AsciiDocMetadata; content: string; title: string }) => {
      // Use simple parsing directly on section content for accurate tag extraction
      const tags = parseSimpleAttributes(section.content);
      const level = getSectionLevel(section.content);
      
      return {
        title: section.title || "Untitled",
        content: section.content.trim(),
        tags,
        level,
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

    <!-- Smart Publishing Button -->
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

  <div class="flex space-x-6 h-96">
    <!-- Editor Panel -->
    <div class="{showPreview ? 'w-1/2' : 'w-full'} flex flex-col">
      <div class="flex-1 relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <Textarea
          bind:value={content}
          on:input={handleContentChange}
          {placeholder}
          class="w-full h-full resize-none font-mono text-sm leading-relaxed p-4 bg-white dark:bg-gray-900 border-none outline-none"
        />
      </div>
    </div>

    <!-- Preview Panel -->
    {#if showPreview}
      <div class="w-1/2 flex flex-col">
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg h-full flex flex-col overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              AsciiDoc Preview
            </h3>
          </div>

          <div class="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900">
            {#if !content.trim()}
              <div class="text-gray-500 dark:text-gray-400 text-sm text-center py-8">
                Start typing to see the preview...
              </div>
            {:else}
              <!-- Show document title and tags for articles -->
              {#if contentType === 'article' && parsedContent?.title}
                <div class="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    {parsedContent.title}
                  </h1>
                  <!-- Document-level tags -->
                  {#if parsedContent.content}
                    {@const documentTags = parseSimpleAttributes(parsedContent.content)}
                    {#if documentTags.filter(tag => tag[0] === 't').length > 0}
                      <div class="flex flex-wrap gap-2">
                        {#each documentTags.filter(tag => tag[0] === 't') as tag}
                          <span class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
                            #{tag[1]}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
              
              {#snippet previewContent()}
                {@const levelColors = {
                  2: 'bg-red-400', 
                  3: 'bg-blue-400',
                  4: 'bg-green-400',
                  5: 'bg-yellow-400',
                  6: 'bg-purple-400'
                } as Record<number, string>}
                
                <!-- Calculate continuous indent guides that span multiple sections -->
                {@const maxLevel = Math.max(...parsedSections.map(s => s.level))}
                {@const guideLevels = Array.from({length: maxLevel - 1}, (_, i) => i + 2)}
                
                {@const minLevel = Math.min(...parsedSections.map(s => s.level))}
                {@const maxIndentLevel = Math.max(...parsedSections.map(s => Math.max(0, s.level - minLevel)))}
                {@const containerPadding = 24}
                
                <div class="prose prose-sm dark:prose-invert max-w-none relative" style="padding-left: {containerPadding}px;">

                {#each parsedSections as section, index}
                  {#snippet sectionContent()}
                    {@const indentLevel = Math.max(0, section.level - 2)}
                    {@const currentColor = levelColors[section.level] || 'bg-gray-500'}
                    
                    <div class="mb-12 relative" style="margin-left: {indentLevel * 24 - containerPadding}px; padding-left: 12px;">
                      <!-- Current level highlight guide -->
                      <div 
                        class="absolute top-0 w-1.5 {currentColor} opacity-60"
                        style="left: {-4}px; height: 100%;"
                      ></div>
                    
                      <!-- Section content -->
                      <div class="prose-content">
                        {@html asciidoctor().convert(
                          `${'='.repeat(section.level)} ${section.title}\n\n${section.content}`,
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

                      <!-- Tags -->
                      {#if section.tags && section.tags.filter(tag => tag[0] === 't').length > 0}
                        <div class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                          <div class="flex flex-wrap gap-2">
                            {#each section.tags.filter(tag => tag[0] === 't') as tag}
                              <span class="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-2 py-1 rounded text-xs">
                                #{tag[1]}
                              </span>
                            {/each}
                          </div>
                        </div>
                      {/if}

                      <!-- Event boundary indicator -->
                      {#if index < parsedSections.length - 1}
                        <div class="mt-8 pt-4 border-t border-dashed border-gray-300 dark:border-gray-600 relative">
                          <div class="absolute -top-2.5 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-900 px-2">
                            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">Event Boundary</span>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/snippet}
                  {@render sectionContent()}
                  {/each}
                </div>

                <!-- Event count summary -->
                <div class="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div class="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded">
                    <strong>Total Events:</strong> {parsedSections.length + (contentType === 'article' ? 1 : 0)}
                    ({contentType === 'article' ? '1 index + ' : ''}{parsedSections.length} content)
                  </div>
                </div>
              {/snippet}
              {@render previewContent()}
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
