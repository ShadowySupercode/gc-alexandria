<script lang="ts">
  import { Textarea, Button } from "flowbite-svelte";
  import { EyeOutline, QuestionCircleOutline } from "flowbite-svelte-icons";
  import {
  extractSmartMetadata,
  type AsciiDocMetadata,
  metadataToTags,
  parseSimpleAttributes,
} from "$lib/utils/asciidoc_metadata";
import { parseAsciiDocWithTree, exportEventsFromTree } from "$lib/utils/asciidoc_publication_parser";
import { getNdkContext } from "$lib/ndk";
import Asciidoctor from "asciidoctor";

  // Initialize Asciidoctor processor
  const asciidoctor = Asciidoctor();

  // Component props
  let {
    content = "",
    placeholder = "Start writing your AsciiDoc content here...",
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

  // Get NDK context for PublicationTree creation
  const ndk = getNdkContext();

  // Configuration constants
  const MIN_PARSE_LEVEL = 2;
  const MAX_PARSE_LEVEL = 5;

  // State for PublicationTree result
  let publicationResult = $state<any>(null);
  let generatedEvents = $state<any>(null);
  let contentType = $state<'article' | 'scattered-notes' | 'none'>('none');

  // Effect to create PublicationTree when content changes
  // Uses tree processor extension as Michael envisioned:
  // "register a tree processor extension in our Asciidoctor instance"
  // "use the AST that Asciidoctor generates during parsing"
  // "publication tree side-loads into memory as AsciiDoc is parsed"
  $effect(() => {
    if (!content.trim() || !ndk) {
      publicationResult = null;
      generatedEvents = null;
      contentType = 'none';
      return;
    }
    
    // Use new hierarchical tree processor for NKBIP-01 compliance  
    parseAsciiDocWithTree(content, ndk, parseLevel)
      .then(result => {
        console.log("Tree factory result:", result);
        publicationResult = result;
        contentType = result.metadata.contentType;
        
        // Export events for publishing workflow
        return exportEventsFromTree(result);
      })
      .then(events => {
        generatedEvents = events;
        
        console.log("Tree factory result:", {
          contentType,
          indexEvent: !!events.indexEvent,
          contentEvents: events.contentEvents.length,
          parseLevel: parseLevel
        });
      })
      .catch(error => {
        console.error("Tree factory error:", error);
        publicationResult = null;
        generatedEvents = null;
        contentType = 'none';
      });
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

  // Generate parse level options dynamically
  function generateParseLevelOptions(minLevel: number, maxLevel: number) {
    const options = [];
    for (let level = minLevel; level <= maxLevel; level++) {
      const equals = '='.repeat(level);
      const nextEquals = '='.repeat(level + 1);
      
      let label;
      if (level === 2) {
        label = `Level ${level} (${equals} sections → events)`;
      } else {
        const prevEquals = '='.repeat(level - 1);
        label = `Level ${level} (${prevEquals} → indices, ${equals} → events)`;
      }
      
      options.push({ level, label });
    }
    return options;
  }

  // Parse sections for preview display using PublicationTree data
  let parsedSections = $derived.by(() => {
    if (!publicationResult) return [];
    
    console.log("Preview: publicationResult structure:", {
      hasContentEvents: !!publicationResult.contentEvents,
      contentEventsLength: publicationResult.contentEvents?.length,
      keys: Object.keys(publicationResult)
    });
    
    // Convert PublicationTree events to preview format
    return publicationResult.contentEvents.map((event: any) => {
      const title = event.tags.find((t: string[]) => t[0] === 'title')?.[1] || 'Untitled';
      const tags = event.tags.filter((t: string[]) => t[0] === 't');
      
      return {
        title,
        content: event.content,
        tags, // Already in [['t', 'tag1'], ['t', 'tag2']] format
        level: 2, // Default level for display
        isIndex: event.kind === 30040,
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

  // Tutorial sidebar state
  let showTutorial = $state(false);

  // Toggle preview panel
  function togglePreview() {
    const newShowPreview = !showPreview;
    onPreviewToggle(newShowPreview);
  }

  // Toggle tutorial sidebar
  function toggleTutorial() {
    showTutorial = !showTutorial;
  }

  // Handle content changes
  function handleContentChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    onContentChange(target.value);
  }
</script>

<div class="flex flex-col space-y-4">
  <!-- Smart Publishing Interface -->
  <div class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <h3 class="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
          Unified AsciiDoc Publisher
        </h3>
        <div class="flex flex-col lg:flex-row lg:items-center lg:space-x-4 mb-3 space-y-2 lg:space-y-0">
          <div class="flex items-center space-x-2">
            <label for="parse-level" class="text-xs text-gray-600 dark:text-gray-400 font-medium">Parse Level:</label>
            <select 
              id="parse-level"
              bind:value={parseLevel}
              class="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              {#each generateParseLevelOptions(MIN_PARSE_LEVEL, MAX_PARSE_LEVEL) as option}
                <option value={option.level}>{option.label}</option>
              {/each}
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

  <div class="flex flex-col lg:flex-row items-center justify-between space-y-2 lg:space-y-0">
    <div class="flex items-center space-x-2">
      <Button
        color="light"
        size="sm"
        onclick={togglePreview}
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

      <Button
        color="light"
        size="sm"
        onclick={toggleTutorial}
        class="flex items-center space-x-1"
      >
        <QuestionCircleOutline class="w-4 h-4" />
        <span>{showTutorial ? 'Hide' : 'Show'} Help</span>
      </Button>
    </div>

    <!-- Publishing Button -->
    {#if generatedEvents && contentType !== 'none'}
      <Button
        color="primary"
        size="sm"
        onclick={handlePublish}
      >
        Publish
      </Button>
    {:else}
      <div class="text-xs text-gray-500 dark:text-gray-400">
        Add content to enable publishing
      </div>
    {/if}
  </div>

  <div class="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-6 h-[60vh] min-h-[400px] max-h-[800px]">
    <!-- Editor Panel -->
    <div class="{showPreview && showTutorial ? 'lg:w-1/3' : showPreview || showTutorial ? 'lg:w-1/2' : 'w-full'} flex flex-col">
      <div class="flex-1 relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <Textarea
          bind:value={content}
          oninput={handleContentChange}
          {placeholder}
          class="w-full h-full resize-none font-mono text-sm leading-relaxed p-4 bg-white dark:bg-gray-900 border-none outline-none"
        />
      </div>
    </div>

    <!-- Preview Panel -->
    {#if showPreview}
      <div class="{showTutorial ? 'lg:w-1/3' : 'lg:w-1/2'} flex flex-col">
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
              {#if contentType === 'article' && publicationResult?.metadata.title}
                <div class="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    {publicationResult.metadata.title}
                  </h1>
                  <!-- Document-level tags -->
                  {#if publicationResult.metadata.attributes.tags}
                    {@const tagsList = publicationResult.metadata.attributes.tags.split(',').map((t: string) => t.trim())}
                    {#if tagsList.length > 0}
                      <div class="flex flex-wrap gap-2">
                        {#each tagsList as tag}
                          <span class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
                            #{tag}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}
              
              <div class="prose prose-sm dark:prose-invert max-w-none">
                <!-- Render full document with title if it's an article -->
                {#if contentType === 'article' && publicationResult?.metadata.title}
                  {@const documentHeader = content.split(/\n==\s+/)[0]}
                  <div class="mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                    <div class="asciidoc-content">
                      {@html asciidoctor.convert(documentHeader, {
                        standalone: false,
                        attributes: {
                          showtitle: true,
                          sectids: false,
                        }
                      })}
                    </div>
                    <!-- Document-level tags -->
                    {#if publicationResult.metadata.attributes.tags}
                      {@const tagsList = publicationResult.metadata.attributes.tags.split(',').map((t: string) => t.trim())}
                      {#if tagsList.length > 0}
                        <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mt-3">
                          <div class="flex flex-wrap gap-2 items-center">
                            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">Document tags:</span>
                            {#each tagsList as tag}
                              <div class="bg-blue-600 text-blue-100 px-2 py-1 rounded-full text-xs font-medium flex items-baseline">
                                <span class="mr-1">#</span>
                                <span>{tag}</span>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/if}
                
                {#each parsedSections as section, index}
                  {@const indentLevel = Math.max(0, section.level - 2)}
                  {@const levelColors = {
                    2: 'bg-yellow-400', 
                    3: 'bg-yellow-500',
                    4: 'bg-yellow-600',
                    5: 'bg-gray-400',
                    6: 'bg-gray-500'
                  } as Record<number, string>}
                  {@const currentColor = levelColors[section.level] || 'bg-gray-600'}
                  
                  <div class="mb-6 relative" style="margin-left: {indentLevel * 24}px; padding-left: 12px;">
                    <!-- Vertical indent guide -->
                    <div 
                      class="absolute top-0 w-1 {currentColor} opacity-60"
                      style="left: 0; height: 100%;"
                    ></div>
                    
                    <div
                      class="text-sm text-gray-800 dark:text-gray-200 asciidoc-content"
                    >
                      {#if section.isIndex}
                        <!-- Index section: just show the title as a header -->
                        <div class="font-semibold text-gray-900 dark:text-gray-100 py-2">
                          {section.title}
                        </div>
                      {:else}
                        <!-- Content section: render full content -->
                        <div class="prose prose-sm dark:prose-invert">
                          {@html section.content}
                        </div>
                      {/if}
                    </div>

                    <!-- Gray area with tag bubbles only for content sections -->
                    {#if !section.isIndex}
                      <div class="my-4 relative">
                        <!-- Gray background area -->
                        <div
                          class="bg-gray-200 dark:bg-gray-700 rounded-lg p-3 mb-2"
                        >
                          <div class="flex flex-wrap gap-2 items-center">
                            {#if section.tags && section.tags.filter((tag: string[]) => tag[0] === 't').length > 0}
                              <!-- Show only hashtags (t-tags) -->
                              {#each section.tags.filter((tag: string[]) => tag[0] === 't') as tag}
                                <div
                                  class="bg-blue-600 text-blue-100 px-2 py-1 rounded-full text-xs font-medium flex items-baseline"
                                >
                                  <span class="mr-1">#</span>
                                  <span>{tag[1]}</span>
                                </div>
                              {/each}
                            {:else}
                              <span
                                class="text-gray-500 dark:text-gray-400 text-xs italic"
                                >No hashtags</span
                              >
                            {/if}
                          </div>
                        </div>

                        {#if index < parsedSections.length - 1 && !parsedSections[index + 1].isIndex}
                          <!-- Event boundary line only between content sections -->
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
                    {/if}
                  </div>
                {/each}
              </div>

              <div
                class="mt-4 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-2 rounded border"
              >
                <strong>Event Count:</strong>
                {#if generatedEvents}
                  {generatedEvents.contentEvents.length + (generatedEvents.indexEvent ? 1 : 0)} event{(generatedEvents.contentEvents.length + (generatedEvents.indexEvent ? 1 : 0)) !== 1
                    ? "s"
                    : ""}
                  ({generatedEvents.indexEvent ? '1 index + ' : ''}{generatedEvents.contentEvents.length} content)
                {:else}
                  0 events
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Tutorial Sidebar -->
    {#if showTutorial}
      <div class="{showPreview ? 'lg:w-1/3' : 'lg:w-1/2'} flex flex-col">
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg h-full flex flex-col overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              AsciiDoc Guide
            </h3>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">Publishing Levels</h4>
              <ul class="space-y-1 text-xs">
                {#each generateParseLevelOptions(MIN_PARSE_LEVEL, MAX_PARSE_LEVEL) as option}
                  <li>
                    <strong>Level {option.level}:</strong> 
                    {#if option.level === 2}
                      Only {'='.repeat(option.level)} sections become events (containing {'='.repeat(option.level + 1)} and deeper)
                    {:else}
                      {'='.repeat(option.level - 1)} sections become indices, {'='.repeat(option.level)} sections become events
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">Example Structure</h4>
              <pre class="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto">{`= Understanding Knowledge
:image: https://i.nostr.build/example.jpg
:published: 2025-04-21
:tags: knowledge, philosophy, education
:type: text

== Preface
:tags: introduction, preface

This essay outlines the purpose...

== Introduction: Knowledge Ecosystem
:tags: introduction, ecosystem

Knowledge exists as dynamic representations...

=== Why Investigate Knowledge?
:difficulty: intermediate

Understanding the nature of knowledge...

==== The Four Perspectives
:complexity: high

1. Material Cause: The building blocks...`}</pre>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">Attributes</h4>
              <p class="text-xs">Use <code>:key: value</code> format to add metadata that becomes event tags.</p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">Content Types</h4>
              <ul class="space-y-1 text-xs">
                <li><strong>Article:</strong> Starts with = title, creates index + content events</li>
                <li><strong>Notes:</strong> Just == sections, creates individual content events</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>