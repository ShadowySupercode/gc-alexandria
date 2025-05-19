import { parseBasicmarkup } from './utils/markup/basicMarkupParser';
import { getUserMetadata, fetchEventWithFallback } from './utils/nostrUtils';
import { get } from 'svelte/store';
import { ndkInstance } from '$lib/ndk';
import { nip19 } from 'nostr-tools';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type NDK from '@nostr-dev-kit/ndk';
import Pharos from '$lib/parser.ts';
import { wikiKind } from './consts';

/**
 * Fetch a single wiki event by id (hex or bech32).
 */
export async function fetchWikiEventById(id: string): Promise<NDKEvent | null> {
  const ndk = get(ndkInstance);
  if (!ndk) {
    console.warn('NDK instance not found in fetchWikiEventById');
    return null;
  }

  let eventId = id;
  if (id.startsWith('nevent') || id.startsWith('note') || id.startsWith('naddr')) {
    try {
      const decoded = nip19.decode(id);
      if (decoded.type === 'nevent') {
        eventId = decoded.data.id;
      } else if (decoded.type === 'note') {
        eventId = decoded.data;
      }
    } catch (e) {
      console.error('Failed to decode id in fetchWikiEventById:', e);
      return null;
    }
  }

  const event = await fetchEventWithFallback(ndk, eventId);
  if (event && event.kind === wikiKind) {
    console.log('Fetched wiki event:', event);
    return event;
  }
  console.warn('No wiki event found for id:', eventId);
  return null;
}

/**
 * Fetch all wiki events by d-tag.
 */
export async function fetchWikiEventsByDTag(dtag: string): Promise<NDKEvent[]> {
  const ndk = get(ndkInstance);
  if (!ndk) {
    console.warn('NDK instance not found in fetchWikiEventsByDTag');
    return [];
  }

  const event = await fetchEventWithFallback(ndk, {
    kinds: [wikiKind],
    '#d': [dtag]
  });
  
  if (!event) {
    console.warn(`No wiki events found for dtag: ${dtag}`);
    return [];
  }

  // For d-tag queries, we want to get all matching events, not just the first one
  const events = await ndk.fetchEvents({
    kinds: [wikiKind],
    '#d': [dtag]
  });
  
  const arr = Array.from(events);
  console.log(`Fetched ${arr.length} wiki events for dtag:`, dtag);
  return arr;
}

/**
 * Get a display name for a pubkey.
 */
export async function getProfileName(pubkey: string): Promise<string> {
  if (!pubkey) return 'unknown';
  const metadata = await getUserMetadata(pubkey);
  return metadata.displayName || metadata.name || pubkey.slice(0, 10);
}

/**
 * Fetch and parse a wiki page by event id or nevent.
 */
export async function getWikiPageById(id: string, ndk: NDK) {
  console.log('getWikiPageById: fetching wiki page for id', id);
  if (!id) {
    console.error('getWikiPageById: id is undefined');
    return null;
  }

  let event;
  try {
    event = await fetchEventWithFallback(ndk, id);
    if (!event) {
      console.error('getWikiPageById: No event found for id:', id);
      return null;
    }
    if (event.kind !== wikiKind) {
      console.error('getWikiPageById: Event found but kind !== wikiKind:', event);
      return null;
    }
    if (!event.content) {
      console.error('getWikiPageById: Event has no content:', event);
      return null;
    }
    if (!event.tags) {
      console.error('getWikiPageById: Event has no tags:', event);
      return null;
    }
  } catch (err) {
    console.error('getWikiPageById: Exception fetching event:', err, 'id:', id);
    return null;
  }

  const pubhex = event.pubkey || '';
  const titleTag = event.tags.find((tag: string[]) => tag[0] === 'title');
  const title = titleTag ? titleTag[1] : 'Untitled';
  const summaryTag = event.tags.find((tag: string[]) => tag[0] === 'summary');
  const summary = summaryTag ? summaryTag[1] : '';
  const hashtags = event.tags.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]) || [];

  let asciidoc = event.content;
  if (!/^=\s/m.test(asciidoc)) {
    console.warn('getWikiPageById: No document header found, prepending fake header for title:', title);
    asciidoc = `= ${title}\n\n` + asciidoc;
  }

  let html = '';
  try {
    const pharos = new Pharos(ndk);
    console.log('Pharos instance:', pharos);
    pharos.parse(asciidoc);
    const pharosHtml = pharos.getHtml();
    console.log('AsciiDoc:', asciidoc);
    console.log('Pharos HTML:', pharosHtml);
    html = await parseBasicmarkup(pharosHtml ?? '');
    if (!html || html.trim() === '') {
      console.error('getWikiPageById: Parsed HTML is empty for id:', id, 'event:', event, 'asciidoc:', asciidoc, 'pharosHtml:', pharosHtml);
    }
  } catch (err) {
    console.error('getWikiPageById: Error parsing content:', err, 'event:', event);
    return null;
  }

  return { title, pubhex, eventId: event.id, summary, hashtags, html, content: event.content };
}

/**
 * Search wiki pages by d-tag.
 */
export async function searchWikiPagesByDTag(dtag: string) {
  const events = await fetchWikiEventsByDTag(dtag);
  return Promise.all(events.map(async (event: NDKEvent) => {
    const pubhex = event.pubkey || '';
    const titleTag = event.tags?.find((tag: string[]) => tag[0] === 't');
    const title = titleTag ? titleTag[1] : 'Untitled';
    const summaryTag = event.tags?.find((tag: string[]) => tag[0] === 'summary');
    const summary = summaryTag ? summaryTag[1] : '';
    const metadata = await getUserMetadata(pubhex);
    const nip05 = metadata.nip05 || '';
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

/**
 * Parse wiki content using Pharos and basic markup parser.
 */
export async function parseWikiContent(content: string, ndk: NDK): Promise<string> {
  const pharos = new Pharos(ndk);
  pharos.parse(content);
  const pharosHtml = pharos.getHtml();
  return await parseBasicmarkup(pharosHtml);
}