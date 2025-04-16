<script lang='ts'>
  import { NDKEvent } from '@nostr-dev-kit/ndk';
  import { ndkInstance } from '$lib/ndk';
  import InlineProfile from '../InlineProfile.svelte';
  import NestedContent from './NestedContent.svelte';
  import ContentExpander from './ContentExpander.svelte';
  import { formatDate, isBoost, extractRepostedContent } from './utils';
  import type { ProfileData } from './types';
  
  let { 
    note, 
    eventCache, 
    profileCache, 
    disableFallback = false, 
    relayUrl,
    isExpanded,
    onToggleExpand,
    onViewDetails
  } = $props<{
    note: NDKEvent;
    eventCache: Map<string, NDKEvent>;
    profileCache: Map<string, ProfileData>;
    disableFallback?: boolean;
    relayUrl: string;
    isExpanded: boolean;
    onToggleExpand: (noteId: string) => void;
    onViewDetails: (note: NDKEvent) => void;
  }>();
</script>

<div class="note-card p-4 rounded-lg border-2 border-primary-200 dark:border-primary-700 shadow-sm bg-gray-50 dark:bg-gray-800 overflow-hidden relative">
  <div class="flex items-start space-x-2 mb-2">
    <InlineProfile pubkey={note.pubkey} disableFallback={disableFallback} relayUrl={relayUrl} />
    <span class="text-sm text-gray-500 ml-auto">{formatDate(note.created_at)}</span>
  </div>
  <div class="flex justify-end space-x-3 mb-2">
    <!-- View Event Details icon -->
    <button 
      class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
      onclick={() => onViewDetails(note)}
      title="View Event Details"
      aria-label="View Event Details"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    </button>
  </div>
  
  <!-- Display title, image, and description/summary tags (only for non-30000 range events) -->
  {#if note.tags && !(note.kind !== undefined && note.kind >= 30000 && note.kind < 40000)}
    {@const titleTag = note.tags.find((tag: string[]) => tag[0] === 'title')}
    {@const imageTag = note.tags.find((tag: string[]) => tag[0] === 'image')}
    {@const descriptionTag = note.tags.find((tag: string[]) => tag[0] === 'description')}
    {@const summaryTag = note.tags.find((tag: string[]) => tag[0] === 'summary')}
    
    {#if titleTag || imageTag || descriptionTag || summaryTag}
      <div class="note-header mb-4">
        {#if titleTag}
          <h3 class="text-xl font-bold mb-2">{titleTag[1]}</h3>
        {/if}
        
        {#if descriptionTag || summaryTag}
          <p class="text-gray-600 dark:text-gray-300 mb-2">
            {descriptionTag ? descriptionTag[1] : summaryTag ? summaryTag[1] : ''}
          </p>
        {/if}
        
        {#if imageTag}
          <div class="mb-3">
            <img src={imageTag[1]} alt="Note" class="rounded-lg max-h-64 object-cover" />
          </div>
        {/if}
        
        <hr class="border-gray-200 dark:border-gray-700 my-3" />
      </div>
    {/if}
  {/if}
  
  {#if isBoost(note)}
    {#if extractRepostedContent(note)}
      <div class="reposted-content mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div class="flex items-start justify-between mb-2">
          <div>
            <InlineProfile pubkey={extractRepostedContent(note)?.pubkey || ''} disableFallback={disableFallback} relayUrl={relayUrl} />
          </div>
          
          <!-- View Event Details button for reposted content -->
          {#if extractRepostedContent(note)}
            <button 
              class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
              onclick={() => {
                // Get the reposted content
                const repostedContent = extractRepostedContent(note);
                
                if (repostedContent) {
                  try {
                    // Create a new NDKEvent from the reposted content
                    const newEvent = new NDKEvent($ndkInstance);
                    
                    // Copy properties from reposted content
                    if ((repostedContent as any).id) newEvent.id = (repostedContent as any).id;
                    if (repostedContent.pubkey) newEvent.pubkey = repostedContent.pubkey;
                    if ((repostedContent as any).created_at) newEvent.created_at = (repostedContent as any).created_at;
                    if ((repostedContent as any).kind) newEvent.kind = (repostedContent as any).kind;
                    else newEvent.kind = 1; // Default to kind 1 if not present
                    if ((repostedContent as any).tags) newEvent.tags = (repostedContent as any).tags;
                    else newEvent.tags = [];
                    if (repostedContent.content) newEvent.content = repostedContent.content;
                    if ((repostedContent as any).sig) newEvent.sig = (repostedContent as any).sig;
                    
                    // Call the onViewDetails function with the new event
                    onViewDetails(newEvent);
                  } catch (error) {
                    console.error('Error creating event from reposted content:', error);
                    
                    // Fallback to showing the parent note
                    onViewDetails(note);
                  }
                }
              }}
              title="View Event Details"
              aria-label="View Event Details"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
          {/if}
        </div>
        {#if extractRepostedContent(note)}
          <ContentExpander 
            content={extractRepostedContent(note)?.content || ''} 
            noteId={note.id}
            isExpanded={isExpanded}
            onToggle={onToggleExpand}
          >
            <!-- Use NestedContent component for reposted content with nesting level 2 -->
            <NestedContent 
              content={extractRepostedContent(note)?.content || ''} 
              nestingLevel={2} 
              eventCache={eventCache} 
              profileCache={profileCache}
              ndkInstance={$ndkInstance}
              disableFallback={disableFallback}
              relayUrl={relayUrl}
            />
          </ContentExpander>
        {/if}
      </div>
    {/if}
  {:else if note.kind !== undefined && note.kind >= 30000 && note.kind < 40000}
    <!-- Special handling for naddr (30000 range) events - show only metadata -->
    <div class="naddr-content p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {#if note.tags}
        <!-- Extract metadata from tags -->
        {@const titleTag = note.tags.find((tag: string[]) => tag[0] === 'title')}
        {@const summaryTag = note.tags.find((tag: string[]) => tag[0] === 'summary')}
        {@const descriptionTag = note.tags.find((tag: string[]) => tag[0] === 'description')}
        {@const imageTag = note.tags.find((tag: string[]) => tag[0] === 'image')}
        {@const publishedTag = note.tags.find((tag: string[]) => tag[0] === 'published_at')}
        {@const tTags = note.tags.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]) || []}
      
        <!-- Display title if available -->
        {#if titleTag && titleTag[1]}
          <h3 class="text-xl font-bold mb-2">{titleTag[1]}</h3>
        {/if}
        
        <!-- Display published date if available -->
        {#if publishedTag && publishedTag[1]}
          <div class="text-sm text-gray-500 mb-2">
            Published: {formatDate(parseInt(publishedTag[1]) * 1000)}
          </div>
        {/if}
        
        <!-- Display summary or description if available -->
        {#if summaryTag || descriptionTag}
          <p class="text-gray-600 dark:text-gray-300 mb-3">
            {summaryTag ? summaryTag[1] : descriptionTag ? descriptionTag[1] : ''}
          </p>
        {/if}
        
        <!-- Display image if available -->
        {#if imageTag && imageTag[1]}
          <div class="mb-3">
            <img src={imageTag[1]} alt="Article" class="rounded-lg max-h-64 object-cover" />
          </div>
        {/if}
        
        <!-- Display hashtags -->
        {#if tTags && tTags.length > 0}
          <div class="flex flex-wrap gap-1 mt-2">
            {#each tTags as hashtag}
              <span class="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full text-sm">
                #{hashtag}
              </span>
            {/each}
          </div>
        {/if}
      {/if}
      
      <!-- View event details button -->
      <div class="mt-3 flex justify-end">
        <button 
          class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 text-sm font-medium"
          onclick={() => onViewDetails(note)}
        >
          View event details
        </button>
      </div>
    </div>
  {:else}
    {#if note.content}
      <ContentExpander 
        content={note.content} 
        noteId={note.id}
        isExpanded={isExpanded}
        onToggle={onToggleExpand}
      >
        <!-- Use NestedContent component for note content with nesting level 1 -->
        <NestedContent 
          content={note.content} 
          nestingLevel={1} 
          eventCache={eventCache} 
          profileCache={profileCache}
          ndkInstance={$ndkInstance}
          disableFallback={disableFallback}
          relayUrl={relayUrl}
        />
      </ContentExpander>
    {/if}
  {/if}
</div>
