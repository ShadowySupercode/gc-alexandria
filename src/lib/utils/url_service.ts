import { goto } from '$app/navigation';

/**
 * URL Service for managing search and pagination parameters
 * 
 * This service handles encoding and decoding of search parameters in URL query strings,
 * making search results shareable and enabling proper browser navigation.
 */

export interface SearchParams {
  q?: string;        // Search query
  stype?: string;    // Search type (d, t, n, id, nip05)
  p?: number;        // Page number
}

export interface DecodedSearchParams {
  searchValue: string | null;
  dTagValue: string | null;
  searchType: string | null;
  searchTerm: string | null;
  page: number;
}

/**
 * Encodes search parameters into a URL query string
 */
export function encodeSearchParams(params: SearchParams): string {
  const searchParams = new URLSearchParams();
  
  if (params.q) {
    searchParams.set('q', params.q);
  }
  
  if (params.stype) {
    searchParams.set('stype', params.stype);
  }
  
  if (params.p && params.p > 1) {
    searchParams.set('p', params.p.toString());
  }
  
  return searchParams.toString();
}

/**
 * Decodes search parameters from a URL query string
 */
export function decodeSearchParams(url: URL): DecodedSearchParams {
  const searchParams = url.searchParams;
  
  const q = searchParams.get('q');
  const stype = searchParams.get('stype');
  const p = parseInt(searchParams.get('p') || '1', 10);
  
  let searchValue: string | null = null;
  let dTagValue: string | null = null;
  let searchType: string | null = null;
  let searchTerm: string | null = null;
  
  // Handle legacy parameters for backward compatibility
  const id = searchParams.get('id');
  const d = searchParams.get('d');
  const t = searchParams.get('t');
  const n = searchParams.get('n');
  
  if (q && stype) {
    // New format: q=searchterm&stype=searchtype
    searchTerm = decodeURIComponent(q);
    searchType = stype;
    
    // Convert to the format expected by the search components
    switch (stype) {
      case 'd':
        // Check if searchTerm already starts with 'd:'
        if (searchTerm.startsWith('d:')) {
          searchValue = searchTerm;
          dTagValue = searchTerm.slice(2).toLowerCase();
        } else {
          searchValue = `d:${searchTerm}`;
          dTagValue = searchTerm.toLowerCase();
        }
        break;
      case 't':
        // Check if searchTerm already starts with 't:'
        if (searchTerm.startsWith('t:')) {
          searchValue = searchTerm;
        } else {
          searchValue = `t:${searchTerm}`;
        }
        // Normalize search term to lowercase for t-tag searches
        searchTerm = searchTerm.toLowerCase();
        break;
      case 'n':
        // Check if searchTerm already starts with 'n:'
        if (searchTerm.startsWith('n:')) {
          searchValue = searchTerm;
        } else {
          searchValue = `n:${searchTerm}`;
        }
        // Normalize search term to lowercase for n-tag searches
        searchTerm = searchTerm.toLowerCase();
        break;
      case 'id':
      case 'nip05':
        searchValue = searchTerm;
        break;
      default:
        searchValue = searchTerm;
    }
  } else if (id) {
    // Legacy format: id=eventid
    searchValue = decodeURIComponent(id);
    searchType = 'id';
    searchTerm = searchValue;
  } else if (d) {
    // Legacy format: d=dtag
    const decodedD = decodeURIComponent(d);
    searchValue = `d:${decodedD}`;
    dTagValue = decodedD.toLowerCase();
    searchType = 'd';
    searchTerm = decodedD;
  } else if (t) {
    // Legacy format: t=tag
    const decodedT = decodeURIComponent(t);
    searchValue = `t:${decodedT}`;
    searchType = 't';
    searchTerm = decodedT.toLowerCase();
  } else if (n) {
    // Legacy format: n=name
    const decodedN = decodeURIComponent(n);
    searchValue = `n:${decodedN}`;
    searchType = 'n';
    searchTerm = decodedN.toLowerCase();
  }
  
  return {
    searchValue,
    dTagValue,
    searchType,
    searchTerm,
    page: isNaN(p) ? 1 : Math.max(1, p),
  };
}

/**
 * Updates the current URL with search parameters
 */
export function updateSearchURL(params: SearchParams, shouldReplaceState = false): void {
  const url = new URL(window.location.href);
  const queryString = encodeSearchParams(params);
  
  if (queryString) {
    url.search = `?${queryString}`;
  } else {
    url.search = '';
  }
  
  goto(url.pathname + url.search, { replaceState: shouldReplaceState });
}

/**
 * Clears all search parameters from the URL
 */
export function clearSearchURL(shouldReplaceState = true): void {
  const url = new URL(window.location.href);
  url.search = '';
  
  goto(url.pathname, { replaceState: shouldReplaceState });
}

/**
 * Gets the current page from URL parameters
 */
export function getCurrentPage(url: URL): number {
  const p = parseInt(url.searchParams.get('p') || '1', 10);
  return isNaN(p) ? 1 : Math.max(1, p);
}

/**
 * Updates the page number in the current URL
 */
export function updatePageURL(page: number): void {
  const url = new URL(window.location.href);
  
  if (page > 1) {
    url.searchParams.set('p', page.toString());
  } else {
    url.searchParams.delete('p');
  }
  
  goto(url.pathname + url.search, { replaceState: false });
} 