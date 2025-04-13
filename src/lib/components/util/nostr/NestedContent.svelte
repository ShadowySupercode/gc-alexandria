<script lang='ts'>
  import { P, Img } from 'flowbite-svelte';
  import InlineProfile from '../InlineProfile.svelte';
  import { parseContent, processContentSegments, extractPubkeyFromNpub } from './utils';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import type { ProfileData } from './types';
  import NestedContent from './NestedContent.svelte';

  let { content, nestingLevel = 1, eventCache, profileCache, ndkInstance } = $props<{
    content: string;
    nestingLevel?: number;
    eventCache: Map<string, NDKEvent>;
    profileCache: Map<string, ProfileData>;
    ndkInstance: any;
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
  
  
  // Parse the content
  const parsedContent = parseContent(content);
  
  // Add debug logging to see what URLs are being extracted
  console.log('Content:', content);
  console.log('Parsed URLs:', parsedContent.urls);
  
  // Ensure video URLs in the content are detected and added to parsedContent.urls
  const videoUrlRegex = /https?:\/\/\S+\.(mp4|webm|ogg|mov)(?:\?\S*)?/gi;
  let match;
  const contentToSearch = content || '';
  while ((match = videoUrlRegex.exec(contentToSearch)) !== null) {
    const videoUrl = match[0].replace(/[.:;,!?]+$/, ''); // Clean the URL
    console.log('Found video URL:', videoUrl);
    
    // Check if this URL or a similar one is already in parsedContent.urls
    const normalizedVideoUrl = normalizeUrl(videoUrl);
    const exists = parsedContent.urls.some(url => normalizeUrl(url) === normalizedVideoUrl);
    
    if (!exists) {
      console.log('Adding video URL to parsed URLs:', videoUrl);
      parsedContent.urls.push(videoUrl);
    }
  }
  
  // After adding any missing video URLs, log the final list
  console.log('Final parsed URLs:', parsedContent.urls);
  
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
      console.log('OpenGraph cache updated, version:', ogCacheVersion);
      
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
  
  // Debug: Log the segments to see what's being created
  $effect(() => {
    console.log('Processed segments:', segments);
  });
  
  // Debug: Check if any video URLs are in the segments
  $effect(() => {
    const videoSegments = segments.filter(segment => 
      segment.type === 'url' && segment.url && isVideoUrl(segment.url)
    );
    console.log('Video segments:', videoSegments);
  });

  // Fetch OpenGraph data for URLs
  onMount(async () => {
    // Only fetch OpenGraph data for URLs that aren't already in the cache
    const urlsToFetch = parsedContent.urls.filter(url => !openGraphCache.has(url));
    
    if (urlsToFetch.length > 0) {
      console.log(`Fetching OpenGraph data for ${urlsToFetch.length} URLs:`, urlsToFetch);
      let cacheUpdated = false;
      
      // Fetch OpenGraph data for each URL
      for (const url of urlsToFetch) {
        try {
          console.log(`Fetching OpenGraph data for URL: ${url}`);
          const ogData = await fetchOpenGraphData(url);
          console.log(`Received OpenGraph data for ${url}:`, ogData);
          
          if (ogData) {
            openGraphCache.set(url, ogData);
            cacheUpdated = true;
            console.log(`Added OpenGraph data to cache for ${url}`);
          }
        } catch (error) {
          console.error(`Error fetching OpenGraph data for ${url}:`, error);
        }
      }
      
      // Increment cache version to trigger the effect
      if (cacheUpdated) {
        console.log('Cache updated, incrementing version');
        ogCacheVersion++;
        
        // Force update segments with the latest OpenGraph data
        segments = processContentSegments(
          parsedContent.text, 
          parsedContent.npubs, 
          parsedContent.nprofiles,
          parsedContent.nevents,
          parsedContent.naddrs,
          parsedContent.notes,
          parsedContent.urls
        );
        console.log('Segments updated with OpenGraph data:', segments);
      }
    }
  });
</script>

<div class="whitespace-pre-wrap break-words overflow-hidden">
  <P>
    {#each segments as segment}
      {#if segment.type === 'text'}
        {segment.content}
      {:else if segment.type === 'npub'}
        <!-- For npubs, always display with InlineProfile if possible -->
        <a href="https://njump.me/{segment.npub}" target="_blank" class="npub-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View profile on Nostr">
          {#if extractPubkeyFromNpub(segment.npub)}
            <InlineProfile pubkey={extractPubkeyFromNpub(segment.npub)} />
          {:else}
            @{segment.npub.substring(0, 16)}...
          {/if}
        </a>
      {:else if segment.type === 'nprofile' && segment.pubkey}
        <!-- For nprofiles, always display with InlineProfile -->
        <a href="https://njump.me/{segment.nprofile}" target="_blank" class="nprofile-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View profile on Nostr">
          <InlineProfile pubkey={segment.pubkey} />
        </a>
      {:else if segment.type === 'nevent'}
        <!-- For nevents, display differently based on nesting level -->
        <div class="nevent-reference border border-gray-200 dark:border-gray-700 rounded-lg p-3 my-2 bg-gray-50 dark:bg-gray-800">
          {#if nestingLevel >= 6}
            <div class="text-center py-2">
              <a href="https://njump.me/{segment.nevent}" target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                View on Nostr
              </a>
            </div>
          {:else if eventCache.has(segment.nevent)}
            {@const event = eventCache.get(segment.nevent)}
            {#if event && event.pubkey}
              <div class="event-author font-semibold mb-1">
                <InlineProfile pubkey={event.pubkey} />
              </div>
            {/if}
            <div class="event-content whitespace-pre-wrap break-words overflow-hidden max-h-[500px] overflow-y-auto mb-2">
              {#if event?.content}
                <NestedContent 
                  content={event.content} 
                  nestingLevel={nestingLevel} 
                  eventCache={eventCache} 
                  profileCache={profileCache}
                  ndkInstance={ndkInstance}
                />
              {/if}
            </div>
          {:else}
            <div class="text-center py-2">
              <a href="https://njump.me/{segment.nevent}" target="_blank" class="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                View on Nostr
              </a>
            </div>
          {/if}
        </div>
      {:else if segment.type === 'naddr'}
        <!-- For naddrs, display a link to the address -->
        <a href="https://njump.me/{segment.naddr}" target="_blank" class="naddr-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View address on Nostr">
          Address: {segment.naddr.substring(0, 16)}...
        </a>
      {:else if segment.type === 'note'}
        <!-- For notes, display a link to the note -->
        <a href="https://njump.me/{segment.note}" target="_blank" class="note-reference underline hover:text-primary-400 dark:hover:text-primary-500" title="View note on Nostr">
          Note: {segment.note.substring(0, 16)}...
        </a>
      {:else if segment.type === 'url' && isVideoUrl(segment.url)}
        <!-- For video URLs, display as embedded video -->
        <div class="video-container my-2 rounded-lg overflow-hidden">
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
        <div class="audio-container my-2 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700">
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
        <div class="youtube-container my-2 rounded-lg overflow-hidden">
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
        {console.log('Rendering URL with OpenGraph data:', segment.url, segment.ogData)}
        <div class="url-card border border-gray-200 dark:border-gray-700 rounded-lg p-3 my-2 bg-gray-50 dark:bg-gray-800 flex flex-col">
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
      {:else if segment.type === 'url' && !renderedUrls.has(normalizeUrl(segment.url))}
        <!-- Fallback for URLs without OpenGraph data - styled nicely -->
        <a href={cleanUrl(segment.url)} target="_blank" class="url-reference inline-flex items-center px-3 py-1 my-1 rounded-md bg-gray-100 dark:bg-gray-800 text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-700">
          <span class="truncate">{segment.url}</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        {void renderedUrls.add(normalizeUrl(segment.url))}
      {/if}
    {/each}
  </P>
  
  {#if parsedContent.images.length > 0}
    <div class="mt-3 flex flex-wrap gap-2">
      {#each parsedContent.images as imageUrl}
        {#if !renderedUrls.has(normalizeUrl(imageUrl))}
          <div class="max-w-full overflow-hidden">
            <Img src={imageUrl} alt="Embedded image" class="rounded-lg max-h-64 object-cover" />
            {void renderedUrls.add(normalizeUrl(imageUrl))}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
