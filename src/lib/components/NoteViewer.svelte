<script lang="ts">
  import { Modal, Button } from 'flowbite-svelte';
  import { EditOutline } from 'flowbite-svelte-icons';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { parseAdvancedmarkup } from '$lib/utils/markup/advancedMarkupParser';
  import { parseBasicmarkup } from '$lib/utils/markup/basicMarkupParser';

  let { 
    note,
    onEdit,
    onClose
  } = $props<{ 
    note: NDKEvent;
    onEdit?: (note: NDKEvent) => void;
    onClose?: () => void;
  }>();
  let showModal = $state(true);

  function getNoteTitle(note: NDKEvent): string {
    const dTag = note.tags.find(tag => tag[0] === 'd');
    return dTag ? dTag[1] : 'Untitled';
  }

  function getNoteSummary(note: NDKEvent): string {
    const summaryTag = note.tags.find(tag => tag[0] === 'summary');
    return summaryTag ? summaryTag[1] : '';
  }

  function getNoteContent(note: NDKEvent): string {
    return note.content || '';
  }

  function getNoteType(note: NDKEvent): string {
    return note.kind === 30041 ? 'Zettel' : 'Citation';
  }

  async function renderContent(note: NDKEvent): Promise<string> {
    if (note.kind === 30041) {
      // Zettel - render as AsciiDoc
      return renderAsciiDoc(getNoteContent(note));
    } else {
      // Citation - render as NostrMarkup
      return await renderNostrMarkup(getNoteContent(note));
    }
  }

  function renderAsciiDoc(content: string): string {
    // Basic AsciiDoc rendering - this would need to be enhanced
    // For now, just return the content as-is
    return content;
  }

  async function renderNostrMarkup(content: string): Promise<string> {
    try {
      const parsed = await parseAdvancedmarkup(content);
      return parsed;
    } catch (error) {
      // Fallback to basic parser
      try {
        const parsed = await parseBasicmarkup(content);
        return parsed;
      } catch (error) {
        // If all parsing fails, return raw content
        return content;
      }
    }
  }

  function handleEdit() {
    onEdit?.(note);
  }

  function handleClose() {
    showModal = false;
    onClose?.();
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  let renderedContent = $state<string>('');

  $effect(() => {
    renderContent(note).then(content => {
      renderedContent = content;
    });
  });
</script>

<Modal class='modal-leather' title='Note Details' bind:open={showModal} autoclose outsideclose size='xl'>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-xl font-semibold">{getNoteTitle(note)}</h3>
        <p class="text-sm text-gray-500">
          {getNoteType(note)} • {formatDate(note.created_at)}
        </p>
      </div>
      <Button 
        color="light" 
        size="xs"
        onclick={handleEdit}
      >
        <EditOutline class="h-4 w-4 mr-1" />
        Edit
      </Button>
    </div>
    
    {#if getNoteSummary(note)}
      <div class="bg-gray-50 p-4 rounded-lg">
        <h4 class="font-medium text-gray-700 mb-2">Summary</h4>
        <p class="text-gray-600">{getNoteSummary(note)}</p>
      </div>
    {/if}
    
    <div class="prose max-w-none">
      {@html renderedContent}
    </div>
    
    {#if note.tags.length > 0}
      <div class="border-t pt-4">
        <h4 class="font-medium text-gray-700 mb-2">Tags</h4>
        <div class="flex flex-wrap gap-2">
          {#each note.tags as tag}
            {#if tag[0] && tag[0] !== 'd' && tag[0] !== 'summary' && tag[0] !== 'title' && !(tag[0] === 't' && (tag[1] === 'title' || tag[1] === 'summary' || tag[1] === 't'))}
              <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                {tag[0]}: {tag[1]}
              </span>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>
</Modal> 