/**
 * Tests for the URL service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  encodeSearchParams, 
  decodeSearchParams, 
  updateSearchURL, 
  clearSearchURL,
  getCurrentPage,
  updatePageURL 
} from '../../src/lib/utils/url_service';

describe('URL Service', () => {
  describe('encodeSearchParams', () => {
    it('should encode search parameters correctly', () => {
      const params = {
        q: 'test search',
        stype: 'd',
        p: 2
      };
      
      const result = encodeSearchParams(params);
      expect(result).toBe('q=test+search&stype=d&p=2');
    });

    it('should handle empty parameters', () => {
      const params = {};
      const result = encodeSearchParams(params);
      expect(result).toBe('');
    });

    it('should not include page parameter for page 1', () => {
      const params = {
        q: 'test',
        stype: 't',
        p: 1
      };
      
      const result = encodeSearchParams(params);
      expect(result).toBe('q=test&stype=t');
    });

    it('should encode all search types correctly', () => {
      const testCases = [
        { q: 'bitcoin', stype: 'd', expected: 'q=bitcoin&stype=d' },
        { q: 'nostr', stype: 't', expected: 'q=nostr&stype=t' },
        { q: 'alice', stype: 'n', expected: 'q=alice&stype=n' },
        { q: 'event123', stype: 'id', expected: 'q=event123&stype=id' },
        { q: 'user@domain.com', stype: 'nip05', expected: 'q=user%40domain.com&stype=nip05' }
      ];

      testCases.forEach(({ q, stype, expected }) => {
        const params = { q, stype };
        const result = encodeSearchParams(params);
        expect(result).toBe(expected);
      });
    });
  });

  describe('decodeSearchParams', () => {
    describe('New format parameters (q + stype)', () => {
      it('should decode d-tag search correctly', () => {
        const url = new URL('http://example.com?q=bitcoin&stype=d&p=3');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('d:bitcoin');
        expect(result.dTagValue).toBe('bitcoin');
        expect(result.searchType).toBe('d');
        expect(result.searchTerm).toBe('bitcoin');
        expect(result.page).toBe(3);
      });

      it('should decode t-tag search correctly', () => {
        const url = new URL('http://example.com?q=nostr&stype=t');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('t:nostr');
        expect(result.searchType).toBe('t');
        expect(result.searchTerm).toBe('nostr');
      });

      it('should decode n-tag search correctly', () => {
        const url = new URL('http://example.com?q=alice&stype=n');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('n:alice');
        expect(result.searchType).toBe('n');
        expect(result.searchTerm).toBe('alice');
      });

      it('should decode event ID search correctly', () => {
        const url = new URL('http://example.com?q=event123&stype=id');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('event123');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('event123');
      });

      it('should decode NIP-05 search correctly', () => {
        const url = new URL('http://example.com?q=user%40domain.com&stype=nip05');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('user@domain.com');
        expect(result.searchType).toBe('nip05');
        expect(result.searchTerm).toBe('user@domain.com');
      });
    });

    describe('Legacy format parameters', () => {
      it('should decode legacy id parameter correctly', () => {
        const url = new URL('http://example.com?id=event123&p=2');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('event123');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('event123');
        expect(result.page).toBe(2);
      });

      it('should decode the specific legacy id parameter from the user issue', () => {
        const url = new URL('http://example.com?id=dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319');
        expect(result.page).toBe(1);
      });

      it('should handle legacy d parameter correctly', () => {
        const url = new URL('http://example.com?d=bitcoin');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('d:bitcoin');
        expect(result.dTagValue).toBe('bitcoin');
        expect(result.searchType).toBe('d');
        expect(result.searchTerm).toBe('bitcoin');
      });

      it('should handle legacy t parameter correctly', () => {
        const url = new URL('http://example.com?t=nostr');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('t:nostr');
        expect(result.searchType).toBe('t');
        expect(result.searchTerm).toBe('nostr');
      });

      it('should handle legacy n parameter correctly', () => {
        const url = new URL('http://example.com?n=alice');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('n:alice');
        expect(result.searchType).toBe('n');
        expect(result.searchTerm).toBe('alice');
      });
    });

    describe('Nostr identifier types (via id parameter)', () => {
      it('should handle npub parameter correctly', () => {
        const url = new URL('http://example.com?id=npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z');
      });

      it('should handle nprofile parameter correctly', () => {
        const url = new URL('http://example.com?id=nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
      });

      it('should handle nevent parameter correctly', () => {
        const url = new URL('http://example.com?id=nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
      });

      it('should handle naddr parameter correctly', () => {
        const url = new URL('http://example.com?id=naddr1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('naddr1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('naddr1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
      });

      it('should handle note parameter correctly', () => {
        const url = new URL('http://example.com?id=note1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('note1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('note1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6');
      });

      it('should handle hex event ID correctly', () => {
        const url = new URL('http://example.com?id=dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319');
      });

      it('should handle hex pubkey correctly', () => {
        const url = new URL('http://example.com?id=fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1');
      });
    });

    describe('Search bar format parameters (prefixed)', () => {
      it('should handle d: prefix correctly', () => {
        const url = new URL('http://example.com?q=d%3Abitcoin&stype=d');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('d:bitcoin');
        expect(result.dTagValue).toBe('bitcoin');
        expect(result.searchType).toBe('d');
        expect(result.searchTerm).toBe('d:bitcoin');
      });

      it('should handle t: prefix correctly', () => {
        const url = new URL('http://example.com?q=t%3Anostr&stype=t');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('t:nostr');
        expect(result.searchType).toBe('t');
        expect(result.searchTerm).toBe('t:nostr');
      });

      it('should handle n: prefix correctly', () => {
        const url = new URL('http://example.com?q=n%3Aalice&stype=n');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('n:alice');
        expect(result.searchType).toBe('n');
        expect(result.searchTerm).toBe('n:alice');
      });

      it('should handle NIP-05 address correctly', () => {
        const url = new URL('http://example.com?q=user%40domain.com&stype=nip05');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('user@domain.com');
        expect(result.searchType).toBe('nip05');
        expect(result.searchTerm).toBe('user@domain.com');
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle empty parameters', () => {
        const url = new URL('http://example.com');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBeNull();
        expect(result.dTagValue).toBeNull();
        expect(result.searchType).toBeNull();
        expect(result.searchTerm).toBeNull();
        expect(result.page).toBe(1);
      });

      it('should handle mixed legacy and new format parameters', () => {
        // New format should take precedence
        const url = new URL('http://example.com?q=test&stype=d&id=legacy');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('d:test');
        expect(result.dTagValue).toBe('test');
        expect(result.searchType).toBe('d');
        expect(result.searchTerm).toBe('test');
      });

      it('should handle URL encoding in parameters', () => {
        const url = new URL('http://example.com?id=event%20123&d=bitcoin%20whitepaper');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('event 123');
        expect(result.searchType).toBe('id');
        expect(result.searchTerm).toBe('event 123');
      });

      it('should handle special characters in parameters', () => {
        const url = new URL('http://example.com?q=test%20with%20spaces&stype=d');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('d:test with spaces');
        expect(result.dTagValue).toBe('test with spaces');
        expect(result.searchType).toBe('d');
        expect(result.searchTerm).toBe('test with spaces');
      });

      it('should handle parameters with special characters', () => {
        const url = new URL('http://example.com?q=test%2Bwith%2Bplus&stype=t');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('t:test+with+plus');
        expect(result.searchType).toBe('t');
        expect(result.searchTerm).toBe('test+with+plus');
      });

      it('should handle parameters with unicode characters', () => {
        const url = new URL('http://example.com?q=test%C3%A9moj%C3%AD&stype=n');
        const result = decodeSearchParams(url);
        
        expect(result.searchValue).toBe('n:testémojí');
        expect(result.searchType).toBe('n');
        expect(result.searchTerm).toBe('testémojí');
      });
    });

    describe('Page parameter handling', () => {
      it('should default to page 1 when no page parameter', () => {
        const url = new URL('http://example.com?q=test&stype=d');
        const result = decodeSearchParams(url);
        
        expect(result.page).toBe(1);
      });

      it('should handle valid page numbers', () => {
        const url = new URL('http://example.com?q=test&stype=d&p=5');
        const result = decodeSearchParams(url);
        
        expect(result.page).toBe(5);
      });

      it('should handle invalid page numbers', () => {
        const url = new URL('http://example.com?q=test&stype=d&p=0');
        const result = decodeSearchParams(url);
        
        expect(result.page).toBe(1);
      });

      it('should handle negative page numbers', () => {
        const url = new URL('http://example.com?q=test&stype=d&p=-5');
        const result = decodeSearchParams(url);
        
        expect(result.page).toBe(1);
      });

      it('should handle non-numeric page numbers', () => {
        const url = new URL('http://example.com?q=test&stype=d&p=abc');
        const result = decodeSearchParams(url);
        
        expect(result.page).toBe(1);
      });

      it('should handle very large page numbers', () => {
        const url = new URL('http://example.com?q=test&stype=d&p=999999');
        const result = decodeSearchParams(url);
        
        expect(result.page).toBe(999999);
      });
    });

    describe('Comprehensive search parameter combinations', () => {
      it('should handle all search types with various formats', () => {
        const testCases = [
          // New format
          { url: 'http://example.com?q=bitcoin&stype=d', expected: { searchValue: 'd:bitcoin', searchType: 'd', searchTerm: 'bitcoin' } },
          { url: 'http://example.com?q=nostr&stype=t', expected: { searchValue: 't:nostr', searchType: 't', searchTerm: 'nostr' } },
          { url: 'http://example.com?q=alice&stype=n', expected: { searchValue: 'n:alice', searchType: 'n', searchTerm: 'alice' } },
          { url: 'http://example.com?q=event123&stype=id', expected: { searchValue: 'event123', searchType: 'id', searchTerm: 'event123' } },
          { url: 'http://example.com?q=user%40domain.com&stype=nip05', expected: { searchValue: 'user@domain.com', searchType: 'nip05', searchTerm: 'user@domain.com' } },
          
          // Legacy format
          { url: 'http://example.com?d=bitcoin', expected: { searchValue: 'd:bitcoin', searchType: 'd', searchTerm: 'bitcoin' } },
          { url: 'http://example.com?t=nostr', expected: { searchValue: 't:nostr', searchType: 't', searchTerm: 'nostr' } },
          { url: 'http://example.com?n=alice', expected: { searchValue: 'n:alice', searchType: 'n', searchTerm: 'alice' } },
          { url: 'http://example.com?id=event123', expected: { searchValue: 'event123', searchType: 'id', searchTerm: 'event123' } },
          
          // Nostr identifiers
          { url: 'http://example.com?id=npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z', expected: { searchValue: 'npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z', searchType: 'id', searchTerm: 'npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z' } },
          { url: 'http://example.com?id=nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', expected: { searchValue: 'nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', searchType: 'id', searchTerm: 'nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6' } },
          { url: 'http://example.com?id=naddr1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', expected: { searchValue: 'naddr1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', searchType: 'id', searchTerm: 'naddr1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6' } },
          { url: 'http://example.com?id=note1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', expected: { searchValue: 'note1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', searchType: 'id', searchTerm: 'note1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6' } },
          { url: 'http://example.com?id=nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', expected: { searchValue: 'nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6', searchType: 'id', searchTerm: 'nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cguknyawm24xqw6pz8mhxue69uhkummnw3ezuetcv9khqmr99e9k7um5wgh8w6twv5h8h6' } },
          { url: 'http://example.com?id=dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319', expected: { searchValue: 'dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319', searchType: 'id', searchTerm: 'dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319' } },
          { url: 'http://example.com?id=fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1', expected: { searchValue: 'fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1', searchType: 'id', searchTerm: 'fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1' } }
        ];

        testCases.forEach(({ url: urlStr, expected }) => {
          const url = new URL(urlStr);
          const result = decodeSearchParams(url);
          
          expect(result.searchValue).toBe(expected.searchValue);
          expect(result.searchType).toBe(expected.searchType);
          expect(result.searchTerm).toBe(expected.searchTerm);
        });
      });
    });
  });

  describe('NIP-05 Search Functionality', () => {
    // Mock fetch for testing
    const originalFetch = globalThis.fetch;
    
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    describe('searchNip05 function', () => {
      it('should handle case-insensitive NIP-05 lookups', async () => {
        // Mock successful response with case-sensitive keys
        const mockWellKnownData = {
          names: {
            "TheBeave": "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2",
            "silberengel": "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1"
          }
        };

        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => mockWellKnownData
        });

        // Import the function dynamically to avoid module loading issues
        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        // Test case-insensitive lookup
        const result = await searchNip05('thebeave@gitcitadel.com');
        
        expect(globalThis.fetch).toHaveBeenCalledWith(
          'https://gitcitadel.com/.well-known/nostr.json?name=thebeave'
        );
        expect(result).toBeDefined();
      });

      it('should handle exact case matches first', async () => {
        const mockWellKnownData = {
          names: {
            "thebeave": "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2",
            "TheBeave": "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2"
          }
        };

        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => mockWellKnownData
        });

        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        // Should find exact match first
        const result = await searchNip05('thebeave@gitcitadel.com');
        
        expect(result).toBeDefined();
      });

      it('should include well-known URL in error messages', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        });

        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        try {
          await searchNip05('nonexistent@gitcitadel.com');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).toContain('Check the well-known file at: https://gitcitadel.com/.well-known/nostr.json?name=nonexistent');
        }
      });

      it('should handle HTTP errors with well-known URL', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        });

        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        try {
          await searchNip05('test@gitcitadel.com');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).toContain('HTTP 500: Internal Server Error');
          expect((error as Error).message).toContain('Check the well-known file at: https://gitcitadel.com/.well-known/nostr.json?name=test');
        }
      });

      it('should handle NIP-05 address not found with well-known URL', async () => {
        const mockWellKnownData = {
          names: {
            "otheruser": "somepubkey"
          }
        };

        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => mockWellKnownData
        });

        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        try {
          await searchNip05('missinguser@gitcitadel.com');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).toContain('NIP-05 address not found: missinguser@gitcitadel.com');
          expect((error as Error).message).toContain('Check the well-known file at: https://gitcitadel.com/.well-known/nostr.json?name=missinguser');
        }
      });

      it('should validate NIP-05 address format', async () => {
        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        try {
          await searchNip05('invalid-format');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).toContain('Invalid NIP-05 address format');
        }
      });

      it('should handle network errors gracefully', async () => {
        (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'));

        const { searchNip05 } = await import('../../src/lib/utils/event_search.ts');
        
        try {
          await searchNip05('test@gitcitadel.com');
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect((error as Error).message).toContain('Error resolving NIP-05 address: Error: Network error');
        }
      });
    });

    describe('wellKnownUrl function', () => {
      it('should generate correct well-known URLs', async () => {
        const { wellKnownUrl } = await import('../../src/lib/utils/search_utils.ts');
        
        expect(wellKnownUrl('gitcitadel.com', 'thebeave')).toBe(
          'https://gitcitadel.com/.well-known/nostr.json?name=thebeave'
        );
        
        expect(wellKnownUrl('example.com', 'user')).toBe(
          'https://example.com/.well-known/nostr.json?name=user'
        );
      });
    });

    describe('isValidNip05Address function', () => {
      it('should validate correct NIP-05 addresses', async () => {
        const { isValidNip05Address } = await import('../../src/lib/utils/search_utils.ts');
        
        expect(isValidNip05Address('user@domain.com')).toBe(true);
        expect(isValidNip05Address('thebeave@gitcitadel.com')).toBe(true);
        expect(isValidNip05Address('user-name@domain.co.uk')).toBe(true);
        expect(isValidNip05Address('user123@domain.org')).toBe(true);
      });

      it('should reject invalid NIP-05 addresses', async () => {
        const { isValidNip05Address } = await import('../../src/lib/utils/search_utils.ts');
        
        expect(isValidNip05Address('invalid-format')).toBe(false);
        expect(isValidNip05Address('user@')).toBe(false);
        expect(isValidNip05Address('@domain.com')).toBe(false);
        expect(isValidNip05Address('user domain.com')).toBe(false);
        expect(isValidNip05Address('')).toBe(false);
      });
    });
  });

  describe('getCurrentPage', () => {
    it('should return the current page from URL', () => {
      const url = new URL('http://example.com?p=5');
      const result = getCurrentPage(url);
      expect(result).toBe(5);
    });

    it('should return 1 when no page parameter', () => {
      const url = new URL('http://example.com');
      const result = getCurrentPage(url);
      expect(result).toBe(1);
    });

    it('should handle invalid page numbers', () => {
      const url = new URL('http://example.com?p=-1');
      const result = getCurrentPage(url);
      expect(result).toBe(1);
    });
  });
}); 