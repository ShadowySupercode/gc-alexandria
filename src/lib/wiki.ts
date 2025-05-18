import Asciidoctor from 'asciidoctor';
import { parseBasicmarkup } from './utils/markup/basicMarkupParser';
import { getUserMetadata } from './utils/nostrUtils';
import { get } from 'svelte/store';
import { ndkInstance } from '$lib/ndk';
import { nip19 } from 'nostr-tools';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

async function fetchWikiEventById(id: string): Promise<NDKEvent | null> {
  const ndk = get(ndkInstance);
  if (!ndk) return null;

  let eventId = id;
  // If bech32, decode to hex
  if (id.startsWith('nevent') || id.startsWith('note') || id.startsWith('naddr')) {
    try {
      const decoded = nip19.decode(id);
      if (decoded.type === 'nevent') {
        eventId = decoded.data.id;
      } else if (decoded.type === 'note') {
        eventId = decoded.data;
      }
    } catch {
      return null;
    }
  }

  // Fetch the event by id (hex)
  const event = await ndk.fetchEvent({ ids: [eventId] });
  // Only return if it's a wiki event (kind 30818)
  if (event && event.kind === 30818) {
    return event;
  }
  return null;
}

async function fetchWikiEventsByDTag(dtag: string): Promise<NDKEvent[]> {
  const ndk = get(ndkInstance);
  if (!ndk) return [];

  // Query for kind 30818 events with the given d-tag
  const events = await ndk.fetchEvents({
    kinds: [30818],
    '#d': [dtag]
  });

  // Convert Set to Array and return
  return Array.from(events);
}

// Placeholder: Fetch profile name for a pubkey (kind 0 event)
async function getProfileName(pubkey: string): Promise<string> {
  if (!pubkey) return 'unknown';
  const metadata = await getUserMetadata(pubkey);
  return metadata.displayName || metadata.name || pubkey.slice(0, 10);
}

export async function getWikiPageById(id: string) {
  const event = await fetchWikiEventById(id);
  if (!event) return null;
  const pubhex = event.pubkey || '';
  const author = await getProfileName(pubhex);
  const titleTag = event.tags?.find((tag: string[]) => tag[0] === 'title');
  const title = titleTag ? titleTag[1] : 'Untitled';
  const asciidoctor = Asciidoctor();
  const asciidocHtml = asciidoctor.convert(event.content).toString();
  // Optionally log for debugging:
  // console.log('AsciiDoc HTML:', asciidocHtml);
  const html = await parseBasicmarkup(asciidocHtml);
  return { title, author, pubhex, html };
}

export async function searchWikiPagesByDTag(dtag: string) {
  const events = await fetchWikiEventsByDTag(dtag);
  // Return array of { title, pubhex, eventId, summary, nip05 }
  return Promise.all(events.map(async (event: any) => {
    const pubhex = event.pubkey || '';
    // Get title from 't' tag
    const titleTag = event.tags?.find((tag: string[]) => tag[0] === 't');
    const title = titleTag ? titleTag[1] : 'Untitled';
    // Get summary from 'summary' tag
    const summaryTag = event.tags?.find((tag: string[]) => tag[0] === 'summary');
    const summary = summaryTag ? summaryTag[1] : '';
    
    // Get user metadata including NIP-05
    const metadata = await getUserMetadata(pubhex);
    const nip05 = metadata.nip05 || '';
    
    // Construct human-readable URL
    const urlPath = nip05 ? `${dtag}/${nip05}` : `${dtag}*${pubhex}`;
    
    return {
      title,
      pubhex,
      eventId: event.id,
      summary,
      urlPath
    };
  }));
}