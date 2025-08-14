<script lang="ts">
  import { onMount } from "svelte";
  import EmbeddedEvent from "./EmbeddedEvent.svelte";

  const {
    content,
    nestingLevel = 0,
  } = $props<{
    content: string;
    nestingLevel?: number;
  }>();

  let embeddedEvents = $state<Array<{
    id: string;
    nostrId: string;
    nestingLevel: number;
  }>>([]);

  // AI-NOTE: 2025-01-24 - Component that renders content and replaces embedded event placeholders
  // with actual EmbeddedEvent components

  $effect(() => {
    if (content) {
      extractEmbeddedEvents();
    }
  });

  function extractEmbeddedEvents() {
    const placeholderPattern = /<div class="embedded-event-placeholder" data-nostr-id="([^"]+)" data-nesting-level="(\d+)" id="([^"]+)"><\/div>/g;
    const events: Array<{
      id: string;
      nostrId: string;
      nestingLevel: number;
    }> = [];
    
    let match;
    while ((match = placeholderPattern.exec(content)) !== null) {
      const nostrId = match[1];
      const level = parseInt(match[2], 10);
      const componentId = match[3];
      
      // Only process event-related identifiers (note, nevent, naddr)
      if (nostrId.match(/^nostr:(note|nevent|naddr)/)) {
        events.push({
          id: componentId,
          nostrId,
          nestingLevel: level,
        });
      }
    }
    
    embeddedEvents = events;
  }

  function renderContent() {
    let renderedContent = content;
    
    // Replace placeholders with component references
    embeddedEvents.forEach(eventInfo => {
      const placeholder = `<div class="embedded-event-placeholder" data-nostr-id="${eventInfo.nostrId}" data-nesting-level="${eventInfo.nestingLevel}" id="${eventInfo.id}"></div>`;
      const componentRef = `<div class="embedded-event-component" data-component-id="${eventInfo.id}"></div>`;
      renderedContent = renderedContent.replace(placeholder, componentRef);
    });
    
    return renderedContent;
  }
</script>

<div class="embedded-event-renderer">
  {@html renderContent()}
  
  <!-- Render embedded events -->
  {#each embeddedEvents as eventInfo}
    <div class="my-4" data-component-id={eventInfo.id}>
      <EmbeddedEvent 
        nostrIdentifier={eventInfo.nostrId} 
        nestingLevel={eventInfo.nestingLevel} 
      />
    </div>
  {/each}
</div>


