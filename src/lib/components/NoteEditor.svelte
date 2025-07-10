<script lang="ts">
  import { Modal, Button, Input, Textarea, Label } from 'flowbite-svelte';
  import { FilePenOutline } from 'flowbite-svelte-icons';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { ndkInstance, activePubkey } from '$lib/ndk';

  let { 
    note,
    onSaved,
    onCancel
  } = $props<{ 
    note: NDKEvent;
    onSaved?: () => void;
    onCancel?: () => void;
  }>();
  let showModal = $state(true);

  // Form state
  let title = $state<string>('');
  let summary = $state<string>('');
  let content = $state<string>('');
  let tags = $state<string[][]>([]);
  let loading = $state<boolean>(false);
  let error = $state<string>('');
  let success = $state<string>('');

  // Initialize form with note data
  $effect(() => {
    if (note) {
      const dTag = note.tags.find((tag: string[]) => tag[0] === 'd');
      title = dTag ? dTag[1] : '';
      
      const summaryTag = note.tags.find((tag: string[]) => tag[0] === 'summary');
      summary = summaryTag ? summaryTag[1] : '';
      
      content = note.content || '';
      
      // Filter out d, summary, t, and title tags, keep only user tags
      tags = note.tags.filter((tag: string[]) =>
        tag[0] !== 'd' &&
        tag[0] !== 'summary' &&
        tag[0] !== 'title' &&
        !(tag[0] === 't' && (tag[1] === 'title' || tag[1] === 'summary' || tag[1] === 't'))
      );
    }
  });

  function getNoteType(note: NDKEvent): string {
    return note.kind === 30041 ? 'Zettel' : 'Citation';
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  async function handleSave() {
    if (!title.trim()) {
      error = 'Title is required';
      return;
    }

    loading = true;
    error = '';
    success = '';

    try {
      const ndk = $ndkInstance;
      const user = ndk.getUser({ pubkey: $activePubkey ?? undefined });
      
      // Create new event
      const newEvent = {
        kind: note.kind,
        content: content,
        tags: [
          ['d', title], // d-tag for title
          ['summary', summary], // summary tag
          ...tags // other tags
        ]
      };

      // Publish the event
      await user.publish();
      success = 'Note saved successfully!';
      setTimeout(() => {
        onSaved?.();
      }, 1000);
    } catch (err) {
      console.error('Error saving note:', err);
      error = err instanceof Error ? err.message : 'Failed to save note';
    } finally {
      loading = false;
    }
  }

  function handleCancel() {
    showModal = false;
    onCancel?.();
  }

  function addTag() {
    tags = [...tags, ['', '']];
  }

  function removeTag(index: number) {
    tags = tags.filter((_, i) => i !== index);
  }

  function updateTag(index: number, field: 0 | 1, value: string) {
    tags = tags.map((tag, i) => 
      i === index ? [field === 0 ? value : tag[0], field === 1 ? value : tag[1]] : tag
    );
  }
</script>

<Modal class='modal-leather' title='Edit Note' bind:open={showModal} autoclose outsideclose size='xl'>
  <div class="space-y-6">
    <!-- Note Info -->
    <div class="bg-gray-50 p-4 rounded-lg">
      <h3 class="font-medium text-gray-700 mb-2">Note Information</h3>
      <p class="text-sm text-gray-600">
        Type: {getNoteType(note)} • Created: {formatDate(note.created_at)}
      </p>
    </div>

    <!-- Title -->
    <div>
      <Label for="title" class="block mb-2">Title *</Label>
      <Input 
        id="title"
        bind:value={title}
        placeholder="Enter note title..."
        required
      />
    </div>

    <!-- Summary -->
    <div>
      <Label for="summary" class="block mb-2">Summary</Label>
      <Textarea 
        id="summary"
        bind:value={summary}
        placeholder="Enter note summary..."
        rows={3}
      />
    </div>

    <!-- Content -->
    <div>
      <Label for="content" class="block mb-2">Content</Label>
      <Textarea 
        id="content"
        bind:value={content}
        placeholder="Enter note content..."
        rows={10}
      />
    </div>

    <!-- Tags -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <Label class="block">Tags</Label>
        <Button size="xs" color="light" onclick={addTag}>
          Add Tag
        </Button>
      </div>
      
      <div class="space-y-2">
        {#each tags as tag, index}
          <div class="flex items-center space-x-2">
            <Input 
              placeholder="Tag name"
              value={tag[0]}
              oninput={(e) => updateTag(index, 0, (e.target as HTMLInputElement).value)}
              class="flex-1"
            />
            <Input 
              placeholder="Tag value"
              value={tag[1]}
              oninput={(e) => updateTag(index, 1, (e.target as HTMLInputElement).value)}
              class="flex-1"
            />
            <Button 
              size="xs" 
              color="red" 
              onclick={() => removeTag(index)}
            >
              ×
            </Button>
          </div>
        {/each}
      </div>
    </div>

    <!-- Error/Success Messages -->
    {#if error}
      <div class="p-3 bg-red-100 text-red-700 rounded">
        {error}
      </div>
    {/if}
    
    {#if success}
      <div class="p-3 bg-green-100 text-green-700 rounded">
        {success}
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex justify-end space-x-2">
      <Button color="light" onclick={handleCancel}>
        Cancel
      </Button>
      <Button 
        color="primary" 
        onclick={handleSave}
        disabled={loading}
      >
        {#if loading}
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
        {:else}
          💾
        {/if}
        Save
      </Button>
    </div>
  </div>
</Modal> 