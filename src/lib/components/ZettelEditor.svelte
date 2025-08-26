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
  
  // Gutter visualization state for Phase 2
  let gutterIndicators = $state<Array<{
    lineNumber: number;
    eventKind: 30040 | 30041;
    eventType: 'index' | 'content';
    level: number;
    title: string;
  }>>([]);
  let hoveredLineNumber = $state<number | null>(null);
  let textareaRef = $state<any>(null); // Flowbite Textarea component ref
  let gutterElement = $state<HTMLDivElement | null>(null);

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
      gutterIndicators = [];
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
        
        // Temporary: Create sample gutter indicators for testing
        // This will be replaced with proper line detection in Checkpoint 2.2
        if (publicationResult?.metadata?.eventStructure) {
          const tempIndicators: typeof gutterIndicators = [];
          const lines = content.split('\n');
          
          // Simple detection of section headers for testing
          lines.forEach((line: string, index: number) => {
            const match = line.match(/^(=+)\s+(.+)/);
            if (match) {
              const level = match[1].length;
              const title = match[2].trim();
              
              // Find matching event structure node
              const node = publicationResult.metadata.eventStructure.find((n: any) => 
                n.title === title || n.title.includes(title)
              );
              
              if (node) {
                tempIndicators.push({
                  lineNumber: index + 1,
                  eventKind: node.eventKind as 30040 | 30041,
                  eventType: node.eventType as 'index' | 'content',
                  level: level,
                  title: title
                });
              }
            }
          });
          
          gutterIndicators = tempIndicators;
          console.log("Gutter indicators:", gutterIndicators);
        }
      })
      .catch(error => {
        console.error("Tree factory error:", error);
        publicationResult = null;
        generatedEvents = null;
        contentType = 'none';
        gutterIndicators = [];
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
        label = `Level ${level} (${equals} → content events with nested AsciiDoc)`;
      } else {
        const prevEquals = '='.repeat(level - 1);
        label = `Level ${level} (${prevEquals} → index events, ${equals} → content events)`;
      }
      
      options.push({ level, label });
    }
    return options;
  }

  // Parse sections for preview display using hierarchical eventStructure
  let parsedSections = $derived.by(() => {
    if (!publicationResult || !publicationResult.metadata?.eventStructure) return [];
    
    console.log("Preview: publicationResult structure:", {
      hasContentEvents: !!publicationResult.contentEvents,
      contentEventsLength: publicationResult.contentEvents?.length,
      hasEventStructure: !!publicationResult.metadata.eventStructure,
      eventStructureLength: publicationResult.metadata.eventStructure?.length,
      keys: Object.keys(publicationResult)
    });
    
    // Helper to find event by dTag
    const findEventByDTag = (events: any[], dTag: string) => {
      return events.find(event => {
        const eventDTag = event.tags.find((t: string[]) => t[0] === 'd')?.[1];
        return eventDTag === dTag;
      });
    };
    
    // Flatten eventStructure recursively to show all nodes
    function flattenNodes(nodes: any[], result: any[] = []): any[] {
      for (const node of nodes) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          flattenNodes(node.children, result);
        }
      }
      return result;
    }
    
    let flatNodes: any[] = [];
    if (publicationResult.metadata.eventStructure.length > 0) {
      flatNodes = flattenNodes(publicationResult.metadata.eventStructure);
    }
    
    // Map nodes to display sections
    return flatNodes.map((node: any) => {
      // For the root index, use indexEvent. For others, find in contentEvents
      let event;
      if (node.dTag === publicationResult.indexEvent?.tagValue('d')) {
        event = publicationResult.indexEvent;
      } else {
        // contentEvents can contain both 30040 and 30041 events at parse level 3+
        event = findEventByDTag(publicationResult.contentEvents, node.dTag);
      }
      
      const tags = event?.tags.filter((t: string[]) => t[0] === 't') || [];
      
      // Extract the title from the title tag
      const titleTag = event?.tags.find((t: string[]) => t[0] === 'title');
      const eventTitle = titleTag ? titleTag[1] : node.title;
      
      // For content events, remove the first heading from content since we'll use the title tag
      let processedContent = event?.content || '';
      if (event && node.eventType === 'content') {
        // Remove the first heading line (which should match the title)
        const lines = processedContent.split('\n');
        const firstHeadingIndex = lines.findIndex((line: string) => line.match(/^=+\s+/));
        if (firstHeadingIndex !== -1) {
          // Remove the heading line and join back
          lines.splice(firstHeadingIndex, 1);
          processedContent = lines.join('\n').trim();
        }
      }
      
      return {
        title: eventTitle,
        content: processedContent,
        tags, // Already in [['t', 'tag1'], ['t', 'tag2']] format
        level: node.level,
        isIndex: node.eventKind === 30040,
        eventKind: node.eventKind,
        eventType: node.eventType
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
  
  // Synchronize gutter scroll with textarea scroll
  function handleTextareaScroll(event: Event) {
    if (!gutterElement) return;
    const target = event.target as HTMLTextAreaElement;
    gutterElement.scrollTop = target.scrollTop;
  }
  
  // Calculate top position for a line number in the gutter
  function calculateLineTop(lineNumber: number): number {
    // Approximate line height based on textarea's line-height
    // We use 1.5rem (24px) as specified in the textarea class
    const lineHeight = 24; // 1.5rem with text-sm
    return (lineNumber - 1) * lineHeight;
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
        <!-- Gutter Overlay for Visual Indicators (Phase 2) -->
        <div 
          bind:this={gutterElement}
          class="absolute left-0 top-0 w-12 h-full overflow-hidden pointer-events-none z-10"
          style="padding-top: 1rem; padding-bottom: 1rem;" 
        >
          <div class="relative h-full">
            <!-- Gutter background -->
            <div class="absolute inset-0 bg-gray-50 dark:bg-gray-800 opacity-50 border-r border-gray-200 dark:border-gray-700"></div>
            
            <!-- Indicators will be rendered here in future checkpoints -->
            {#each gutterIndicators as indicator}
              <div
                class="absolute left-0 flex items-center justify-center w-full h-6 transition-all duration-200"
                style="top: {calculateLineTop(indicator.lineNumber)}px;"
              >
                <!-- Placeholder for visual indicators -->
                <div class="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-600"></div>
              </div>
            {/each}
            
            <!-- Hover highlight (for future interactivity) -->
            {#if hoveredLineNumber}
              <div 
                class="absolute left-0 w-full h-6 bg-blue-100 dark:bg-blue-900 opacity-30 transition-all duration-150"
                style="top: {calculateLineTop(hoveredLineNumber)}px;"
              ></div>
            {/if}
          </div>
        </div>
        
        <!-- Textarea with left padding to accommodate gutter -->
        <Textarea
          bind:this={textareaRef}
          bind:value={content}
          oninput={handleContentChange}
          onscroll={handleTextareaScroll}
          {placeholder}
          class="w-full h-full resize-none font-mono text-sm leading-relaxed p-4 bg-white dark:bg-gray-900 border-none outline-none"
          style="padding-left: 4rem;"
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
                  <div class="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700 last:border-0">
                    {#if section.isIndex}
                      <!-- Index event: show as simple title -->
                      <div class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Index Event (30040)
                      </div>
                      <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {section.title}
                      </h2>
                    {:else}
                      <!-- Content event: show title, tags, then content -->
                      <div class="space-y-3">
                        <!-- Event type indicator -->
                        <div class="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">
                          Content Event (30041)
                        </div>
                        
                        <!-- Title as level 2 heading -->
                        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
                          == {section.title}
                        </h2>
                        
                        <!-- Tags -->
                        {#if section.tags && section.tags.length > 0}
                          <div class="flex flex-wrap gap-2">
                            {#each section.tags as tag}
                              <span class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded-full text-xs font-medium">
                                #{tag[1]}
                              </span>
                            {/each}
                          </div>
                        {/if}
                        
                        <!-- Content rendered as AsciiDoc -->
                        {#if section.content}
                          <div class="prose prose-sm dark:prose-invert max-w-none mt-4">
                            {@html asciidoctor.convert(section.content, {
                              standalone: false,
                              attributes: {
                                showtitle: false,
                                sectids: false,
                              }
                            })}
                          </div>
                        {/if}
                      </div>
                    {/if}
                    
                    <!-- Event boundary indicator -->
                    {#if index < parsedSections.length - 1}
                      <div class="mt-6 relative">
                        <div class="absolute inset-0 flex items-center">
                          <div class="w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600"></div>
                        </div>
                        <div class="relative flex justify-center">
                          <span class="bg-white dark:bg-gray-900 px-3 text-xs text-gray-500 dark:text-gray-400">
                            Event Boundary
                          </span>
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