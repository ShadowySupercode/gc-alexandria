<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { EyeOutline, QuestionCircleOutline } from "flowbite-svelte-icons";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState, StateField, StateEffect } from "@codemirror/state";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { ViewPlugin, Decoration, type DecorationSet } from "@codemirror/view";
  import { RangeSet } from "@codemirror/state";
  import { onMount } from "svelte";
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
  

  // Update editor when content changes externally
  $effect(() => {
    updateEditorContent();
  });

  // Effect to update syntax highlighting when parsedSections change
  $effect(() => {
    if (editorView && parsedSections) {
      editorView.dispatch({
        effects: updateHighlighting.of(parsedSections)
      });
    }
  });

  // Effect to create PublicationTree when content changes
  // Uses tree processor:
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
        // Debug: Check what we're getting from exportEventsFromTree
        console.log("Events from exportEventsFromTree:", events);
        console.log("Event keys:", Object.keys(events));
        if (events.indexEvent) {
          console.log("Index event keys:", Object.keys(events.indexEvent));
        }
        if (events.contentEvents?.[0]) {
          console.log("First content event keys:", Object.keys(events.contentEvents[0]));
        }
        
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
    
    try {
      // Deep clone the events to ensure they're fully serializable
      // This prevents postMessage cloning errors
      const serializableEvents = JSON.parse(JSON.stringify(generatedEvents));
      
      if (contentType === 'article' && serializableEvents.indexEvent) {
        // Full article: publish both index event (30040) and content events (30041)
        onPublishArticle(serializableEvents);
      } else if (contentType === 'scattered-notes') {
        // Only notes: publish just the content events (30041)
        const notesOnly = {
          contentEvents: serializableEvents.contentEvents
        };
        onPublishScatteredNotes(notesOnly);
      }
    } catch (error) {
      console.error("Failed to serialize events:", error);
      console.error("generatedEvents structure:", generatedEvents);
      // Try to identify the non-serializable part
      if (generatedEvents) {
        console.error("Keys in generatedEvents:", Object.keys(generatedEvents));
        if (generatedEvents.indexEvent) {
          console.error("indexEvent type:", typeof generatedEvents.indexEvent, generatedEvents.indexEvent?.constructor?.name);
        }
        if (generatedEvents.contentEvents?.[0]) {
          console.error("First contentEvent type:", typeof generatedEvents.contentEvents[0], generatedEvents.contentEvents[0]?.constructor?.name);
        }
      }
      alert("Error: Events contain non-serializable data. Check console for details.");
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

  // CodeMirror editor state
  let editorContainer = $state<HTMLDivElement | null>(null);
  let editorView = $state<EditorView | null>(null);

  // Create update effect for highlighting
  const updateHighlighting = StateEffect.define<any>();

  // State field to track header decorations
  const headerDecorations = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      // Update decorations when content changes or highlighting is updated
      decorations = decorations.map(tr.changes);
      
      for (let effect of tr.effects) {
        if (effect.is(updateHighlighting)) {
          decorations = createHeaderDecorations(tr.state, effect.value);
        }
      }
      
      return decorations;
    },
    provide: (f) => EditorView.decorations.from(f)
  });

  // Function to create header decorations based on parsed sections
  function createHeaderDecorations(state: EditorState, sections: any[]): DecorationSet {
    const ranges: Array<{from: number, to: number, decoration: any}> = [];
    const doc = state.doc;
    const content = doc.toString();
    const lines = content.split('\n');
    
    // Create a map of header text to section info for fast lookup
    const sectionMap = new Map();
    if (sections) {
      sections.forEach(section => {
        if (section.title) {
          sectionMap.set(section.title.toLowerCase().trim(), {
            level: section.level,
            isEventTitle: true,
            eventType: section.eventType,
            eventKind: section.eventKind
          });
        }
      });
    }
    
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(=+)\s+(.+)$/);
      
      if (headerMatch) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2].trim().toLowerCase();
        const lineStart = pos;
        const lineEnd = pos + line.length;
        
        // Check if this header is an event title
        const sectionInfo = sectionMap.get(headerText);
        let className: string;
        
        if (sectionInfo && sectionInfo.isEventTitle) {
          // Event title - different colors based on event type
          if (sectionInfo.eventKind === 30040) {
            className = 'cm-header-index-event';
          } else if (sectionInfo.eventKind === 30041) {
            className = 'cm-header-content-event';
          } else {
            className = 'cm-header-event-title';
          }
        } else {
          // Regular subheader within content
          if (level <= parseLevel) {
            className = 'cm-header-potential-event';
          } else {
            className = 'cm-header-subcontent';
          }
        }
        
        ranges.push({
          from: lineStart,
          to: lineEnd,
          decoration: Decoration.mark({ class: className })
        });
      }
      
      pos += line.length + 1; // +1 for newline
    }
    
    console.log(`Created ${ranges.length} header decorations`);
    return RangeSet.of(ranges.map(r => r.decoration.range(r.from, r.to)));
  }

  // Initialize CodeMirror editor
  function createEditor() {
    if (!editorContainer) return;

    // Create custom theme with header highlighting classes
    const headerHighlighting = EditorView.theme({
      // Event titles (extracted as separate events)
      '.cm-header-index-event': { 
        color: '#3B82F6', // blue-500 for index events (30040)
        fontWeight: '700',
        fontSize: '1.1em',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderLeft: '3px solid #3B82F6',
        paddingLeft: '8px'
      },
      '.cm-header-content-event': { 
        color: '#10B981', // emerald-500 for content events (30041)
        fontWeight: '700', 
        fontSize: '1.1em',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderLeft: '3px solid #10B981',
        paddingLeft: '8px'
      },
      '.cm-header-event-title': {
        color: '#8B5CF6', // violet-500 for other event types
        fontWeight: '700',
        fontSize: '1.1em',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderLeft: '3px solid #8B5CF6',
        paddingLeft: '8px'
      },
      // Potential events (at parse level but not extracted yet)
      '.cm-header-potential-event': {
        color: '#F59E0B', // amber-500 for headers at parse level
        fontWeight: '600',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted'
      },
      // Subcontent headers (below parse level, part of content)
      '.cm-header-subcontent': {
        color: '#6B7280', // gray-500 for regular subheaders
        fontWeight: '500',
        fontStyle: 'italic'
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(), // AsciiDoc is similar to markdown syntax
        headerDecorations,
        headerHighlighting,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onContentChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': {
            fontSize: '14px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            height: '100%'
          },
          '.cm-content': {
            padding: '16px',
            minHeight: '100%'
          },
          '.cm-editor': {
            borderRadius: '0.5rem',
            height: '100%'
          },
          '.cm-scroller': {
            overflow: 'auto',
            height: '100%',
            fontFamily: 'inherit'
          },
          '.cm-focused': {
            outline: 'none'
          }
        })
      ]
    });

    editorView = new EditorView({
      state,
      parent: editorContainer
    });
  }

  // Update editor content when content prop changes
  function updateEditorContent() {
    if (!editorView) return;
    
    const currentContent = editorView.state.doc.toString();
    if (currentContent !== content) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content
        }
      });
    }
  }

  // Mount CodeMirror when component mounts
  onMount(() => {
    createEditor();
    
    return () => {
      if (editorView) {
        editorView.destroy();
      }
    };
  });

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
      <div class="flex-1 relative border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900" style="overflow: hidden;">
        <!-- CodeMirror Editor Container -->
        <div
          bind:this={editorContainer}
          class="w-full h-full"
        ></div>
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
                        
                        <!-- Title at correct heading level -->
                        <div class="prose prose-sm dark:prose-invert max-w-none">
                          {@html asciidoctor.convert(`${'='.repeat(section.level)} ${section.title}`, {
                            standalone: false,
                            attributes: {
                              showtitle: false,
                              sectids: false,
                            }
                          })}
                        </div>
                        
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
            <!-- Syntax Highlighting Legend -->
            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">Header Highlighting</h4>
              <div class="space-y-2 text-xs">
                <div class="flex items-center space-x-2">
                  <div class="w-4 h-4 rounded" style="background: linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1)); border-left: 2px solid #3B82F6;"></div>
                  <span><strong class="text-blue-600">Blue:</strong> Index Events (30040)</span>
                </div>
                <div class="flex items-center space-x-2">
                  <div class="w-4 h-4 rounded" style="background: linear-gradient(to right, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1)); border-left: 2px solid #10B981;"></div>
                  <span><strong class="text-green-600">Green:</strong> Content Events (30041)</span>
                </div>
                <div class="flex items-center space-x-2">
                  <div class="w-4 h-4 rounded bg-amber-200 dark:bg-amber-800" style="text-decoration: underline;"></div>
                  <span><strong class="text-amber-600">Amber:</strong> Potential Events (at parse level)</span>
                </div>
                <div class="flex items-center space-x-2">
                  <div class="w-4 h-4 rounded bg-gray-200 dark:bg-gray-600" style="font-style: italic;"></div>
                  <span><strong class="text-gray-600">Gray:</strong> Subheaders (within content)</span>
                </div>
              </div>
            </div>
            
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
