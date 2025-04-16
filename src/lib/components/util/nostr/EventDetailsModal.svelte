<script lang='ts'>
  import { NDKEvent } from '@nostr-dev-kit/ndk';
  import { Modal, Button } from 'flowbite-svelte';
  import { nip19 } from 'nostr-tools';
  import { formatDate } from './utils';
  import { standardRelays } from '$lib/consts';
  import { parseMarkdown } from '../markdown';
  import NestedContent from './NestedContent.svelte';
  import { ndkInstance } from '$lib/ndk';
  
  export let open = false;
  export let currentNote: NDKEvent | null = null;
  export let currentNoteJson = '';
  export let relayUrl = '';
  export const disableFallback = false;
  export let currentUserPubkey = '';
  export let broadcastStatus = '';
  export let profileCache: Map<string, any> = new Map();
  
  // Function to delete an event (create a kind 5 deletion event)
  export let deleteEvent: (event: NDKEvent) => Promise<void>;
  
  // Function to broadcast an event to multiple relays
  export let broadcastEvent: (event: NDKEvent) => Promise<void>;
  
  // Check if the current user is the author of the event
  function isCurrentUserAuthor(event: NDKEvent): boolean {
    return Boolean(currentUserPubkey) && event.pubkey === currentUserPubkey;
  }
</script>

<!-- JSON Details Modal -->
<Modal bind:open={open} size="lg" autoclose>
  <div class="p-4">
    <h3 class="mb-4 text-xl font-medium text-gray-900 dark:text-white">Event Details</h3>
    
    {#if currentNote}
      <!-- Njump link -->
      {@const isReplaceable = currentNote.kind !== undefined && currentNote.kind >= 30000 && currentNote.kind < 40000}
      {@const bech32Address = isReplaceable 
        ? nip19.naddrEncode({
            kind: currentNote.kind || 0, // Provide a default value
            pubkey: currentNote.pubkey,
            identifier: currentNote.tags?.find(t => t[0] === 'd')?.[1] || '',
            relays: [relayUrl]
          })
        : nip19.neventEncode({
            id: currentNote.id,
            author: currentNote.pubkey,
            kind: currentNote.kind || 0, // Provide a default value
            relays: [relayUrl]
          })
      }
      <div class="mb-4">
        <span>View event on Njump: </span>
        <a 
          href={`https://njump.me/${bech32Address}`} 
          target="_blank" 
          class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 underline break-all"
        >
          {bech32Address}
        </a>
      </div>
      
      <!-- Human-readable event details -->
      <div class="mb-4 bg-white dark:bg-gray-700 p-4 rounded-lg">
        <div class="mb-2">
          <strong>Author:</strong> 
          {#if currentNote.pubkey && profileCache.has(currentNote.pubkey)}
            {@const profile = profileCache.get(currentNote.pubkey)}
            <span>{profile?.displayName || profile?.name || currentNote.pubkey.substring(0, 8) + '...'}</span>
          {:else}
            <span>{currentNote.pubkey ? currentNote.pubkey.substring(0, 8) + '...' : 'Unknown'}</span>
          {/if}
          <a 
            href={`https://njump.me/npub${nip19.npubEncode(currentNote.pubkey).substring(4)}`} 
            target="_blank" 
            class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 ml-2 text-sm"
          >
            ({currentNote.pubkey.substring(0, 8)}...)
          </a>
        </div>
        
        <div class="mb-2">
          <strong>Created:</strong> {formatDate(currentNote.created_at)}
        </div>
        
        <!-- Published at date if available -->
        {#if currentNote.tags}
          {@const publishedTag = currentNote.tags.find(tag => tag[0] === 'published_at')}
          {#if publishedTag && publishedTag[1]}
            <div class="mb-2">
              <strong>Published:</strong> {formatDate(parseInt(publishedTag[1]) * 1000)}
            </div>
          {/if}
        {/if}
        
        <div class="mb-2">
          <strong>Kind:</strong> {currentNote.kind ?? 'Unknown'}
          {#if currentNote.kind !== undefined}
            {#if currentNote.kind === 1}
              <span class="text-gray-500 ml-1">(Text Note)</span>
            {:else if currentNote.kind === 6}
              <span class="text-gray-500 ml-1">(Repost)</span>
            {:else if currentNote.kind >= 30000 && currentNote.kind < 40000}
              <span class="text-gray-500 ml-1">(Replaceable Event)</span>
            {/if}
          {/if}
        </div>
        
        <!-- Title if available -->
        {#if currentNote.tags}
          {@const titleTag = currentNote.tags.find(tag => tag[0] === 'title')}
          {#if titleTag && titleTag[1]}
            <div class="mb-2">
              <strong>Title:</strong> <span class="font-medium">{titleTag[1]}</span>
            </div>
          {/if}
        {/if}
        
        <!-- Alt text if available -->
        {#if currentNote.tags}
          {@const altTag = currentNote.tags.find(tag => tag[0] === 'alt')}
          {#if altTag && altTag[1]}
            <div class="mb-2">
              <strong>Alt:</strong> <span>{altTag[1]}</span>
            </div>
          {/if}
        {/if}
        
        <!-- Hashtags section -->
        {#if currentNote.content || currentNote.tags}
          {@const contentHashtags = currentNote.content ? [...currentNote.content.matchAll(/#([a-zA-Z0-9_]+)/g)].map(match => match[1]) : []}
          {@const summaryTag = currentNote.tags?.find(tag => tag[0] === 'summary')}
          {@const summaryHashtags = summaryTag ? [...summaryTag[1].matchAll(/#([a-zA-Z0-9_]+)/g)].map(match => match[1]) : []}
          {@const descriptionTag = currentNote.tags?.find(tag => tag[0] === 'description')}
          {@const descriptionHashtags = descriptionTag ? [...descriptionTag[1].matchAll(/#([a-zA-Z0-9_]+)/g)].map(match => match[1]) : []}
          {@const tTags = currentNote.tags?.filter(tag => tag[0] === 't').map(tag => tag[1]) || []}
          {@const allHashtags = [...new Set([...contentHashtags, ...summaryHashtags, ...descriptionHashtags, ...tTags])]}
          
          {#if allHashtags.length > 0}
            <div class="mb-2">
              <strong>Hashtags:</strong>
              <div class="flex flex-wrap gap-1 mt-1">
                {#each allHashtags as hashtag}
                  <span class="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full text-sm">
                    #{hashtag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
        
        <!-- M tags (metadata) -->
        {#if currentNote.tags}
          {@const mTags = currentNote.tags.filter(tag => tag[0] === 'm' || tag[0] === 'M')}
          {#if mTags.length > 0}
            <div class="mb-2">
              <strong>Metadata:</strong>
              <div class="pl-4 mt-1">
                {#each mTags as tag}
                  <div class="mb-1">
                    <code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
                      {tag[0] === 'm' ? 'Metadata' : 'Metadata (M)'}: {tag.slice(1).join(', ')}
                    </code>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
        {#if currentNote.content}
          <div class="mb-2">
            <strong>Content:</strong>
            <div class="pl-4 mt-1">
              <!-- Use NestedContent component for better rendering of profiles and lists -->
              <NestedContent 
                content={currentNote.content} 
                nestingLevel={1} 
                eventCache={new Map()} 
                profileCache={profileCache}
                ndkInstance={$ndkInstance}
                disableFallback={disableFallback}
                relayUrl={relayUrl}
              />
            </div>
          </div>
        {/if}
      </div>
      
      <!-- Collapsible JSON -->
      <details class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
        <summary class="cursor-pointer font-medium mb-2">View Raw JSON</summary>
        <pre class="whitespace-pre-wrap break-words text-sm">{currentNoteJson}</pre>
      </details>
    {/if}
  </div>
  <svelte:fragment slot="footer">
    <div class="w-full flex flex-col gap-2">
      <!-- Relay information -->
      <div class="flex items-center mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <span class="text-sm">Found on relay: <span class="font-semibold">{relayUrl}</span></span>
      </div>
      
      <!-- Broadcast status message -->
      {#if broadcastStatus}
        <div class="text-sm text-primary-600 dark:text-primary-400 mb-2">{broadcastStatus}</div>
      {/if}
      
      <!-- Action buttons -->
      <div class="flex justify-between">
        <div class="flex gap-2">
          <!-- Delete button - only active for the author -->
          <Button 
            color="red" 
            disabled={!currentNote || !isCurrentUserAuthor(currentNote)}
            onclick={() => currentNote && deleteEvent(currentNote)}
            title={currentNote && isCurrentUserAuthor(currentNote) ? "Delete this event" : "Only the author can delete events"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </Button>
          
          <!-- Broadcast button -->
          <Button 
            color="blue" 
            disabled={!currentNote}
            onclick={() => currentNote && broadcastEvent(currentNote)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Broadcast
          </Button>
        </div>
        
        <!-- Close button -->
        <Button color="alternative" onclick={() => open = false}>Close</Button>
      </div>
    </div>
  </svelte:fragment>
</Modal>
