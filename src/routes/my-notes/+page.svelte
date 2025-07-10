<script lang="ts">
  import { onMount } from 'svelte';
  import { ndkInstance, ndkSignedIn, activePubkey } from '$lib/ndk';
  import { goto } from '$app/navigation';
  import { Button, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell, Input, Checkbox } from 'flowbite-svelte';
  import { EditOutline, FilePenOutline, AnnotationOutline, ChevronDownOutline, SearchOutline } from 'flowbite-svelte-icons';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import NoteViewer from '$lib/components/NoteViewer.svelte';
  import NoteEditor from '$lib/components/NoteEditor.svelte';
  import { NDKRelaySetFromNDK } from '$lib/utils/nostrUtils';

  // State
  type NoteWithRelays = {
    event: NDKEvent;
    relays: string[];
  };
  
  let notes = $state<NoteWithRelays[]>([]);
  let filteredNotes = $state<NoteWithRelays[]>([]);
  let loading = $state<boolean>(false);
  let checkingAttachments = $state<boolean>(false);
  let searchTerm = $state<string>('');
  let selectedNote = $state<NDKEvent | null>(null);
  let showViewer = $state<boolean>(false);
  let showEditor = $state<boolean>(false);
  let editingNote = $state<NDKEvent | null>(null);
  
  // Filtering state
  let selectedTags = $state<string[]>([]);
  let selectedRelays = $state<string[]>([]);
  let selectedTypes = $state<string[]>([]);
  let onlyUnattached = $state<boolean>(false);
  
  // Dropdown state
  let showTagsDropdown = $state<boolean>(false);
  let showRelaysDropdown = $state<boolean>(false);
  let showTypesDropdown = $state<boolean>(false);
  
  // Sorting state
  let sortField = $state<'title' | 'created' | 'type'>('created');
  let sortDirection = $state<'asc' | 'desc'>('desc');
  
  // Available filter options
  let availableTags = $state<string[]>([]);
  let availableRelays = $state<string[]>([]);
  let availableTypes = $state<string[]>([]);

  let tagCounts = $state<Record<string, number>>({});
  let relayCounts = $state<Record<string, number>>({});
  let typeCounts = $state<Record<string, number>>({});
  
  // Track attachment status for notes
  let noteAttachmentStatus = $state<Record<string, boolean>>({});

  let lastPubkey: string | null = null;
  $effect(() => {
    if ($ndkSignedIn && $activePubkey && $activePubkey !== lastPubkey) {
      lastPubkey = $activePubkey;
      fetchNotes();
    }
  });

  // Use a single effect for filtering
  $effect(() => {
    // Only run when notes, filters, or attachment status change
    applyFilters();
  });

  // Re-apply filters when attachment status changes
  $effect(() => {
    if (Object.keys(noteAttachmentStatus).length > 0) {
      applyFilters();
    }
  });

  async function fetchNotes() {
    console.log('fetchNotes: start');
    loading = true;
    notes = [];
    try {
      const ndk = $ndkInstance;
      const user = ndk.getUser({ pubkey: $activePubkey ?? undefined });
      const userRelays = await getUserRelays(user);

      if (!userRelays || userRelays.length === 0) {
        console.warn('No relays found for user.');
        notes = [];
        updateFilterOptions();
        applyFilters();
        loading = false;
        return;
      }

      const eventMap = new Map<string, { event: NDKEvent; relays: string[] }>();

      // Gather all fetch promises
      const fetchPromises = userRelays.map(async (relay) => {
        try {
          console.log('fetchNotes: fetching from relay', relay);
          const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
          const eventsSet = await ndk.fetchEvents({
            kinds: [30041, 30, 31, 32, 33] as any[],
            authors: [$activePubkey ?? '']
          }, undefined, relaySet).withTimeout(3000);
          console.log('fetchNotes: got events from relay', relay, eventsSet);
          Array.from(eventsSet as Set<NDKEvent>).forEach(event => {
            const eventId = event.id;
            if (eventMap.has(eventId)) {
              const existing = eventMap.get(eventId)!;
              if (!existing.relays.includes(relay)) {
                existing.relays.push(relay);
              }
            } else {
              eventMap.set(eventId, {
                event,
                relays: [relay]
              });
            }
          });
          // Update notes and filteredNotes immediately
          notes = Array.from(eventMap.values()).map(({ event, relays }) => ({ event, relays }));
          applyFilters();
        } catch (error) {
          console.warn(`Failed to fetch from relay ${relay}:`, error);
        }
      });

      // Wait for all fetches to settle
      await Promise.allSettled(fetchPromises);

      await checkNoteAttachmentStatus();
      updateFilterOptions();
      applyFilters();
      loading = false;
      console.log('fetchNotes: end, loading =', loading);
    } catch (error) {
      console.error('fetchNotes: error', error);
      notes = [];
      updateFilterOptions();
      applyFilters();
      loading = false;
    }
  }

  async function getUserRelays(user: any): Promise<string[]> {
    const relays = new Set<string>();
    
    // Add community relays
    relays.add('wss://theforest.nostr1.com');
    
    // Add user's inbox relays (kind 10002)
    try {
      const inboxEvents = await $ndkInstance.fetchEvents({
        kinds: [10002] as any[],
        authors: [$activePubkey ?? '']
      });
      
      inboxEvents.forEach(event => {
        event.tags.filter(tag => tag[0] === 'r').forEach(tag => {
          relays.add(tag[1]);
        });
      });
    } catch (error) {
      console.warn('Failed to fetch inbox relays:', error);
    }
    
    // Add user's local relays (kind 10432)
    try {
      const localEvents = await $ndkInstance.fetchEvents({
        kinds: [10432] as any[],
        authors: [$activePubkey ?? '']
      });
      
      localEvents.forEach(event => {
        event.tags.filter(tag => tag[0] === 'r').forEach(tag => {
          relays.add(tag[1]);
        });
      });
    } catch (error) {
      console.warn('Failed to fetch local relays:', error);
    }
    
    return Array.from(relays);
  }

  async function checkNoteAttachmentStatus() {
    checkingAttachments = true;
    const statusMap: Record<string, boolean> = {};
    
    try {
      // Check attachment status for each note
      for (const noteWithRelays of notes) {
        const note = noteWithRelays.event;
        statusMap[note.id] = await isNoteAttached(note);
      }
      
      noteAttachmentStatus = statusMap;
    } finally {
      checkingAttachments = false;
    }
  }

  function updateFilterOptions() {
    const tags = new Set<string>();
    const relays = new Set<string>();
    const types = new Set<string>();
    const tagCounter: Record<string, number> = {};
    const relayCounter: Record<string, number> = {};
    const typeCounter: Record<string, number> = {};

    notes.forEach(noteWithRelays => {
      const note = noteWithRelays.event;

      // Hashtags
      note.tags.forEach((tag: string[]) => {
        if (tag[0] === 't' && tag[1]) {
          tags.add(tag[1]);
          tagCounter[tag[1]] = (tagCounter[tag[1]] || 0) + 1;
        }
      });

      // Relays
      const relayList = noteWithRelays.relays.map(r => r.trim());
      relayList.forEach(relay => {
        if (relay) {
          relays.add(relay);
          relayCounter[relay] = (relayCounter[relay] || 0) + 1;
        }
      });

      // Types
      const type = note.kind === 30041 ? 'zettel' : 'citation';
      types.add(type);
      typeCounter[type] = (typeCounter[type] || 0) + 1;
    });

    availableTags = Array.from(tags);
    availableRelays = Array.from(relays);
    availableTypes = Array.from(types);

    tagCounts = tagCounter;
    notes.forEach(noteWithRelays => {
      noteWithRelays.relays.forEach(relay => {
        relayCounts[relay] = (relayCounts[relay] || 0) + 1;
      });
    });
    typeCounts = typeCounter;
  }

  function applyFilters() {
    let filtered = [...notes];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(noteWithRelays => {
        const note = noteWithRelays.event;
        const title = getNoteTitle(note).toLowerCase();
        const summary = getNoteSummary(note).toLowerCase();
        const content = getNoteContent(note).toLowerCase();
        return title.includes(term) || summary.includes(term) || content.includes(term);
      });
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(noteWithRelays => {
        const note = noteWithRelays.event;
        return selectedTags.some(tag => 
          note.tags.some((noteTag: string[]) => noteTag[0] === tag)
        );
      });
    }

    // Relay filter
    if (selectedRelays.length > 0) {
      filtered = filtered.filter(noteWithRelays => {
        const relayList = noteWithRelays.relays.map(r => r.trim());
        return selectedRelays.some(selectedRelay => relayList.includes(selectedRelay));
      });
    }

    // Type filter
    if (selectedTypes.length > 0) {
      filtered = filtered.filter(noteWithRelays => {
        const note = noteWithRelays.event;
        const type = note.kind === 30041 ? 'zettel' : 'citation';
        return selectedTypes.includes(type);
      });
    }

    // Unattached filter
    if (onlyUnattached) {
      filtered = filtered.filter(noteWithRelays => {
        // Use pre-computed attachment status
        return !noteAttachmentStatus[noteWithRelays.event.id];
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'title':
          aValue = getNoteTitle(a.event);
          bValue = getNoteTitle(b.event);
          break;
        case 'created':
          aValue = a.event.created_at;
          bValue = b.event.created_at;
          break;
        case 'type':
          aValue = a.event.kind === 30041 ? 'zettel' : 'citation';
          bValue = a.event.kind === 30041 ? 'zettel' : 'citation';
          break;
        default:
          aValue = a.event.created_at;
          bValue = b.event.created_at;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    filteredNotes = filtered;
  }

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

  async function isNoteAttached(note: NDKEvent): Promise<boolean> {
    try {
      const ndk = $ndkInstance;
      
      // Search for publications (kind 30040) that reference this note
      const publications = await ndk.fetchEvents({
        kinds: [30040] as any[],
        '#e': [note.id] // Look for publications that reference this event
      });
      
      return publications.size > 0;
    } catch (error) {
      console.warn('Failed to check if note is attached:', error);
      return false;
    }
  }

  function handleSort(field: 'title' | 'created' | 'type') {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'desc';
    }
    applyFilters();
  }

  function handleRowClick(note: NDKEvent) {
    selectedNote = note;
    showViewer = true;
  }

  function handleEdit(note: NDKEvent) {
    editingNote = note;
    showEditor = true;
  }

  function handleNoteSaved() {
    showEditor = false;
    editingNote = null;
    fetchNotes(); // Refresh the notes
  }

  function handleViewerClose() {
    showViewer = false;
    selectedNote = null;
  }

  function toggleDropdown(dropdownType: 'tags' | 'relays' | 'types') {
    if (dropdownType === 'tags') {
      showTagsDropdown = !showTagsDropdown;
      showRelaysDropdown = false;
      showTypesDropdown = false;
    } else if (dropdownType === 'relays') {
      showRelaysDropdown = !showRelaysDropdown;
      showTagsDropdown = false;
      showTypesDropdown = false;
    } else if (dropdownType === 'types') {
      showTypesDropdown = !showTypesDropdown;
      showTagsDropdown = false;
      showRelaysDropdown = false;
    }
  }

  function selectFilterOption(type: 'tags' | 'relays' | 'types', value: string) {
    if (type === 'tags') {
      if (selectedTags.includes(value)) {
        selectedTags = selectedTags.filter(tag => tag !== value);
      } else {
        selectedTags = [...selectedTags, value];
      }
    } else if (type === 'relays') {
      if (selectedRelays.includes(value)) {
        selectedRelays = selectedRelays.filter(relay => relay !== value);
      } else {
        selectedRelays = [...selectedRelays, value];
      }
    } else if (type === 'types') {
      if (selectedTypes.includes(value)) {
        selectedTypes = selectedTypes.filter(type => type !== value);
      } else {
        selectedTypes = [...selectedTypes, value];
      }
    }
  }

  function getSelectedCount(type: 'tags' | 'relays' | 'types'): number {
    if (type === 'tags') return selectedTags.length;
    if (type === 'relays') return selectedRelays.length;
    if (type === 'types') return selectedTypes.length;
    return 0;
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), ms)
      ),
    ]);
  }
</script>

<div class="container mx-auto px-4 py-8">
  {#if !$ndkSignedIn || !$activePubkey}
    <div class="text-center py-12">
      <FilePenOutline class="mx-auto h-16 w-16 text-gray-400 mb-4" />
      <h2 class="text-2xl font-semibold text-gray-700 mb-2">Login to see your notes</h2>
      <p class="text-gray-500 mb-6">Please sign in with your Nostr extension to view and manage your notes.</p>
      <Button onclick={() => goto('/')}>Go to Home</Button>
    </div>
  {:else}
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-4">My Notes</h1>
    
    <!-- Search and Filters -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="relative">
        <SearchOutline class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <Input 
          bind:value={searchTerm}
          placeholder="Search notes..."
          class="pr-10"
        />
      </div>
      
      <!-- Tags Dropdown -->
      <div class="relative">
        <button
          onclick={() => toggleDropdown('tags')}
          class="w-full px-3 py-2 text-left border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <span class="flex items-center justify-between">
            <span>Tags {getSelectedCount('tags') > 0 ? `(${getSelectedCount('tags')})` : ''}</span>
            <ChevronDownOutline class="h-4 w-4" />
          </span>
        </button>
        {#if showTagsDropdown}
          <div class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {#each availableTags as tag}
              <label
                class="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 {selectedTags.includes(tag) ? 'bg-blue-50 text-blue-700' : ''}"
              >
                <input
                  type="checkbox"
                  class="form-checkbox"
                  checked={selectedTags.includes(tag)}
                  onchange={() => selectFilterOption('tags', tag)}
                />
                <span>{tag} <span class="ml-2 text-xs text-gray-400">({tagCounts[tag] ?? 0})</span></span>
              </label>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Relays Dropdown -->
      <div class="relative">
        <button
          onclick={() => toggleDropdown('relays')}
          class="w-full px-3 py-2 text-left border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <span class="flex items-center justify-between">
            <span>Relays {getSelectedCount('relays') > 0 ? `(${getSelectedCount('relays')})` : ''}</span>
            <ChevronDownOutline class="h-4 w-4" />
          </span>
        </button>
        {#if showRelaysDropdown}
          <div class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {#each availableRelays as relay}
              <label
                class="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 {selectedRelays.includes(relay) ? 'bg-blue-50 text-blue-700' : ''}"
              >
                <input
                  type="checkbox"
                  class="form-checkbox"
                  checked={selectedRelays.includes(relay)}
                  onchange={() => selectFilterOption('relays', relay)}
                />
                <span>{relay} <span class="ml-2 text-xs text-gray-400">({relayCounts[relay] ?? 0})</span></span>
              </label>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Types Dropdown -->
      <div class="relative">
        <button
          onclick={() => toggleDropdown('types')}
          class="w-full px-3 py-2 text-left border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <span class="flex items-center justify-between">
            <span>Types {getSelectedCount('types') > 0 ? `(${getSelectedCount('types')})` : ''}</span>
            <ChevronDownOutline class="h-4 w-4" />
          </span>
        </button>
        {#if showTypesDropdown}
          <div class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
            <button
              onclick={() => selectFilterOption('types', 'zettel')}
              class="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 {selectedTypes.includes('zettel') ? 'bg-blue-50 text-blue-700' : ''}"
            >
              <input
                type="checkbox"
                class="form-checkbox"
                checked={selectedTypes.includes('zettel')}
                onchange={() => selectFilterOption('types', 'zettel')}
              />
              <span>Zettel <span class="ml-2 text-xs text-gray-400">({typeCounts['zettel'] ?? 0})</span></span>
            </button>
            <button
              onclick={() => selectFilterOption('types', 'citation')}
              class="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 {selectedTypes.includes('citation') ? 'bg-blue-50 text-blue-700' : ''}"
            >
              <input
                type="checkbox"
                class="form-checkbox"
                checked={selectedTypes.includes('citation')}
                onchange={() => selectFilterOption('types', 'citation')}
              />
              <span>Citation <span class="ml-2 text-xs text-gray-400">({typeCounts['citation'] ?? 0})</span></span>
            </button>
          </div>
        {/if}
      </div>
    </div>
    
    <div class="mb-4">
      <Checkbox bind:checked={onlyUnattached}>Only show unattached notes</Checkbox>
    </div>
  </div>

  <!-- Notes Table -->
  {#if filteredNotes.length === 0}
    <div class="text-center py-8">
      <FilePenOutline class="mx-auto h-12 w-12 text-gray-400" />
      <p class="mt-2 text-gray-500">No notes found</p>
    </div>
  {:else}
    <div class="border border-gray-200 rounded-lg overflow-hidden">
      <div class="max-h-[40rem] overflow-y-auto">
        <Table class="w-full table-fixed">
          <TableHead class="sticky top-0 bg-gray-50 z-10">
            <TableHeadCell class="w-2/5">
              <button 
                class="flex items-center space-x-1 hover:text-primary-600"
                onclick={() => handleSort('title')}
              >
                <span>Title</span>
                {#if sortField === 'title'}
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </button>
            </TableHeadCell>
            <TableHeadCell class="w-1/5">
              <button 
                class="flex items-center space-x-1 hover:text-primary-600"
                onclick={() => handleSort('created')}
              >
                <span>Created Date</span>
                {#if sortField === 'created'}
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </button>
            </TableHeadCell>
            <TableHeadCell class="w-1/5">
              <button 
                class="flex items-center space-x-1 hover:text-primary-600"
                onclick={() => handleSort('type')}
              >
                <span>Type/Status</span>
                {#if sortField === 'type'}
                  <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </button>
            </TableHeadCell>
            <TableHeadCell class="w-1/5">Actions</TableHeadCell>
          </TableHead>
          <TableBody>
            {#each filteredNotes as noteWithRelays (noteWithRelays.event.id)}
              <TableBodyRow 
                class="cursor-pointer hover:bg-gray-50 py-1 {selectedNote?.id === noteWithRelays.event.id ? 'bg-blue-50' : ''}"
                onclick={() => handleRowClick(noteWithRelays.event)}
              >
                <TableBodyCell class="w-2/5 py-1">
                  <div class="flex items-center space-x-2 min-w-0">
                    {#if noteWithRelays.event.kind === 30041}
                      <FilePenOutline class="h-4 w-4 text-blue-500 flex-shrink-0" />
                    {:else}
                      <AnnotationOutline class="h-4 w-4 text-green-500 flex-shrink-0" />
                    {/if}
                    <span class="font-medium truncate min-w-0">{getNoteTitle(noteWithRelays.event)}</span>
                  </div>
                </TableBodyCell>
                <TableBodyCell class="w-1/5 py-1">
                  <span class="text-sm">
                    {noteWithRelays.event.created_at ? new Date(noteWithRelays.event.created_at * 1000).toLocaleDateString() : 'Unknown'}
                  </span>
                </TableBodyCell>
                <TableBodyCell class="w-1/5 py-1">
                  <div class="flex flex-col gap-1">
                    <span class="px-2 py-1 text-xs rounded-full {noteWithRelays.event.kind === 30041 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                      {getNoteType(noteWithRelays.event)}
                    </span>
                    {#if noteAttachmentStatus[noteWithRelays.event.id] !== undefined}
                      <span class="px-2 py-1 text-xs rounded-full {noteAttachmentStatus[noteWithRelays.event.id] ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}">
                        {noteAttachmentStatus[noteWithRelays.event.id] ? 'Attached' : 'Unattached'}
                      </span>
                    {/if}
                  </div>
                </TableBodyCell>
                <TableBodyCell class="w-1/5 py-1">
                  <Button 
                    size="xs" 
                    color="light"
                    onclick={(e: Event) => { e.stopPropagation(); handleEdit(noteWithRelays.event); }}
                  >
                    <EditOutline class="h-4 w-4" />
                  </Button>
                </TableBodyCell>
              </TableBodyRow>
            {/each}
          </TableBody>
        </Table>
      </div>
    </div>
  {/if}
  {/if}
</div>

<!-- Note Viewer Modal -->
{#if showViewer && selectedNote}
  <NoteViewer 
    note={selectedNote} 
    onClose={handleViewerClose}
    onEdit={(note) => {
      selectedNote = note;
      showViewer = false;
      editingNote = note;
      showEditor = true;
    }}
  />
{/if}

<!-- Note Editor Modal -->
{#if showEditor && editingNote}
  <NoteEditor 
    note={editingNote}
    onSaved={handleNoteSaved}
    onCancel={() => { showEditor = false; editingNote = null; }}
  />
{/if} 