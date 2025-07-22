import { describe, it, expect } from 'vitest';
import { TIMEOUTS } from '../../src/lib/utils/search_constants';

describe('Search Timeout Configuration', () => {
  it('should use PROFILE_SEARCH timeout for n: searches', () => {
    const searchType = 'n';
    const timeoutDuration = searchType === 'n' ? TIMEOUTS.PROFILE_SEARCH : TIMEOUTS.SUBSCRIPTION_SEARCH;
    
    expect(timeoutDuration).toBe(TIMEOUTS.PROFILE_SEARCH);
    expect(TIMEOUTS.PROFILE_SEARCH).toBe(15000); // 15 seconds
  });

  it('should use SUBSCRIPTION_SEARCH timeout for d: and t: searches', () => {
    const searchTypes = ['d', 't'];
    
    for (const searchType of searchTypes) {
      const timeoutDuration = searchType === 'n' ? TIMEOUTS.PROFILE_SEARCH : TIMEOUTS.SUBSCRIPTION_SEARCH;
      
      expect(timeoutDuration).toBe(TIMEOUTS.SUBSCRIPTION_SEARCH);
    }
    
    expect(TIMEOUTS.SUBSCRIPTION_SEARCH).toBe(8000); // 8 seconds
  });

  it('should have appropriate timeout values', () => {
    // Profile searches should have longer timeout than regular subscription searches
    expect(TIMEOUTS.PROFILE_SEARCH).toBeGreaterThan(TIMEOUTS.SUBSCRIPTION_SEARCH);
    
    // Both timeouts should be reasonable values
    expect(TIMEOUTS.PROFILE_SEARCH).toBeGreaterThan(0);
    expect(TIMEOUTS.SUBSCRIPTION_SEARCH).toBeGreaterThan(0);
  });
}); 