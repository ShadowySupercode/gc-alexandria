import { nip19 } from 'nostr-tools';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { DecodedNevent, ParsedContent, ContentSegment, RepostedContent, OpenGraphData } from './types';

// Function to decode a nevent identifier
export function decodeNevent(nevent: string): DecodedNevent {
  let eventId: string | undefined;
  let suggestedRelays: string[] = [];
  
  // Check if it's a valid Nostr identifier before trying to decode
  if (!isValidNostrIdentifier(nevent)) {
    return { eventId, suggestedRelays };
  }
  
  try {
    const decoded = nip19.decode(nevent);
    console.log(`Decoded nevent ${nevent}:`, decoded);
    
    if (decoded.type === 'note') {
      // Simple note reference
      eventId = decoded.data as string;
    } else if (decoded.type === 'nevent') {
      // Full nevent with relays and author
      eventId = decoded.data.id as string;
      if (decoded.data.relays && Array.isArray(decoded.data.relays)) {
        suggestedRelays = decoded.data.relays;
      }
    }
  } catch (error) {
    console.error(`Failed to decode nevent ${nevent}:`, error);
  }
  
  return { eventId, suggestedRelays };
}

// Function to extract pubkey from npub
export function extractPubkeyFromNpub(npub: string): string | null {
  // Check if it's a valid Nostr identifier before trying to decode
  if (!isValidNostrIdentifier(npub)) {
    return null;
  }
  
  try {
    // Use nip19 to decode the npub identifier
    const decoded = nip19.decode(npub);
    console.log(`Decoded npub ${npub}:`, decoded);
    
    if (decoded.type === 'npub') {
      // Extract the pubkey from the decoded npub
      return decoded.data as string;
    }
  } catch (decodeError) {
    console.error(`Failed to decode npub ${npub}:`, decodeError);
  }
  
  // If we couldn't decode the npub, return null
  return null;
}

// Function to extract pubkey from nprofile
export function extractPubkeyFromNprofile(nprofile: string): string | null {
  // Check if it's a valid Nostr identifier before trying to decode
  if (!isValidNostrIdentifier(nprofile)) {
    return null;
  }
  
  try {
    // Use nip19 to decode the nprofile identifier
    const decoded = nip19.decode(nprofile);
    console.log(`Decoded nprofile ${nprofile}:`, decoded);
    
    if (decoded.type === 'nprofile') {
      // Extract the pubkey from the decoded nprofile
      return decoded.data.pubkey;
    }
  } catch (decodeError) {
    console.error(`Failed to decode nprofile ${nprofile}:`, decodeError);
  }
  
  // If we couldn't decode the nprofile, return null
  return null;
}

// Function to check if a string is a valid Nostr identifier
function isValidNostrIdentifier(str: string): boolean {
  // Check if the string is at least 60 characters long (typical for Nostr identifiers)
  // This helps filter out common words like "npubs", "notes", etc.
  return str.length >= 60;
}

// Function to parse content for references
export function parseContent(content: string): ParsedContent {
  const images: string[] = [];
  const npubs: string[] = [];
  const nprofiles: string[] = [];
  const nevents: string[] = [];
  const naddrs: string[] = [];
  const notes: string[] = [];
  const urls: string[] = [];
  
  // Extract image URLs
  const imageRegex = /(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?\S*)?)/gi;
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    images.push(match[1]);
  }
  
  // We've removed nostr.build specific handling to focus on standard image formats
  
  // Extract video URLs
  const videoRegex = /(https?:\/\/\S+\.(?:mp4|webm|ogg|mov)(?:\?\S*)?)/gi;
  let videoMatch;
  while ((videoMatch = videoRegex.exec(content)) !== null) {
    urls.push(videoMatch[1]);
  }
  
  // Removed nostr.build specific video handling
  
  // Check for YouTube URLs
  const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11}))/gi;
  let youtubeMatch;
  while ((youtubeMatch = youtubeRegex.exec(content)) !== null) {
    if (!urls.includes(youtubeMatch[1])) {
      urls.push(youtubeMatch[1]);
    }
  }
  
  // Extract all URLs, including those that might be image or video URLs
  // This comprehensive regex handles URLs within text and with query parameters
  const urlRegex = /(https?:\/\/[^\s<>'"]+(?:\?[^\s<>'"]*)?)/gi;
  let urlMatch;
  while ((urlMatch = urlRegex.exec(content)) !== null) {
    const url = urlMatch[1];
    // Clean up the URL if it has trailing punctuation
    let cleanUrl = url;
    // Remove trailing punctuation that might be part of the text but not the URL
    if (/[.,;:!?)]$/.test(cleanUrl)) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    
    // Only add if it's not already in the images or urls arrays
    if (!images.includes(cleanUrl) && !urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }
  
  // Special handling for URLs that might be part of text without proper spacing
  // This is particularly useful for URLs like https://next-alexandria.gitcitadel.eu/publication?id=the-life-of-a-gitcitadel-work-ticket-by-michael-j-v-1
  const specialUrlRegex = /https?:\/\/[^\s<>'"]+\.[a-z]{2,}(?:\/[^\s<>'"]*)?(?:\?[^\s<>'"]*)?/gi;
  let specialUrlMatch;
  while ((specialUrlMatch = specialUrlRegex.exec(content)) !== null) {
    const url = specialUrlMatch[0];
    // Only add if it's not already in the urls array
    if (!urls.includes(url) && !images.includes(url)) {
      urls.push(url);
    }
  }
  
  // Extract npub references - both nostr: protocol and direct npub mentions
  const npubRegex = /(?:nostr:)?(npub[a-z0-9]+)/gi;
  let npubMatch;
  while ((npubMatch = npubRegex.exec(content)) !== null) {
    const npub = npubMatch[1];
    // Only add if it's a valid Nostr identifier (not just the word "npub" or "npubs")
    if (isValidNostrIdentifier(npub)) {
      npubs.push(npub);
    }
  }
  
  // Extract nprofile references - both nostr: protocol and direct nprofile mentions
  const nprofileRegex = /(?:nostr:)?(nprofile[a-z0-9]+)/gi;
  let nprofileMatch;
  while ((nprofileMatch = nprofileRegex.exec(content)) !== null) {
    const nprofile = nprofileMatch[1];
    // Only add if it's a valid Nostr identifier
    if (isValidNostrIdentifier(nprofile)) {
      nprofiles.push(nprofile);
      console.log(`Detected nprofile: ${nprofile} in content`);
    }
  }
  
  // Extract nevent references - both nostr: protocol and direct nevent mentions
  const neventRegex = /(?:nostr:)?(nevent[a-z0-9]+)/gi;
  let neventMatch;
  while ((neventMatch = neventRegex.exec(content)) !== null) {
    const nevent = neventMatch[1];
    // Only add if it's a valid Nostr identifier
    if (isValidNostrIdentifier(nevent)) {
      nevents.push(nevent);
      console.log(`Detected nevent: ${nevent} in content`);
    }
  }
  
  // Extract naddr references - both nostr: protocol and direct naddr mentions
  const naddrRegex = /(?:nostr:)?(naddr[a-z0-9]+)/gi;
  let naddrMatch;
  while ((naddrMatch = naddrRegex.exec(content)) !== null) {
    const naddr = naddrMatch[1];
    // Only add if it's a valid Nostr identifier
    if (isValidNostrIdentifier(naddr)) {
      naddrs.push(naddr);
      console.log(`Detected naddr: ${naddr} in content`);
    }
  }
  
  // Extract note references - both nostr: protocol and direct note mentions
  const noteRegex = /(?:nostr:)?(note[a-z0-9]+)/gi;
  let noteMatch;
  while ((noteMatch = noteRegex.exec(content)) !== null) {
    const note = noteMatch[1];
    // Only add if it's a valid Nostr identifier
    if (isValidNostrIdentifier(note)) {
      notes.push(note);
      console.log(`Detected note: ${note} in content`);
    }
  }
  
  if (nprofiles.length > 0) {
    console.log(`Found ${nprofiles.length} nprofiles in content:`, nprofiles);
  }
  if (nevents.length > 0) {
    console.log(`Found ${nevents.length} nevents in content:`, nevents);
  }
  if (naddrs.length > 0) {
    console.log(`Found ${naddrs.length} naddrs in content:`, naddrs);
  }
  if (notes.length > 0) {
    console.log(`Found ${notes.length} notes in content:`, notes);
  }
  
  return { text: content, images, npubs, nprofiles, nevents, naddrs, notes, urls };
}

// Function to process content text and return segments for rendering
export function processContentSegments(
  text: string, 
  npubs: string[] = [], 
  nprofiles: string[] = [], 
  nevents: string[] = [], 
  naddrs: string[] = [], 
  notes: string[] = [],
  urls: string[] = []
): ContentSegment[] {
  console.log(`Processing text with ${npubs.length} npubs, ${nprofiles.length} nprofiles, ${nevents.length} nevents, ${naddrs.length} naddrs, ${notes.length} notes, and ${urls.length} urls`);
  
  // Create a map of positions to references
  type Reference = { 
    start: number, 
    end: number, 
    type: 'npub' | 'nprofile' | 'nevent' | 'naddr' | 'note' | 'url', 
    value: string, 
    pubkey?: string,
    ogData?: OpenGraphData
  };
  const references: Reference[] = [];
  
  // Find npub references
  for (const npub of npubs) {
    // Look for both formats
    const npubIndex = text.toLowerCase().indexOf(npub.toLowerCase());
    const nostrPrefixIndex = text.toLowerCase().indexOf(`nostr:${npub.toLowerCase()}`);
    
    if (nostrPrefixIndex !== -1) {
      references.push({
        start: nostrPrefixIndex,
        end: nostrPrefixIndex + `nostr:${npub}`.length,
        type: 'npub',
        value: npub
      });
    } else if (npubIndex !== -1) {
      references.push({
        start: npubIndex,
        end: npubIndex + npub.length,
        type: 'npub',
        value: npub
      });
    }
  }
  
  // Find nprofile references
  for (const nprofile of nprofiles) {
    const pubkey = extractPubkeyFromNprofile(nprofile);
    
    // Look for both formats
    const nprofileIndex = text.toLowerCase().indexOf(nprofile.toLowerCase());
    const nostrPrefixIndex = text.toLowerCase().indexOf(`nostr:${nprofile.toLowerCase()}`);
    
    if (nostrPrefixIndex !== -1) {
      references.push({
        start: nostrPrefixIndex,
        end: nostrPrefixIndex + `nostr:${nprofile}`.length,
        type: 'nprofile',
        value: nprofile,
        pubkey: pubkey || undefined
      });
    } else if (nprofileIndex !== -1) {
      references.push({
        start: nprofileIndex,
        end: nprofileIndex + nprofile.length,
        type: 'nprofile',
        value: nprofile,
        pubkey: pubkey || undefined
      });
    }
  }
  
  // Find nevent references
  for (const nevent of nevents) {
    // Look for both formats
    const neventIndex = text.toLowerCase().indexOf(nevent.toLowerCase());
    const nostrPrefixIndex = text.toLowerCase().indexOf(`nostr:${nevent.toLowerCase()}`);
    
    if (nostrPrefixIndex !== -1) {
      references.push({
        start: nostrPrefixIndex,
        end: nostrPrefixIndex + `nostr:${nevent}`.length,
        type: 'nevent',
        value: nevent
      });
    } else if (neventIndex !== -1) {
      references.push({
        start: neventIndex,
        end: neventIndex + nevent.length,
        type: 'nevent',
        value: nevent
      });
    }
  }
  
  // Find naddr references
  for (const naddr of naddrs) {
    // Look for both formats
    const naddrIndex = text.toLowerCase().indexOf(naddr.toLowerCase());
    const nostrPrefixIndex = text.toLowerCase().indexOf(`nostr:${naddr.toLowerCase()}`);
    
    if (nostrPrefixIndex !== -1) {
      references.push({
        start: nostrPrefixIndex,
        end: nostrPrefixIndex + `nostr:${naddr}`.length,
        type: 'naddr',
        value: naddr
      });
    } else if (naddrIndex !== -1) {
      references.push({
        start: naddrIndex,
        end: naddrIndex + naddr.length,
        type: 'naddr',
        value: naddr
      });
    }
  }
  
  // Find note references
  for (const note of notes) {
    // Look for both formats
    const noteIndex = text.toLowerCase().indexOf(note.toLowerCase());
    const nostrPrefixIndex = text.toLowerCase().indexOf(`nostr:${note.toLowerCase()}`);
    
    if (nostrPrefixIndex !== -1) {
      references.push({
        start: nostrPrefixIndex,
        end: nostrPrefixIndex + `nostr:${note}`.length,
        type: 'note',
        value: note
      });
    } else if (noteIndex !== -1) {
      references.push({
        start: noteIndex,
        end: noteIndex + note.length,
        type: 'note',
        value: note
      });
    }
  }
  
  // Find URL references
  for (const url of urls) {
    // Use a case-insensitive search to find all instances of the URL
    let urlIndex = text.toLowerCase().indexOf(url.toLowerCase());
    while (urlIndex !== -1) {
      // Check if we have OpenGraph data for this URL in the cache
      const ogData = openGraphCache.get(url);
      
      references.push({
        start: urlIndex,
        end: urlIndex + url.length,
        type: 'url',
        value: url,
        ogData
      });
      
      // Look for the next occurrence of this URL
      urlIndex = text.toLowerCase().indexOf(url.toLowerCase(), urlIndex + 1);
    }
  }
  
  // Sort references by position
  references.sort((a, b) => a.start - b.start);
  
  // Create segments
  const segments: ContentSegment[] = [];
  let lastEnd = 0;
  
  for (const ref of references) {
    // Add text segment before the reference
    if (ref.start > lastEnd) {
      segments.push({
        type: 'text',
        content: text.substring(lastEnd, ref.start)
      });
    }
    
    // Add the reference segment
    if (ref.type === 'npub') {
      segments.push({
        type: 'npub',
        npub: ref.value
      });
    } else if (ref.type === 'nprofile' && ref.pubkey) {
      segments.push({
        type: 'nprofile',
        nprofile: ref.value,
        pubkey: ref.pubkey
      });
    } else if (ref.type === 'nevent') {
      segments.push({
        type: 'nevent',
        nevent: ref.value
      });
    } else if (ref.type === 'naddr') {
      segments.push({
        type: 'naddr',
        naddr: ref.value
      });
    } else if (ref.type === 'note') {
      segments.push({
        type: 'note',
        note: ref.value
      });
    } else if (ref.type === 'url') {
      // Check if it's a video URL
      const isVideo = ref.value.match(/\.(mp4|webm|ogg|mov)$/i) !== null;
      
      // Check if it's a YouTube URL
      const isYouTube = ref.value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i) !== null;
      
      segments.push({
        type: 'url',
        url: ref.value,
        ogData: ref.ogData,
        isVideo,
        isYouTube
      });
    } else {
      // Fallback for references without proper handling
      segments.push({
        type: 'text',
        content: text.substring(ref.start, ref.end)
      });
    }
    
    lastEnd = ref.end;
  }
  
  // Add remaining text
  if (lastEnd < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(lastEnd)
    });
  }
  
  return segments;
}

// Function to check if a note is a boost/repost
export function isBoost(note: NDKEvent): boolean {
  return note.kind === 6;
}

// Function to extract reposted content from a kind 6 event
export function extractRepostedContent(note: NDKEvent): RepostedContent | null {
  if (note.kind !== 6) return null;
  
  try {
    // Kind 6 events store the reposted event in the content field as JSON
    const repostedEvent = JSON.parse(note.content);
    return {
      content: repostedEvent.content || '',
      pubkey: repostedEvent.pubkey || ''
    };
  } catch (e) {
    console.error('Failed to parse reposted content:', e);
    return null;
  }
}

// Function to format date
export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

// Function to fetch OpenGraph data for a URL
export async function fetchOpenGraphData(url: string): Promise<OpenGraphData | null> {
  try {
    // Try multiple proxy services in case one fails
    const proxyServices = [
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      `https://cors-anywhere.herokuapp.com/${url}`,
      `https://crossorigin.me/${url}`
    ];
    
    console.log(`Attempting to fetch OpenGraph data for: ${url}`);
    
    let response = null;
    let proxyUsed = '';
    
    // Try each proxy service until one works
    for (const proxyUrl of proxyServices) {
      try {
        console.log(`Trying proxy: ${proxyUrl}`);
        const fetchResponse = await fetch(proxyUrl, { 
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'User-Agent': 'Mozilla/5.0 (compatible; NostrClient/1.0)'
          }
        });
        
        if (fetchResponse.ok) {
          response = fetchResponse;
          proxyUsed = proxyUrl;
          console.log(`Successfully fetched with proxy: ${proxyUrl}`);
          break;
        } else {
          console.warn(`Proxy ${proxyUrl} failed with status: ${fetchResponse.status}`);
        }
      } catch (proxyError) {
        console.warn(`Error with proxy ${proxyUrl}:`, proxyError);
        // Continue to the next proxy
      }
    }
    
    if (!response) {
      console.error(`All proxies failed for ${url}`);
      
      // Create a basic OpenGraph data object with just the URL
      // This ensures we at least have something to display
      const fallbackOgData: OpenGraphData = { 
        url,
        title: new URL(url).hostname,
        description: `Visit ${url}`
      };
      
      console.log(`Created fallback OpenGraph data for ${url}:`, fallbackOgData);
      return fallbackOgData;
    }
    
    let data;
    let htmlContent;
    
    // Handle different proxy response formats
    if (proxyUsed.includes('allorigins')) {
      data = await response.json();
      htmlContent = data.contents;
    } else {
      // For other proxies that return HTML directly
      htmlContent = await response.text();
    }
    
    if (!htmlContent) {
      console.error(`No HTML content returned for ${url}`);
      return null;
    }
    
    // Parse the HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Extract OpenGraph data
    const ogData: OpenGraphData = { url };
    
    // Get title (try og:title first, then regular title)
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.getAttribute('content')) {
      ogData.title = ogTitle.getAttribute('content') || undefined;
    } else {
      const titleTag = doc.querySelector('title');
      if (titleTag && titleTag.textContent) {
        ogData.title = titleTag.textContent;
      }
    }
    
    // Get description
    const ogDescription = doc.querySelector('meta[property="og:description"]');
    if (ogDescription && ogDescription.getAttribute('content')) {
      ogData.description = ogDescription.getAttribute('content') || undefined;
    } else {
      const metaDescription = doc.querySelector('meta[name="description"]');
      if (metaDescription && metaDescription.getAttribute('content')) {
        ogData.description = metaDescription.getAttribute('content') || undefined;
      }
    }
    
    // Get image
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage && ogImage.getAttribute('content')) {
      ogData.image = ogImage.getAttribute('content') || undefined;
    }
    
    console.log(`Extracted OpenGraph data for ${url}:`, ogData);
    return ogData;
  } catch (error) {
    console.error(`Error fetching OpenGraph data for ${url}:`, error);
    
    // Create a basic OpenGraph data object with just the URL as a fallback
    const fallbackOgData: OpenGraphData = { 
      url,
      title: new URL(url).hostname,
      description: `Visit ${url}`
    };
    
    console.log(`Created fallback OpenGraph data after error for ${url}:`, fallbackOgData);
    return fallbackOgData;
  }
}

// Cache for OpenGraph data to avoid repeated fetches
export const openGraphCache = new Map<string, OpenGraphData>();
