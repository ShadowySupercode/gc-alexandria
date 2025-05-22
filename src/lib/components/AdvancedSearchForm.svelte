<script lang="ts">
  import { Button, Input, Select, Textarea, Label } from 'flowbite-svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    search: { query: string; filters: Record<string, string> };
    clear: void;
    cancel: void;
  }>();

  let isExpanded = $state(false);
  let isSearching = $state(false);
  let filters = $state({
    title: '',
    author: '',
    type: '',
    version: '',
    publishedOnStart: '',
    publishedOnEnd: '',
    publishedBy: '',
    summary: '',
    isbn: '',
    tags: '',
    source: ''
  });

  let hasActiveFilters = $derived.by(() => 
    Object.values(filters).some(value => String(value).trim() !== '')
  );

  let canSearch = $derived.by(() => 
    !isSearching && hasActiveFilters
  );

  let showClearButton = $derived.by(() => 
    hasActiveFilters && !isSearching
  );

  type ButtonColor = "red" | "primary" | "green" | "yellow" | "purple" | "blue" | "light" | "dark" | "none" | "alternative";
  let searchButtonText = $derived.by(() => isSearching ? 'Cancel' : 'Search');
  let searchButtonColor = $derived.by(() => (isSearching ? "red" : "primary") as ButtonColor);
  let expandButtonText = $derived.by(() => isExpanded ? 'Hide Advanced Search' : 'Show Advanced Search');
  let searchQuery = $derived.by(() => {
    return Object.entries(filters)
      .filter(([key, value]) => {
        if (key === 'publishedOnStart' || key === 'publishedOnEnd') {
          return String(value).trim() !== '';
        }
        return String(value).trim() !== '';
      })
      .map(([key, value]) => {
        if (key === 'publishedOnStart') {
          return `publishedOn:>=${value}`;
        }
        if (key === 'publishedOnEnd') {
          return `publishedOn:<=${value}`;
        }
        return `${key}:${value}`;
      })
      .join(' ');
  });

  function handleSearch() {
    if (isSearching) {
      dispatch('cancel');
      isSearching = false;
      return;
    }

    isSearching = true;
    dispatch('search', { query: searchQuery, filters });
  }

  function handleClear() {
    filters = {
      title: '',
      author: '',
      type: '',
      version: '',
      publishedOnStart: '',
      publishedOnEnd: '',
      publishedBy: '',
      summary: '',
      isbn: '',
      tags: '',
      source: ''
    };
    dispatch('clear');
  }
</script>

<div class="flex flex-col space-y-4">
  <div class="flex justify-between items-center">
    <Button 
      color="light" 
      onclick={() => isExpanded = !isExpanded}
      disabled={isSearching}
    >
      {expandButtonText}
    </Button>
    {#if showClearButton}
      <Button 
        color="light" 
        onclick={handleClear}
        disabled={isSearching}
      >
        Clear Filters
      </Button>
    {/if}
  </div>

  {#if isExpanded}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div class="col-span-2">
        <Label for="title">Title</Label>
        <Input id="title" bind:value={filters.title} placeholder="Search by title" />
      </div>

      <div>
        <Label for="author">Author</Label>
        <Input id="author" bind:value={filters.author} placeholder="Search by author name or pubkey" />
      </div>

      <div>
        <Label for="type">Publication Type</Label>
        <Select id="type" bind:value={filters.type}>
          <option value="">Any type</option>
          <option value="book">Book</option>
          <option value="illustrated">Illustrated</option>
          <option value="magazine">Magazine</option>
          <option value="documentation">Documentation</option>
          <option value="academic">Academic</option>
          <option value="blog">Blog</option>
        </Select>
      </div>

      <div>
        <Label for="version">Version</Label>
        <Input id="version" bind:value={filters.version} placeholder="e.g. 3rd edition" />
      </div>

      <div class="col-span-2 grid grid-cols-2 gap-4">
        <div>
          <Label for="publishedOnStart">Published Between</Label>
          <Input 
            id="publishedOnStart" 
            type="date" 
            bind:value={filters.publishedOnStart} 
            placeholder="Start date"
          />
        </div>
        <div>
          <Label for="publishedOnEnd" class="invisible">End Date</Label>
          <Input 
            id="publishedOnEnd" 
            type="date" 
            bind:value={filters.publishedOnEnd} 
            placeholder="End date"
          />
        </div>
      </div>

      <div>
        <Label for="publishedBy">Published By</Label>
        <Input id="publishedBy" bind:value={filters.publishedBy} placeholder="e.g. public domain" />
      </div>

      <div>
        <Label for="isbn">ISBN</Label>
        <Input id="isbn" bind:value={filters.isbn} placeholder="e.g. 9780765382030" />
      </div>

      <div>
        <Label for="tags">Tags</Label>
        <Input id="tags" bind:value={filters.tags} placeholder="Comma-separated tags" />
      </div>

      <div>
        <Label for="source">Source URL</Label>
        <Input id="source" bind:value={filters.source} placeholder="Original source URL" />
      </div>

      <div class="col-span-2">
        <Label for="summary">Summary</Label>
        <Textarea id="summary" bind:value={filters.summary} placeholder="Search in summary" class="h-20" />
      </div>
    </div>
  {/if}

  <div class="flex justify-end">
    <Button 
      onclick={handleSearch} 
      color={searchButtonColor}
      disabled={!canSearch}
    >
      {searchButtonText}
    </Button>
  </div>
</div> 