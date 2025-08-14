<script lang="ts">
  import { onMount } from "svelte";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import EmbeddedEvent from "./EmbeddedEvent.svelte";

  const {
    content,
    nestingLevel = 0,
  } = $props<{
    content: string;
    nestingLevel?: number;
  }>();

  let parsedContent = $state("");
  let embeddedEvents = $state<Array<{
    id: string;
    nostrId: string;
    nestingLevel: number;
  }>>([]);

  // Maximum nesting level allowed
  const MAX_NESTING_LEVEL = 3;

  // AI-NOTE: 2025-01-24 - Component for rendering content with embedded Nostr events
  // Processes content and replaces nostr: links with EmbeddedEvent components

  $effect(() => {
    if (content) {
      processContent();
    }
  });

  async function processContent() {
    try {
      // First parse the basic markup
      parsedContent = await parseBasicmarkup(content);
      
      // Then find and extract embedded events
      extractEmbeddedEvents();
    } catch (error) {
      console.error("Error processing content:", error);
      parsedContent = content; // Fallback to raw content
    }
  }

  function extractEmbeddedEvents() {
    const nostrPattern = /nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g;
    const events: Array<{
      id: string;
      nostrId: string;
      nestingLevel: number;
    }> = [];
    
    let match;
    while ((match = nostrPattern.exec(parsedContent)) !== null) {
      const nostrId = match[0];
      const componentId = `embedded-event-${Math.random().toString(36).substr(2, 9)}`;
      
      events.push({
        id: componentId,
        nostrId,
        nestingLevel: nestingLevel,
      });
      
      // Replace the nostr: link with a placeholder
      parsedContent = parsedContent.replace(
        nostrId,
        `<div class="embedded-event-placeholder" data-component-id="${componentId}"></div>`
      );
    }
    
    embeddedEvents = events;
  }

  function renderEmbeddedEvent(eventInfo: { id: string; nostrId: string; nestingLevel: number }) {
    if (eventInfo.nestingLevel >= MAX_NESTING_LEVEL) {
      // At max nesting level, just show the link
      return `<a href="/events?id=${eventInfo.nostrId}" class="text-primary-600 dark:text-primary-500 hover:underline break-all">${eventInfo.nostrId}</a>`;
    }
    
    // Return a placeholder that will be replaced by the component
    return `<div class="embedded-event-placeholder" data-component-id="${eventInfo.id}"></div>`;
  }
</script>

<div class="content-with-embedded-events min-w-0 overflow-hidden">
  {@html parsedContent}
  
  <!-- Render embedded events -->
  {#each embeddedEvents as eventInfo}
    <div class="my-4 min-w-0 overflow-hidden" data-component-id={eventInfo.id}>
      <EmbeddedEvent 
        nostrIdentifier={eventInfo.nostrId} 
        nestingLevel={eventInfo.nestingLevel} 
      />
    </div>
  {/each}
</div>


