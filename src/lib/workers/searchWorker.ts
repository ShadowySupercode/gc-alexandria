import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { getTagValue, getTagValues } from '$lib/utils/eventTags';

// Message types for worker communication
type SearchMessage = {
  type: 'SEARCH' | 'AUTOCOMPLETE';
  events: NDKEvent[];
  query: string;
  chunkSize?: number;
};

type WorkerResponse = {
  type: 'SEARCH_RESULT' | 'SEARCH_PROGRESS' | 'SEARCH_ERROR' | 'AUTOCOMPLETE_RESULT';
  results?: NDKEvent[];
  suggestions?: Array<{
    text: string;
    type: 'title' | 'author' | 'tag';
    score: number;
  }>;
  progress?: {
    processed: number;
    total: number;
    percentage: number;
  };
  error?: {
    message: string;
    code: string;
  };
};

// Constants
const DEFAULT_CHUNK_SIZE = 100;
const PROGRESS_UPDATE_INTERVAL = 100; // Update progress every 100ms

// Add Levenshtein distance calculation for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// Add scoring function for search results
function calculateSearchScore(
  event: NDKEvent,
  searchQuery: string,
  fieldMatches: { [key: string]: boolean }
): number {
  let score = 0;
  const maxDistance = Math.max(searchQuery.length, 3); // Allow for some fuzzy matching
  
  // Score exact matches higher
  if (fieldMatches.titleExact) score += 100;
  if (fieldMatches.authorNameExact) score += 80;
  if (fieldMatches.summaryExact) score += 60;
  
  // Score fuzzy matches
  if (fieldMatches.titleFuzzy) score += 70;
  if (fieldMatches.authorNameFuzzy) score += 50;
  if (fieldMatches.summaryFuzzy) score += 40;
  
  // Boost score for recent publications
  const ageInDays = (Date.now() / 1000 - event.created_at!) / (24 * 60 * 60);
  const recencyBoost = Math.max(0, 1 - (ageInDays / 365)); // Decay over a year
  score += recencyBoost * 20;
  
  return score;
}

// Function to filter events based on search criteria
function filterEventsBySearch(
  events: NDKEvent[],
  query: string,
  onProgress?: (processed: number, total: number) => void,
  abortSignal?: AbortSignal
): NDKEvent[] {
  if (!query) return events;
  
  const searchQuery = query.toLowerCase();
  const isNip05Query = /^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(searchQuery);
  const results: Array<{ event: NDKEvent; score: number }> = [];
  let lastProgressUpdate = Date.now();
  
  try {
    for (let i = 0; i < events.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Search operation aborted');
      }

      const event = events[i];
      
      // Basic search fields
      const title = getTagValue(event, 'title')?.toLowerCase() ?? '';
      const authorName = getTagValue(event, 'author')?.toLowerCase() ?? '';
      const authorPubkey = event.pubkey.toLowerCase();
      const nip05 = getTagValue(event, 'nip05')?.toLowerCase() ?? '';
      const summary = getTagValue(event, 'summary')?.toLowerCase() ?? '';

      // Check NIP-05 query first
      if (isNip05Query) {
        if (nip05 === searchQuery) {
          results.push({ event, score: 100 });
        }
        continue;
      }

      // Calculate field matches with fuzzy search
      const fieldMatches = {
        titleExact: title.includes(searchQuery),
        titleFuzzy: levenshteinDistance(title, searchQuery) <= Math.min(3, searchQuery.length / 2),
        authorNameExact: authorName.includes(searchQuery),
        authorNameFuzzy: levenshteinDistance(authorName, searchQuery) <= Math.min(3, searchQuery.length / 2),
        summaryExact: summary.includes(searchQuery),
        summaryFuzzy: levenshteinDistance(summary, searchQuery) <= Math.min(3, searchQuery.length / 2),
        pubkeyMatch: authorPubkey.includes(searchQuery),
        nip05Match: nip05.includes(searchQuery)
      };

      // Check if any field matches (exact or fuzzy)
      const hasMatch = Object.values(fieldMatches).some(match => match);

      if (hasMatch || !query) {
        const score = calculateSearchScore(event, searchQuery, fieldMatches);
        results.push({ event, score });
      }

      // Update progress if enough time has passed
      const now = Date.now();
      if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
        onProgress?.(i + 1, events.length);
        lastProgressUpdate = now;
      }
    }

    // Sort results by score and return just the events
    return results
      .sort((a, b) => b.score - a.score)
      .map(({ event }) => event);
  } catch (error) {
    console.error('Error in filterEventsBySearch:', error);
    throw error;
  }
}

// Process events in chunks
async function processEventsInChunks(
  events: NDKEvent[],
  query: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  const results: NDKEvent[] = [];
  const totalChunks = Math.ceil(events.length / chunkSize);
  
  for (let i = 0; i < totalChunks; i++) {
    if (abortSignal?.aborted) {
      throw new Error('Search operation aborted');
    }

    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, events.length);
    const chunk = events.slice(start, end);

    try {
      const chunkResults = filterEventsBySearch(
        chunk,
        query,
        (processed, total) => {
          const overallProcessed = start + processed;
          const progress = {
            processed: overallProcessed,
            total: events.length,
            percentage: Math.round((overallProcessed / events.length) * 100)
          };
          
          self.postMessage({
            type: 'SEARCH_PROGRESS',
            progress
          } as WorkerResponse);
        },
        abortSignal
      );

      results.push(...chunkResults);
    } catch (error) {
      if (error instanceof Error) {
        self.postMessage({
          type: 'SEARCH_ERROR',
          error: {
            message: error.message,
            code: error.name
          }
        } as WorkerResponse);
      }
      throw error;
    }
  }

  return results;
}

// Function to generate autocomplete suggestions
function generateSuggestions(
  events: NDKEvent[],
  query: string,
  maxSuggestions: number = 5
): Array<{ text: string; type: 'title' | 'author' | 'tag'; score: number }> {
  if (!query || query.length < 2) return [];
  
  const searchQuery = query.toLowerCase();
  const suggestions = new Map<string, { text: string; type: 'title' | 'author' | 'tag'; score: number }>();
  
  // Process events to extract potential suggestions
  for (const event of events) {
    // Get title suggestions
    const title = getTagValue(event, 'title')?.toLowerCase() ?? '';
    if (title && title.includes(searchQuery)) {
      const score = calculateSuggestionScore(title, searchQuery, 'title');
      suggestions.set(title, { text: title, type: 'title', score });
    }
    
    // Get author suggestions
    const authorName = getTagValue(event, 'author')?.toLowerCase() ?? '';
    if (authorName && authorName.includes(searchQuery)) {
      const score = calculateSuggestionScore(authorName, searchQuery, 'author');
      suggestions.set(authorName, { text: authorName, type: 'author', score });
    }
    
    // Get tag suggestions
    const tags = getTagValues(event, 't').map(t => t.toLowerCase());
    for (const tag of tags) {
      if (tag.includes(searchQuery)) {
        const score = calculateSuggestionScore(tag, searchQuery, 'tag');
        suggestions.set(tag, { text: tag, type: 'tag', score });
      }
    }
  }
  
  // Convert to array, sort by score, and limit to maxSuggestions
  return Array.from(suggestions.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);
}

// Function to calculate suggestion score
function calculateSuggestionScore(
  text: string,
  query: string,
  type: 'title' | 'author' | 'tag'
): number {
  let score = 0;
  
  // Base score for type
  switch (type) {
    case 'title':
      score = 100;
      break;
    case 'author':
      score = 80;
      break;
    case 'tag':
      score = 60;
      break;
  }
  
  // Boost score for exact matches at the start
  if (text.startsWith(query)) {
    score += 50;
  }
  
  // Boost score for shorter matches (more precise)
  const lengthRatio = query.length / text.length;
  score += lengthRatio * 30;
  
  return score;
}

// Handle messages from the main thread
self.onmessage = async (e: MessageEvent<SearchMessage>) => {
  const { type, events, query, chunkSize } = e.data;
  
  if (type === 'SEARCH') {
    try {
      const results = await processEventsInChunks(
        events,
        query,
        chunkSize
      );
      
      self.postMessage({
        type: 'SEARCH_RESULT',
        results
      } as WorkerResponse);
    } catch (error) {
      if (error instanceof Error) {
        self.postMessage({
          type: 'SEARCH_ERROR',
          error: {
            message: error.message,
            code: error.name
          }
        } as WorkerResponse);
      }
    }
  } else if (type === 'AUTOCOMPLETE') {
    try {
      const suggestions = generateSuggestions(events, query);
      self.postMessage({
        type: 'AUTOCOMPLETE_RESULT',
        suggestions
      } as WorkerResponse);
    } catch (error) {
      if (error instanceof Error) {
        self.postMessage({
          type: 'SEARCH_ERROR',
          error: {
            message: error.message,
            code: error.name
          }
        } as WorkerResponse);
      }
    }
  }
}; 