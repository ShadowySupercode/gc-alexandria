<script lang="ts">
  import { Button } from "flowbite-svelte";
  import {
    EyeOutline,
    QuestionCircleOutline,
    ChartPieOutline,
  } from "flowbite-svelte-icons";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState, StateField, StateEffect } from "@codemirror/state";
  import { markdown } from "@codemirror/lang-markdown";
  import { Decoration, type DecorationSet } from "@codemirror/view";
  import { RangeSet } from "@codemirror/state";
  import { onMount } from "svelte";
  import {
    extractSmartMetadata,
    type AsciiDocMetadata,
    metadataToTags,
    parseSimpleAttributes,
  } from "$lib/utils/asciidoc_metadata";
  import {
    parseAsciiDocWithTree,
    exportEventsFromTree,
  } from "$lib/utils/asciidoc_publication_parser";
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
  let contentType = $state<"article" | "scattered-notes" | "none">("none");

  // Dark mode state
  let isDarkMode = $state(false);

  // Note: updateEditorContent() is only called manually when needed
  // The automatic effect was causing feedback loops with user typing

  // Effect to update syntax highlighting when parsing results change
  $effect(() => {
    if (
      editorView &&
      (parsedSections || publicationResult?.metadata?.eventStructure)
    ) {
      editorView.dispatch({
        effects: updateHighlighting.of(parsedSections || []),
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
      contentType = "none";
      return;
    }

    // Use new hierarchical tree processor for NKBIP-01 compliance
    parseAsciiDocWithTree(content, ndk, parseLevel)
      .then((result) => {
        console.log("Tree factory result:", result);
        publicationResult = result;
        contentType = result.metadata.contentType;

        // Export events for publishing workflow
        const events = exportEventsFromTree(result);
        generatedEvents = events;
        console.log("Generated events:", events);
        console.log("Event structure:", result.metadata.eventStructure);
        return events;
      })
      .catch((error) => {
        console.error("Tree factory error:", error);
        publicationResult = null;
        generatedEvents = null;
        contentType = "none";
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
      const equals = "=".repeat(level);
      const nextEquals = "=".repeat(level + 1);

      let label;
      if (level === 2) {
        label = `Level ${level} (${equals} → content events with nested AsciiDoc)`;
      } else {
        const prevEquals = "=".repeat(level - 1);
        label = `Level ${level} (${prevEquals} → index events, ${equals} → content events)`;
      }

      options.push({ level, label });
    }
    return options;
  }

  // Parse sections for preview display using hierarchical eventStructure
  let parsedSections = $derived.by(() => {
    if (!publicationResult || !publicationResult.metadata?.eventStructure)
      return [];

    console.log("Preview: publicationResult structure:", {
      hasContentEvents: !!publicationResult.contentEvents,
      contentEventsLength: publicationResult.contentEvents?.length,
      hasEventStructure: !!publicationResult.metadata.eventStructure,
      eventStructureLength: publicationResult.metadata.eventStructure?.length,
      keys: Object.keys(publicationResult),
    });

    console.log("Event structure details:", JSON.stringify(publicationResult.metadata.eventStructure, null, 2));
    console.log("Content events details:", publicationResult.contentEvents?.map(e => ({
      dTag: e.tags?.find(t => t[0] === 'd')?.[1],
      title: e.tags?.find(t => t[0] === 'title')?.[1],
      content: e.content?.substring(0, 100) + '...'
    })));

    // Helper to get d-tag from event (works with both NDK events and serialized events)
    const getEventDTag = (event: any) => {
      if (event?.tagValue) {
        // NDK event
        return event.tagValue("d");
      } else if (event?.tags) {
        // Serialized event
        return event.tags.find((t: string[]) => t[0] === "d")?.[1];
      }
      return null;
    };

    // Helper to find event by dTag and kind
    const findEventByDTag = (events: any[], dTag: string, eventKind?: number) => {
      return events.find((event) => {
        const matchesDTag = getEventDTag(event) === dTag;
        if (eventKind !== undefined) {
          const eventKindValue = event?.kind || (event?.tagValue ? event.tagValue("k") : null);
          return matchesDTag && eventKindValue === eventKind;
        }
        return matchesDTag;
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
      if (
        publicationResult.indexEvent &&
        node.dTag === getEventDTag(publicationResult.indexEvent)
      ) {
        event = publicationResult.indexEvent;
      } else {
        // contentEvents can contain both 30040 and 30041 events at parse level 3+
        // Use eventKind to find the correct event type
        event = findEventByDTag(publicationResult.contentEvents, node.dTag, node.eventKind);
      }

      const tags = event?.tags.filter((t: string[]) => t[0] === "t") || [];

      // Extract the title from the title tag
      const titleTag = event?.tags.find((t: string[]) => t[0] === "title");
      const eventTitle = titleTag ? titleTag[1] : node.title;


      // For content events, remove the first heading from content since we'll use the title tag
      let processedContent = event?.content || "";
      if (event && node.eventType === "content") {
        // Remove the heading line that matches this section's title and level (if present)
        // This is important because content events should not include their own title heading
        // since the title is displayed separately from the "title" tag
        const lines = processedContent.split("\n");
        const expectedHeading = `${"=".repeat(node.level)} ${node.title}`;
        const titleHeadingIndex = lines.findIndex((line: string) =>
          line.trim() === expectedHeading.trim(),
        );
        if (titleHeadingIndex !== -1) {
          // Remove only the specific title heading line
          lines.splice(titleHeadingIndex, 1);
          processedContent = lines.join("\n").trim();
        }
      }


      return {
        title: eventTitle,
        content: processedContent,
        tags, // Already in [['t', 'tag1'], ['t', 'tag2']] format
        level: node.level,
        isIndex: node.eventKind === 30040,
        eventKind: node.eventKind,
        eventType: node.eventType,
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

      if (contentType === "article" && serializableEvents.indexEvent) {
        // Full article: publish both index event (30040) and content events (30041)
        onPublishArticle(serializableEvents);
      } else if (contentType === "scattered-notes") {
        // Only notes: publish just the content events (30041)
        const notesOnly = {
          contentEvents: serializableEvents.contentEvents,
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
          console.error(
            "indexEvent type:",
            typeof generatedEvents.indexEvent,
            generatedEvents.indexEvent?.constructor?.name,
          );
        }
        if (generatedEvents.contentEvents?.[0]) {
          console.error(
            "First contentEvent type:",
            typeof generatedEvents.contentEvents[0],
            generatedEvents.contentEvents[0]?.constructor?.name,
          );
        }
      }
      alert(
        "Error: Events contain non-serializable data. Check console for details.",
      );
    }
  }

  // Tutorial sidebar state
  let showTutorial = $state(false);

  // Structure preview sidebar state
  let showStructurePreview = $state(false);

  // Toggle preview panel
  function togglePreview() {
    const newShowPreview = !showPreview;
    onPreviewToggle(newShowPreview);
  }

  // Toggle tutorial sidebar
  function toggleTutorial() {
    showTutorial = !showTutorial;
  }

  // Toggle structure preview sidebar
  function toggleStructurePreview() {
    showStructurePreview = !showStructurePreview;
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
    provide: (f) => EditorView.decorations.from(f),
  });

  // Function to create header decorations based on parsed sections
  function createHeaderDecorations(
    state: EditorState,
    sections: any[],
  ): DecorationSet {
    const ranges: Array<{ from: number; to: number; decoration: any }> = [];
    const doc = state.doc;
    const content = doc.toString();
    const lines = content.split("\n");

    // Analyze document structure for ambiguity detection
    const documentStructure = analyzeDocumentStructure(lines);

    // Create a map of header text to section info for fast lookup from actual event structure
    const sectionMap = new Map();
    if (publicationResult?.metadata?.eventStructure) {
      // Flatten the event structure to get all nodes with their actual event types
      const flattenEventStructure = (
        nodes: any[],
        result: any[] = [],
      ): any[] => {
        for (const node of nodes) {
          result.push(node);
          if (node.children && node.children.length > 0) {
            flattenEventStructure(node.children, result);
          }
        }
        return result;
      };

      const allEventNodes = flattenEventStructure(
        publicationResult.metadata.eventStructure,
      );

      // Debug: log the event structure
      console.log(
        "Event structure nodes for highlighting:",
        allEventNodes.map((n) => ({
          title: n.title,
          level: n.level,
          eventType: n.eventType,
          eventKind: n.eventKind,
        })),
      );

      allEventNodes.forEach((node) => {
        if (node.title) {
          sectionMap.set(node.title.toLowerCase().trim(), {
            level: node.level,
            isEventTitle: true,
            eventType: node.eventType,
            eventKind: node.eventKind,
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

        // Check for ambiguous syntax first (highest priority)
        if (
          isAmbiguousHeader(
            level,
            headerText,
            documentStructure,
            parseLevel,
            lines,
            i,
            publicationResult,
          )
        ) {
          className = "cm-header-potential-event"; // Amber for ambiguous
        }
        // Determine highlighting based on structural analysis
        else if (level === 1) {
          // Document title is always an index event (blue)
          className = "cm-header-index-event";
        } else if (level === parseLevel) {
          // Headers at parse level are content events (green)
          className = "cm-header-content-event";
        } else if (level < parseLevel) {
          // Headers above parse level that could have children are index events (blue)
          // Check if this header has children by looking ahead in the document
          const hasChildren = headerHasChildren(lines, i, level);
          if (hasChildren) {
            className = "cm-header-index-event"; // Blue for sections with children
          } else {
            className = "cm-header-content-event"; // Green for sections without children
          }
        } else if (level > parseLevel) {
          className = "cm-header-subcontent"; // Gray for subheaders below parse level
        } else {
          className = "cm-header-potential-event"; // Amber for unclear cases
        }

        ranges.push({
          from: lineStart,
          to: lineEnd,
          decoration: Decoration.mark({ class: className }),
        });
      }

      pos += line.length + 1; // +1 for newline
    }

    console.log(`Created ${ranges.length} header decorations`);
    return RangeSet.of(ranges.map((r) => r.decoration.range(r.from, r.to)));
  }

  // Analyze document structure to detect ambiguous patterns
  function analyzeDocumentStructure(lines: string[]) {
    let hasDocumentTitle = false;
    let level1Headers = 0;
    let level2Headers = 0;
    let level3PlusHeaders = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^(=+)\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        if (level === 1) {
          hasDocumentTitle = true;
          level1Headers++;
        } else if (level === 2) {
          level2Headers++;
        } else if (level >= 3) {
          level3PlusHeaders++;
        }
      }
    }

    return {
      hasDocumentTitle,
      level1Headers,
      level2Headers,
      level3PlusHeaders,
      contentType:
        hasDocumentTitle && level2Headers > 0
          ? "article"
          : level2Headers > 0
            ? "scattered-notes"
            : "none",
    };
  }

  // Check if a header has children by looking ahead in the document
  function headerHasChildren(
    lines: string[],
    headerIndex: number,
    headerLevel: number,
  ): boolean {
    // Look ahead to see if there are any headers at a deeper level
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(=+)\s+(.+)$/);

      if (headerMatch) {
        const nextLevel = headerMatch[1].length;

        if (nextLevel > headerLevel) {
          // Found a deeper header - this header has children
          return true;
        } else if (nextLevel <= headerLevel) {
          // Found a header at the same or higher level - no children
          return false;
        }
      }
    }

    // Reached end of document with no headers found - no children
    return false;
  }

  // Check if a header represents ambiguous syntax
  function isAmbiguousHeader(
    level: number,
    headerText: string,
    structure: any,
    parseLevel: number,
    lines: string[] = [],
    headerIndex: number = -1,
    pubResult: any = null,
  ): boolean {
    // Case 1: Header immediately follows another header or attributes without blank line separation
    // This is invalid AsciiDoc syntax and won't parse correctly
    if (headerIndex > 0 && lines.length > headerIndex) {
      const prevLine = lines[headerIndex - 1];

      // Check if previous line is also a header
      if (prevLine.match(/^=+\s+/)) {
        // No blank line between headers - this is invalid AsciiDoc
        return true;
      }

      // Check if previous line is an attribute (like :tags: test, notes)
      if (prevLine.match(/^:[^:]+:/)) {
        // Header immediately follows attribute line - missing required blank line
        return true;
      }

      // Check if this header should be parsed but isn't due to improper separation
      // This specifically catches cases where AsciiDoc parser failed to separate sections
      if (level === parseLevel && pubResult) {
        // Check if this header exists in the parsed structure - if not, it might be improperly separated
        const headerTitle = headerText.toLowerCase().trim();

        // Look through the event structure to see if this header was parsed as a separate event
        const sectionMap = new Map();
        if (publicationResult.metadata?.eventStructure) {
          const flattenEventStructure = (
            nodes: any[],
            result: any[] = [],
          ): any[] => {
            for (const node of nodes) {
              result.push(node);
              if (node.children && node.children.length > 0) {
                flattenEventStructure(node.children, result);
              }
            }
            return result;
          };

          const allEventNodes = flattenEventStructure(
            publicationResult.metadata.eventStructure,
          );
          allEventNodes.forEach((node) => {
            if (node.title) {
              sectionMap.set(node.title.toLowerCase().trim(), true);
            }
          });
        }

        // If this header isn't in the parsed structure, it might be improperly separated
        if (!sectionMap.has(headerTitle)) {
          return true; // Header exists in source but not in parsed structure
        }
      }
    }

    // Case 2: Document has title (=) but user might expect level 2 headers to be top-level notes
    if (
      level === 2 &&
      structure.hasDocumentTitle &&
      structure.level2Headers > 0
    ) {
      // This is actually correct for articles, not ambiguous
      return false;
    }

    // Case 3: Multiple level 1 headers (ambiguous document structure)
    if (level === 1 && structure.level1Headers > 1) {
      return true; // Multiple document titles are ambiguous
    }

    // Case 4: Headers at parse level that aren't being extracted due to structural issues
    if (level === parseLevel) {
      // If this header level should be extracted but isn't in the event structure,
      // it might be ambiguous (this requires checking against publicationResult)
      if (structure.contentType === "none" && level === 2) {
        return true; // Level 2 headers with no clear structure
      }
    }

    // Case 5: Orphaned high-level headers (e.g., === without ==)
    if (
      level === 3 &&
      structure.level2Headers === 0 &&
      structure.hasDocumentTitle
    ) {
      return true; // Level 3 without level 2 parent in article structure
    }

    return false;
  }

  // Initialize CodeMirror editor
  function createEditor() {
    if (!editorContainer) return;

    // Create custom theme with header highlighting classes
    const headerHighlighting = EditorView.theme({
      // Event titles (extracted as separate events)
      ".cm-header-index-event": {
        color: "#3B82F6", // blue-500 for index events (30040)
        fontWeight: "700",
        fontSize: "1.1em",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderLeft: "3px solid #3B82F6",
        paddingLeft: "8px",
      },
      ".cm-header-content-event": {
        color: "#10B981", // emerald-500 for content events (30041)
        fontWeight: "700",
        fontSize: "1.1em",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        borderLeft: "3px solid #10B981",
        paddingLeft: "8px",
      },
      ".cm-header-event-title": {
        color: "#8B5CF6", // violet-500 for other event types
        fontWeight: "700",
        fontSize: "1.1em",
        backgroundColor: "rgba(139, 92, 246, 0.1)",
        borderLeft: "3px solid #8B5CF6",
        paddingLeft: "8px",
      },
      // Potential events (at parse level but not extracted yet)
      ".cm-header-potential-event": {
        color: "#F59E0B", // amber-500 for headers at parse level
        fontWeight: "600",
        textDecoration: "underline",
        textDecorationStyle: "dotted",
      },
      // Subcontent headers (below parse level, part of content)
      ".cm-header-subcontent": {
        color: "#6B7280", // gray-500 for regular subheaders
        fontWeight: "500",
        fontStyle: "italic",
      },
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
          "&": {
            fontSize: "14px",
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            height: "100%",
          },
          ".cm-content": {
            padding: "16px",
            minHeight: "100%",
            maxWidth: "900px",
            margin: "0 auto",
          },
          ".cm-editor": {
            borderRadius: "0.5rem",
            height: "100%",
          },
          ".cm-scroller": {
            overflow: "auto",
            height: "100%",
            fontFamily: "inherit",
          },
          ".cm-focused": {
            outline: "none",
          },
        }),
        // Override background and text to match preview (gray-800 bg, gray-100 text)
        ...(isDarkMode ? [EditorView.theme({
          "&": {
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
          },
          ".cm-content": {
            color: "#f3f4f6",
          },
          ".cm-line": {
            color: "#f3f4f6",
          },
          ".cm-gutters": {
            backgroundColor: "#1f2937",
            borderColor: "#374151",
            color: "#9ca3af",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "#374151",
          },
          ".cm-cursor": {
            borderLeftColor: "#f3f4f6",
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: "#374151 !important",
          },
          "&.cm-focused .cm-selectionBackground, &.cm-focused ::selection": {
            backgroundColor: "#4b5563 !important",
          },
        }, { dark: true })] : []),
      ],
    });

    editorView = new EditorView({
      state,
      parent: editorContainer,
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
          insert: content,
        },
      });
    }
  }

  // Mount CodeMirror when component mounts
  onMount(() => {
    // Initialize dark mode state
    isDarkMode = document.documentElement.classList.contains('dark');
    createEditor();

    // Watch for dark mode changes
    const observer = new MutationObserver(() => {
      const newDarkMode = document.documentElement.classList.contains('dark');
      if (newDarkMode !== isDarkMode) {
        isDarkMode = newDarkMode;
        // Recreate editor with new theme
        if (editorView) {
          const currentContent = editorView.state.doc.toString();
          editorView.destroy();
          createEditor();
          // Restore content
          if (editorView && currentContent !== content) {
            editorView.dispatch({
              changes: {
                from: 0,
                to: editorView.state.doc.length,
                insert: currentContent,
              },
            });
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      if (editorView) {
        editorView.destroy();
      }
    };
  });
</script>

<div class="flex flex-col space-y-4">
  <!-- Smart Publishing Interface -->
  <div
    class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4"
  >
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <h3 class="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
          Unified AsciiDoc Publisher
        </h3>
        <div
          class="flex flex-col lg:flex-row lg:items-center lg:space-x-4 mb-3 space-y-2 lg:space-y-0"
        >
          <div class="flex items-center space-x-2">
            <label
              for="parse-level"
              class="text-xs text-gray-600 dark:text-gray-400 font-medium"
              >Parse Level:</label
            >
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
            <span
              class="ml-1 px-2 py-0.5 rounded-full text-xs font-medium {contentType ===
              'article'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                : contentType === 'scattered-notes'
                  ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}"
            >
              {contentType === "article"
                ? "Article"
                : contentType === "scattered-notes"
                  ? "Notes"
                  : "None"}
            </span>
          </div>

          {#if generatedEvents}
            <div class="text-xs text-gray-600 dark:text-gray-400">
              <span class="font-medium">Events:</span>
              <span class="ml-1"
                >{generatedEvents.contentEvents.length +
                  (generatedEvents.indexEvent ? 1 : 0)}</span
              >
            </div>
          {/if}
        </div>
      </div>

      <!-- Button on the right side of publisher -->
      {#if publicationResult?.metadata?.eventStructure && generatedEvents}
        <Button
          color="light"
          size="xs"
          onclick={toggleStructurePreview}
          class="flex items-center space-x-1 ml-4"
        >
          <ChartPieOutline class="w-3 h-3" />
          <span class="text-xs">Structure</span>
        </Button>
      {/if}
    </div>
  </div>

  <div
    class="flex flex-col lg:flex-row items-center justify-between space-y-2 lg:space-y-0"
  >
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
        <span>{showTutorial ? "Hide" : "Show"} Help</span>
      </Button>
    </div>

    <!-- Publishing Button -->
    {#if generatedEvents && contentType !== "none"}
      <Button color="primary" size="sm" onclick={handlePublish}>Publish</Button>
    {:else}
      <div class="text-xs text-gray-500 dark:text-gray-400">
        Add content to enable publishing
      </div>
    {/if}
  </div>

  <div
    class="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-6 h-[60vh] min-h-[400px] max-h-[800px]"
  >
    <!-- Editor Panel -->
    <div
      class="{(showPreview && (showTutorial || showStructurePreview)) ||
      (showTutorial && showStructurePreview)
        ? 'lg:w-1/3'
        : showPreview || showTutorial || showStructurePreview
          ? 'lg:w-3/5'
          : 'w-full'} flex flex-col"
    >
      <div
        class="flex-1 relative border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
        style="overflow: hidden;"
      >
        <!-- CodeMirror Editor Container -->
        <div bind:this={editorContainer} class="w-full h-full"></div>
      </div>
    </div>

    <!-- Preview Panel -->
    {#if showPreview}
      <div
        class="{showTutorial || showStructurePreview
          ? 'lg:w-1/3'
          : 'lg:w-2/5'} flex flex-col"
      >
        <div
          class="border border-gray-200 dark:border-gray-700 rounded-lg h-full flex flex-col overflow-hidden"
        >
          <div
            class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
          >
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              AsciiDoc Preview
            </h3>
          </div>

          <div class="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <div class="max-w-4xl mx-auto">
            {#if !content.trim()}
              <div
                class="text-gray-500 dark:text-gray-400 text-sm text-center py-8"
              >
                Start typing to see the preview...
              </div>
            {:else}
              <div class="prose prose-sm dark:prose-invert max-w-none">
                <!-- Render full document with title if it's an article -->
                {#if contentType === "article" && publicationResult?.metadata.title}
                  {@const documentHeader = content.split(/\n==\s+/)[0]}
                  <div
                    class="mb-6 border-b border-gray-200 dark:border-gray-700 pb-4"
                  >
                    <div class="asciidoc-content">
                      {@html asciidoctor.convert(documentHeader, {
                        standalone: false,
                        attributes: {
                          showtitle: true,
                          sectids: false,
                        },
                      })}
                    </div>
                  </div>
                {/if}

                {#each parsedSections as section, index}
                  <div
                    class="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700 last:border-0"
                  >
                    {#if section.isIndex}
                      <!-- Index event: show title and tags -->
                      <div class="space-y-3">
                        <!-- Event type indicator -->
                        <div
                          class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Index Event (30040)
                        </div>

                        <!-- Title -->
                        <h2
                          class="text-lg font-bold text-gray-900 dark:text-gray-100"
                        >
                          {section.title}
                        </h2>

                        <!-- Tags (blue for index events) -->
                        {#if section.tags && section.tags.length > 0}
                          <div class="flex flex-wrap gap-2">
                            {#each section.tags as tag}
                              <span
                                class="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-1 rounded-full text-xs font-medium"
                              >
                                #{tag[1]}
                              </span>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <!-- Content event: show title, tags, then content -->
                      <div class="space-y-3">
                        <!-- Event type indicator -->
                        <div
                          class="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider"
                        >
                          Content Event (30041)
                        </div>

                        <!-- Title at correct heading level -->
                        <div
                          class="prose prose-sm dark:prose-invert max-w-none"
                        >
                          {@html asciidoctor.convert(
                            `${"=".repeat(section.level)} ${section.title}`,
                            {
                              standalone: false,
                              attributes: {
                                showtitle: false,
                                sectids: false,
                              },
                            },
                          )}
                        </div>

                        <!-- Tags (green for content events) -->
                        {#if section.tags && section.tags.length > 0}
                          <div class="flex flex-wrap gap-2">
                            {#each section.tags as tag}
                              <span
                                class="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-1 rounded-full text-xs font-medium"
                              >
                                #{tag[1]}
                              </span>
                            {/each}
                          </div>
                        {/if}

                        <!-- Content rendered as AsciiDoc -->
                        {#if section.content}
                          <div
                            class="prose prose-sm dark:prose-invert max-w-none mt-4"
                          >
                            {@html (() => {
                              // Check if content contains nested headers
                              const hasNestedHeaders = section.content.includes('\n===') || section.content.includes('\n====');
                              
                              if (hasNestedHeaders) {
                                // For proper nested header parsing, we need full document context
                                // Create a complete AsciiDoc document structure
                                // Important: Ensure proper level sequence for nested headers
                                const fullDoc = `= Temporary Document\n\n${"=".repeat(section.level)} ${section.title}\n\n${section.content}`;
                                
                                
                                const rendered = asciidoctor.convert(fullDoc, {
                                  standalone: false,
                                  attributes: {
                                    showtitle: false,
                                    sectids: false,
                                  },
                                });
                                
                                
                                // Extract just the content we want (remove the temporary structure)
                                // Find the section we care about
                                const sectionStart = rendered.indexOf(`<h${section.level}`);
                                if (sectionStart !== -1) {
                                  const nextSectionStart = rendered.indexOf(`</h${section.level}>`, sectionStart);
                                  if (nextSectionStart !== -1) {
                                    // Get everything after our section header
                                    const afterHeader = rendered.substring(nextSectionStart + `</h${section.level}>`.length);
                                    // Find where the section ends (at the closing div)
                                    const sectionEnd = afterHeader.lastIndexOf('</div>');
                                    if (sectionEnd !== -1) {
                                      const extracted = afterHeader.substring(0, sectionEnd);
                                      return extracted;
                                    }
                                  }
                                }
                                return rendered;
                              } else {
                                // Simple content without nested headers
                                return asciidoctor.convert(section.content, {
                                  standalone: false,
                                  attributes: {
                                    showtitle: false,
                                    sectids: false,
                                  },
                                });
                              }
                            })()}
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <!-- Event boundary indicator -->
                    {#if index < parsedSections.length - 1}
                      <div class="mt-6 relative">
                        <div class="absolute inset-0 flex items-center">
                          <div
                            class="w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600"
                          ></div>
                        </div>
                        <div class="relative flex justify-center">
                          <span
                            class="bg-white dark:bg-gray-800 px-3 text-xs text-gray-500 dark:text-gray-400"
                          >
                            Event Boundary
                          </span>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <div
                class="mt-4 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded border"
              >
                <strong>Event Count:</strong>
                {#if generatedEvents}
                  {@const indexEvents = generatedEvents.contentEvents.filter(
                    (e: any) => e.kind === 30040,
                  )}
                  {@const contentOnlyEvents =
                    generatedEvents.contentEvents.filter(
                      (e: any) => e.kind === 30041,
                    )}
                  {@const totalIndexEvents =
                    indexEvents.length + (generatedEvents.indexEvent ? 1 : 0)}
                  {@const totalEvents =
                    totalIndexEvents + contentOnlyEvents.length}
                  {totalEvents} event{totalEvents !== 1 ? "s" : ""}
                  ({totalIndexEvents} index{totalIndexEvents !== 1
                    ? " events"
                    : ""} + {contentOnlyEvents.length} content{contentOnlyEvents.length !==
                  1
                    ? " events"
                    : ""})
                {:else}
                  0 events
                {/if}
              </div>
            {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Tutorial Sidebar -->
    {#if showTutorial}
      <div
        class="{showPreview || showStructurePreview
          ? 'lg:w-1/3'
          : 'lg:w-2/5'} flex flex-col"
      >
        <div
          class="border border-gray-200 dark:border-gray-700 rounded-lg h-full flex flex-col overflow-hidden"
        >
          <div
            class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
          >
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              AsciiDoc Guide
            </h3>
          </div>

          <div
            class="flex-1 overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300 space-y-4"
          >
            <!-- Syntax Highlighting Legend -->
            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Header Highlighting
              </h4>
              <div class="space-y-2 text-xs">
                <div class="flex items-center space-x-2">
                  <div
                    class="w-4 h-4 rounded"
                    style="background: linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1)); border-left: 2px solid #3B82F6;"
                  ></div>
                  <span
                    ><strong class="text-blue-600">Blue:</strong> Index Events (30040)</span
                  >
                </div>
                <div class="flex items-center space-x-2">
                  <div
                    class="w-4 h-4 rounded"
                    style="background: linear-gradient(to right, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1)); border-left: 2px solid #10B981;"
                  ></div>
                  <span
                    ><strong class="text-green-600">Green:</strong> Content Events
                    (30041)</span
                  >
                </div>
                <div class="flex items-center space-x-2">
                  <div
                    class="w-4 h-4 rounded bg-amber-200 dark:bg-amber-800"
                    style="text-decoration: underline;"
                  ></div>
                  <span
                    ><strong class="text-amber-600">Amber:</strong> Potential Events
                    (at parse level)</span
                  >
                </div>
                <div class="flex items-center space-x-2">
                  <div
                    class="w-4 h-4 rounded bg-gray-200 dark:bg-gray-600"
                    style="font-style: italic;"
                  ></div>
                  <span
                    ><strong class="text-gray-600">Gray:</strong> Subheaders (within
                    content)</span
                  >
                </div>
              </div>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Publishing Levels
              </h4>
              <ul class="space-y-1 text-xs">
                {#each generateParseLevelOptions(MIN_PARSE_LEVEL, MAX_PARSE_LEVEL) as option}
                  <li>
                    <strong>Level {option.level}:</strong>
                    {#if option.level === 2}
                      Only {"=".repeat(option.level)} sections become events (containing
                      {"=".repeat(option.level + 1)} and deeper)
                    {:else}
                      {"=".repeat(option.level - 1)} sections become indices, {"=".repeat(
                        option.level,
                      )} sections become events
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Example Structure
              </h4>
              <pre
                class="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto">{`= Understanding Knowledge
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
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Attributes
              </h4>
              <p class="text-xs">
                Use <code>:key: value</code> format to add metadata that becomes
                event tags.
              </p>
            </div>

            <div>
              <h4 class="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Content Types
              </h4>
              <ul class="space-y-1 text-xs">
                <li>
                  <strong>Article:</strong> Starts with = title, creates index +
                  content events
                </li>
                <li>
                  <strong>Notes:</strong> Just == sections, creates individual content
                  events
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Structure Preview Sidebar -->
    {#if showStructurePreview}
      <div
        class="{showPreview || showTutorial
          ? 'lg:w-1/3'
          : 'lg:w-2/5'} flex flex-col"
      >
        <div
          class="border border-gray-200 dark:border-gray-700 rounded-lg h-full flex flex-col overflow-hidden"
        >
          <div
            class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
          >
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              Event Structure
            </h3>
          </div>

          <div
            class="flex-1 overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300"
          >
            {#if publicationResult?.metadata?.eventStructure && publicationResult.metadata.eventStructure.length > 0}
              <!-- Event counts summary -->
              <div class="mb-4 grid grid-cols-2 gap-2">
                <div class="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">📁</span>
                    <div>
                      <div
                        class="text-xs font-medium text-blue-800 dark:text-blue-200"
                      >
                        Index Events
                      </div>
                      <div class="text-xs text-blue-600 dark:text-blue-400">
                        {publicationResult.metadata.eventStructure.filter(
                          (n: any) => n.eventKind === 30040,
                        ).length +
                          publicationResult.metadata.eventStructure.reduce(
                            (acc: number, n: any) =>
                              acc +
                              (n.children?.filter?.(
                                (c: any) => c.eventKind === 30040,
                              )?.length || 0),
                            0,
                          )} × 30040
                      </div>
                    </div>
                  </div>
                </div>

                <div class="bg-green-50 dark:bg-green-900/20 p-2 rounded">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">📄</span>
                    <div>
                      <div
                        class="text-xs font-medium text-green-800 dark:text-green-200"
                      >
                        Content Events
                      </div>
                      <div class="text-xs text-green-600 dark:text-green-400">
                        {generatedEvents.contentEvents.length} × 30041
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Hierarchical structure -->
              <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                <div class="font-mono text-xs space-y-1">
                  {#snippet renderEventNode(node, depth = 0)}
                    <div class="py-0.5" style="margin-left: {depth * 1}rem;">
                      {node.eventKind === 30040 ? "📁" : "📄"}
                      [{node.eventKind}] {node.title || "Untitled"}
                    </div>
                    {#if node.children && node.children.length > 0}
                      {#each node.children as child}
                        {@render renderEventNode(child, depth + 1)}
                      {/each}
                    {/if}
                  {/snippet}

                  {#each publicationResult.metadata.eventStructure as node}
                    {@render renderEventNode(node, 0)}
                  {/each}
                </div>
              </div>

              <!-- Parse level info -->
              <div class="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded text-xs">
                <div class="font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Parse Level {parseLevel}
                </div>
                <div class="text-gray-600 dark:text-gray-400">
                  {#if parseLevel === 2}
                    Each == section becomes a 30041 event with all nested
                    content.
                  {:else if parseLevel === 3}
                    Level 2 sections with children → 30040 indices<br />
                    Level 3 sections → 30041 content events
                  {:else}
                    Sections with children → 30040 indices<br />
                    Level {parseLevel} sections → 30041 content events
                  {/if}
                </div>
              </div>

              <!-- Legend -->
              <div
                class="mt-4 text-xs text-gray-500 dark:text-gray-400 border-t pt-3"
              >
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span>📁</span>
                    <span>Index - references other events</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span>📄</span>
                    <span>Content - contains article text</span>
                  </div>
                </div>
              </div>
            {:else}
              <div class="text-center text-gray-500 dark:text-gray-400 py-8">
                <div>Add content to see event structure</div>
                <!-- Debug info -->
                <div class="text-xs mt-2">
                  Debug: {JSON.stringify(
                    {
                      hasResult: !!publicationResult,
                      hasMetadata: !!publicationResult?.metadata,
                      hasStructure:
                        !!publicationResult?.metadata?.eventStructure,
                      structureLength:
                        publicationResult?.metadata?.eventStructure?.length ||
                        0,
                      hasEvents: !!generatedEvents,
                      contentLength:
                        generatedEvents?.contentEvents?.length || 0,
                    },
                    null,
                    2,
                  )}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
