<script lang='ts'>
  import { ndkInstance as globalNdkInstance } from '$lib/ndk';
  import { P, Img } from 'flowbite-svelte';
  import InlineProfile from '../InlineProfile.svelte';
  import { parseContent, processContentSegments, extractPubkeyFromNpub, decodeNevent } from './utils';
  import { parseMarkdown } from '../markdown';
  import { NDKEvent } from '@nostr-dev-kit/ndk';
  import type { ProfileData } from './types';
  import NestedContent from './NestedContent.svelte';

  let { content, nestingLevel = 1, eventCache, profileCache, ndkInstance = globalNdkInstance, disableFallback = false, relayUrl = null } = $props<{
    content: string;
    nestingLevel?: number;
    eventCache: Map<string, NDKEvent>;
    profileCache: Map<string, ProfileData>;
    ndkInstance: any;
    disableFallback?: boolean;
    relayUrl?: string | null;
  }>();

  import { onMount } from 'svelte';
  import { fetchOpenGraphData, openGraphCache } from './utils';
  
  // Set to track rendered URLs to prevent duplicates
  const renderedUrls = new Set<string>();
  
  // Helper function to normalize URLs for comparison (used for tracking rendered URLs)
  function normalizeUrl(url: string): string {
    if (!url) return '';
    
    // Convert to lowercase for case-insensitive comparison
    url = url.toLowerCase();
    
    // Remove trailing punctuation
    url = url.replace(/[.:;,!?]+$/, '');
    
    return url;
  }
  
  // Helper function to clean URLs for display and embedding
  function cleanUrl(url: string): string {
    if (!url) return '';
    
    // Remove trailing punctuation
    url = url.replace(/[.:;,!?]+$/, '');
    
    return url;
  }
  
  // Helper function to detect if a URL is a video URL
  function isVideoUrl(url: string): boolean {
    if (!url) return false;
    
    // Check for common video extensions
    return url.match(/\.(mp4|webm|ogg|mov)$/i) !== null;
  }
  
  // Helper function to detect if a URL is an audio URL
  function isAudioUrl(url: string): boolean {
    // Check for common audio extensions
    return url.match(/\.(mp3|wav|ogg|aac|flac)$/i) !== null;
  }
  
  // Helper function to detect if a URL is a YouTube URL
  function isYouTubeUrl(url: string): boolean {
    return url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)/i) !== null;
  }
  
  // Log the content for debugging
  console.log("NestedContent received content:", content);
  
  // Parse the content
  const parsedContent = parseContent(content);
  
  // Log the parsed content
  console.log("Parsed content:", parsedContent);
  
  // Ensure video URLs in the content are detected and added to parsedContent.urls
  const videoUrlRegex = /https?:\/\/\S+\.(mp4|webm|ogg|mov)(?:\?\S*)?/gi;
  let match;
  const contentToSearch = content || '';
  while ((match = videoUrlRegex.exec(contentToSearch)) !== null) {
    const videoUrl = match[0].replace(/[.:;,!?]+$/, ''); // Clean the URL
    
    // Check if this URL or a similar one is already in parsedContent.urls
    const normalizedVideoUrl = normalizeUrl(videoUrl);
    const exists = parsedContent.urls.some(url => normalizeUrl(url) === normalizedVideoUrl);
    
    if (!exists) {
      parsedContent.urls.push(videoUrl);
    }
  }
  
  // Manually check for specific URLs that might be missed
  const specificUrlCheck = /https?:\/\/[^\s<>'"]+/gi;
  let specificMatch;
  while ((specificMatch = specificUrlCheck.exec(contentToSearch)) !== null) {
    const url = specificMatch[0].replace(/[.:;,!?]+$/, ''); // Clean the URL
    
    // Check if this URL is already in the urls array
    if (!parsedContent.urls.includes(url)) {
      console.log("Adding manually detected URL:", url);
      parsedContent.urls.push(url);
    }
  }
  
  // Store for segments and OpenGraph cache updates
  let segments = $state(processContentSegments(
    parsedContent.text, 
    parsedContent.npubs, 
    parsedContent.nprofiles,
    parsedContent.nevents,
    parsedContent.naddrs,
    parsedContent.notes,
    parsedContent.urls
  ));
  
  // Track OpenGraph cache updates
  let ogCacheVersion = $state(0);
  
  // Update segments when OpenGraph cache changes
  $effect(() => {
    if (ogCacheVersion > 0) {
      // Create a new array to trigger reactivity
      const updatedSegments = processContentSegments(
        parsedContent.text, 
        parsedContent.npubs, 
        parsedContent.nprofiles,
        parsedContent.nevents,
        parsedContent.naddrs,
        parsedContent.notes,
        parsedContent.urls
      );
      
      // Replace the entire array to ensure reactivity
      segments = updatedSegments;
    }
  });

  // Pre-populate OpenGraph data for URLs
  onMount(() => {
    // Process all URLs in the content
    for (const url of parsedContent.urls) {
      if (!openGraphCache.has(url)) {
        // Create basic data for the URL without fetching
        fetchOpenGraphData(url).then(ogData => {
          if (ogData) {
            openGraphCache.set(url, ogData);
            // Increment cache version to trigger the effect
            ogCacheVersion++;
          }
        });
      }
    }
  });

  // Track loading state for each nevent
  const loadingState = $state(new Map<string, 'loading' | 'error' | 'success'>());
  
  // Function to fetch an event with timeout
  async function fetchNestedEvent(nevent: string, authorPubkey?: string) {
    // Set loading state
    loadingState.set(nevent, 'loading');
    
    try {
      const { eventId } = decodeNevent(nevent);
      if (!eventId) {
        loadingState.set(nevent, 'error');
        return;
      }

      let event;
      
      // Create a promise that will resolve with the event or reject after timeout
      const fetchWithTimeout = async () => {
        return new Promise(async (resolve, reject) => {
          // Set a timeout of 10 seconds
          const timeoutId = setTimeout(() => {
            reject(new Error('Fetch event timeout'));
          }, 10000);
          
          try {
            let result;
            if (disableFallback && relayUrl) {
              // If we're using a single relay only, create a relay set with just that relay
              const { NDKRelaySet } = await import('@nostr-dev-kit/ndk');
              const relaySet = NDKRelaySet.fromRelayUrls([relayUrl], ndkInstance);
              result = await ndkInstance.fetchEvent(
                eventId,
                {
                  skipVerification: false,
                  skipValidation: false
                },
                relaySet
              );
            } else {
              // Otherwise use the default behavior
              result = await ndkInstance.fetchEvent(eventId);
            }
            
            clearTimeout(timeoutId);
            resolve(result);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });
      };
      
      // Try to fetch the event with timeout
      event = await fetchWithTimeout();
      
      if (event) {
        eventCache.set(nevent, event);
        loadingState.set(nevent, 'success');
        // Force a re-render
        segments = [...segments];
      } else {
        loadingState.set(nevent, 'error');
      }
    } catch (e) {
      console.error('Error fetching event:', e);
      loadingState.set(nevent, 'error');
    }
  }
</script>

<style>
  /* Add proper styling for lists */
  :global(ul) {
    list-style-type: disc;
    padding-left: 1.5rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  :global(ol) {
    list-style-type: decimal;
    padding-left: 1.5rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  :global(li) {
    margin-bottom: 0.25rem;
  }
  
  :global(ul ul), :global(ol ol), :global(ul ol), :global(ol ul) {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }
</style>

<div class="break-words overflow-hidden">
  <!-- We'll render all content inline in the segments below, so we don't need this section anymore -->
  
  <P class="whitespace-pre-wrap">
    {#each segments as segment}
      {#if segment.type === 'text'}
        {@html parseMarkdown(segment.content)}
      {:else if segment.type === 'npub'}
        <!-- For npubs, always display with InlineProfile if possible -->
        <a href="https://njump.me/{segment.npub}" target="_blank" class="npub-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View profile on Nostr">
          {#if extractPubkeyFromNpub(segment.npub)}
            <InlineProfile pubkey={extractPubkeyFromNpub(segment.npub)} disableFallback={disableFallback} relayUrl={relayUrl} />
          {:else}
            @{segment.npub.substring(0, 16)}...
          {/if}
        </a>
      {:else if segment.type === 'nprofile' && segment.pubkey}
        <!-- For nprofiles, always display with InlineProfile (inline) -->
        <a href="https://njump.me/{segment.nprofile}" target="_blank" class="nprofile-reference underline hover:text-primary-400 dark:hover:text-primary-500 inline-flex items-center" title="View profile on Nostr">
          <InlineProfile pubkey={segment.pubkey} disableFallback={disableFallback} relayUrl={relayUrl} />
        </a>
      {:else if segment.type === 'nevent'}
        <!-- For nevents, display differently based on nesting level -->
        <div class="nevent-reference border-2 border-primary-200 dark:border-primary-700 rounded-lg p-3 my-4 bg-gray-50 dark:bg-gray-800 shadow-sm">
          {#if nestingLevel >= 6}
            <div class="text-center py-2">
              <a href="https://njump.me/{segment.nevent}" target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                View on Nostr
              </a>
            </div>
          {:else if eventCache.has(segment.nevent)}
            {@const event = eventCache.get(segment.nevent)}
            {#if event && event.pubkey}
              <div class="flex items-start justify-between mb-2">
                <div class="event-author font-semibold">
                  <InlineProfile pubkey={event.pubkey} disableFallback={disableFallback} relayUrl={relayUrl} />
                </div>
                
                <!-- View Event Details button for embedded events -->
                <button 
                  class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                  onclick={() => {
                    // Dispatch event to parent component
                    const customEvent = new CustomEvent('viewEventDetails', {
                      detail: {
                        event: event
                      },
                      bubbles: true
                    });
                    document.dispatchEvent(customEvent);
                  }}
                  title="View Event Details"
                  aria-label="View Event Details"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
              </div>
            {/if}
            <div class="event-content whitespace-pre-wrap break-words overflow-hidden max-h-[500px] overflow-y-auto mb-2">
              {#if event?.content}
                <NestedContent 
                  content={event.content} 
                  nestingLevel={nestingLevel + 1} 
                  eventCache={eventCache} 
                  profileCache={profileCache}
                  ndkInstance={ndkInstance}
                  disableFallback={disableFallback}
                  relayUrl={relayUrl}
                />
              {/if}
            </div>
          {:else}
            <!-- Try to fetch the event if it's not in the cache -->
            <div class="event-content whitespace-pre-wrap break-words overflow-hidden">
              {#if loadingState.get(segment.nevent) === 'error'}
                <!-- Show error message -->
                <div class="flex items-center justify-center py-3">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p class="text-center text-sm text-red-500">
                  Failed to load event. <a href="https://njump.me/{segment.nevent}" target="_blank" class="underline">View on Nostr</a>
                </p>
              {:else}
                <!-- Show loading animation -->
                <div class="flex items-center justify-center py-3">
                  <div class="animate-pulse flex space-x-2">
                    <div class="h-2 w-2 bg-primary-400 rounded-full"></div>
                    <div class="h-2 w-2 bg-primary-400 rounded-full"></div>
                    <div class="h-2 w-2 bg-primary-400 rounded-full"></div>
                  </div>
                </div>
                <p class="text-center text-sm text-gray-500">
                  Loading event content...
                </p>
              {/if}
            </div>
            {#if ndkInstance && loadingState.get(segment.nevent) !== 'error'}
              {void fetchNestedEvent(segment.nevent)}
            {/if}
          {/if}
        </div>
      {:else if segment.type === 'naddr'}
        <!-- For naddrs, display a link to the address on a new line -->
        <div class="block my-2">
          <a href="https://njump.me/{segment.naddr}" target="_blank" class="naddr-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View address on Nostr">
            Address: {segment.naddr.substring(0, 16)}...
          </a>
        </div>
      {:else if segment.type === 'note'}
        <!-- For notes, display a link to the note -->
        <a href="https://njump.me/{segment.note}" target="_blank" class="note-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View note on Nostr">
          Note: {segment.note.substring(0, 16)}...
        </a>
      {:else if segment.type === 'url' && segment.isImage}
        <!-- For image URLs, display as embedded image on a new line -->
        <div class="my-2 block">
          <a href={cleanUrl(segment.url)} target="_blank" class="max-w-full overflow-hidden block">
            <Img src={cleanUrl(segment.url)} alt="Embedded image" class="rounded-lg max-h-64 object-cover" />
          </a>
        </div>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {:else if segment.type === 'url' && isVideoUrl(segment.url)}
        <!-- For video URLs, display as embedded video -->
        <div class="video-container my-2 overflow-hidden">
          <video controls class="w-full max-h-96 rounded-lg">
            <source src={cleanUrl(segment.url)} type="video/mp4">
            <track kind="captions" src="" label="Captions" default={false}>
            Your browser does not support the video tag.
          </video>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            <a href={cleanUrl(segment.url)} target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
              {new URL(segment.url).hostname}
            </a>
          </div>
        </div>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {:else if segment.type === 'url' && isAudioUrl(segment.url) && !renderedUrls.has(normalizeUrl(segment.url))}
        <!-- For audio URLs, display as embedded audio player -->
        <div class="audio-container my-2 rounded-lg p-2 bg-gray-50 dark:bg-gray-800 overflow-hidden">
          <div class="font-medium mb-2">
            {segment.ogData?.title || segment.url.split('/').pop() || 'Audio'}
          </div>
          <audio controls class="w-full">
            <source src={cleanUrl(segment.url)} type={`audio/${cleanUrl(segment.url).split('.').pop()}`}>
            <track kind="captions" src="" label="Captions" default={false}>
            Your browser does not support the audio tag.
          </audio>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            <a href={cleanUrl(segment.url)} target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
              {new URL(segment.url).hostname}
            </a>
          </div>
        </div>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {:else if segment.type === 'url' && isYouTubeUrl(segment.url) && !renderedUrls.has(normalizeUrl(segment.url))}
        <!-- For YouTube URLs, display as embedded iframe -->
        <div class="youtube-container my-2 overflow-hidden">
          {#if segment.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i)}
            {@const match = segment.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i)}
            {@const videoId = match ? match[1] : ''}
            <div class="relative pb-[56.25%] h-0 overflow-hidden rounded-lg">
              <iframe 
                src="https://www.youtube.com/embed/{videoId}" 
                class="absolute top-0 left-0 w-full h-full rounded-lg"
                title="YouTube video player" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen>
              </iframe>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <a href={segment.url} target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                YouTube
              </a>
            </div>
          {:else}
            <a href={segment.url} target="_blank" class="url-reference text-primary-500 underline hover:text-primary-600 dark:hover:text-primary-400">
              {segment.url}
            </a>
          {/if}
        </div>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {:else if segment.type === 'url' && segment.ogData && !renderedUrls.has(normalizeUrl(segment.url))}
        <!-- For URLs with OpenGraph data, display as card -->
        <div class="url-card my-2 rounded-lg p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex flex-col">
          <a href={segment.url} target="_blank" class="no-underline hover:no-underline">
            <div class="flex flex-col md:flex-row gap-3">
              {#if segment.ogData.image}
                <div class="md:w-1/3 flex-shrink-0">
                  <Img src={segment.ogData.image} alt="Link preview" class="rounded-lg w-full h-auto object-cover max-h-32" />
                </div>
              {/if}
              <div class="flex-grow">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {segment.ogData.title || segment.url}
                </h3>
                {#if segment.ogData.description}
                  <p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                    {segment.ogData.description}
                  </p>
                {/if}
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                  {new URL(segment.url).hostname}
                </div>
              </div>
            </div>
          </a>
        </div>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {:else if segment.type === 'url'}
        <!-- Fallback for URLs without OpenGraph data - display as normal inline hyperlink -->
        <a href={cleanUrl(segment.url)} target="_blank" class="url-reference text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 underline">
          {segment.url}
        </a>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {/if}
    {/each}
  </P>
</div>
