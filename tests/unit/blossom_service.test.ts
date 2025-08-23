import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlossomService } from '../../src/lib/utils/blossom_service.ts';
import NDK from '@nostr-dev-kit/ndk';
import { NostrKind } from '../../src/lib/types.ts';

// Mock NDK
vi.mock('@nostr-dev-kit/ndk', () => ({
  NDK: vi.fn().mockImplementation(() => ({
    fetchEvents: vi.fn(),
  })),
}));

describe('BlossomService', () => {
  let blossomService: BlossomService;
  let mockNdk: any;

  beforeEach(() => {
    mockNdk = {
      fetchEvents: vi.fn(),
    };
    blossomService = new BlossomService(mockNdk as any);
  });

  describe('extractSha256FromUrl', () => {
    it('should extract SHA-256 hash from URL ending with hex string', () => {
      const url = 'https://example.com/image/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456.png';
      const hash = blossomService.extractSha256FromUrl(url);
      expect(hash).toBe('a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456');
    });

    it('should extract SHA-256 hash from URL ending with hex string without extension', () => {
      const url = 'https://example.com/file/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      const hash = blossomService.extractSha256FromUrl(url);
      expect(hash).toBe('a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456');
    });

    it('should return null for URLs without SHA-256 hash', () => {
      const url = 'https://example.com/image.jpg';
      const hash = blossomService.extractSha256FromUrl(url);
      expect(hash).toBeNull();
    });

    it('should return null for URLs with invalid hex string', () => {
      const url = 'https://example.com/image/notahexstring.png';
      const hash = blossomService.extractSha256FromUrl(url);
      expect(hash).toBeNull();
    });
  });

  describe('isBlossomStyleUrl', () => {
    it('should return true for Blossom-style URLs', () => {
      const url = 'https://example.com/image/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456.png';
      expect(blossomService.isBlossomStyleUrl(url)).toBe(true);
    });

    it('should return false for regular URLs', () => {
      const url = 'https://example.com/image.jpg';
      expect(blossomService.isBlossomStyleUrl(url)).toBe(false);
    });
  });

  describe('getBlossomServers', () => {
    it('should fetch and cache Blossom servers', async () => {
      const mockEvent = {
        tags: [
          ['server', 'https://blossom.self.hosted'],
          ['server', 'https://cdn.blossom.cloud'],
        ],
      };

      mockNdk.fetchEvents.mockResolvedValue([mockEvent]);

      const servers = await blossomService.getBlossomServers('test-pubkey');
      
      expect(servers).toEqual([
        'https://blossom.self.hosted',
        'https://cdn.blossom.cloud',
      ]);

      expect(mockNdk.fetchEvents).toHaveBeenCalledWith({
        kinds: [NostrKind.BlossomServerList],
        authors: ['test-pubkey'],
        limit: 1,
      });
    });

    it('should return empty array when no Blossom event found', async () => {
      mockNdk.fetchEvents.mockResolvedValue([]);

      const servers = await blossomService.getBlossomServers('test-pubkey');
      
      expect(servers).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockNdk.fetchEvents.mockRejectedValue(new Error('Network error'));

      const servers = await blossomService.getBlossomServers('test-pubkey');
      
      expect(servers).toEqual([]);
    });
  });

  describe('generateBlossomUrls', () => {
    it('should generate Blossom URLs with extension', () => {
      const hash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      const servers = ['https://blossom.self.hosted', 'https://cdn.blossom.cloud'];
      const extension = '.png';

      const urls = blossomService.generateBlossomUrls(hash, servers, extension);
      
      expect(urls).toEqual([
        'https://blossom.self.hosted/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456.png',
        'https://cdn.blossom.cloud/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456.png',
      ]);
    });

    it('should generate Blossom URLs without extension', () => {
      const hash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      const servers = ['https://blossom.self.hosted'];

      const urls = blossomService.generateBlossomUrls(hash, servers);
      
      expect(urls).toEqual([
        'https://blossom.self.hosted/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      ]);
    });

    it('should handle servers with trailing slash', () => {
      const hash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      const servers = ['https://blossom.self.hosted/'];

      const urls = blossomService.generateBlossomUrls(hash, servers);
      
      expect(urls).toEqual([
        'https://blossom.self.hosted/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      ]);
    });
  });

  describe('verifySha256Hash', () => {
    it('should verify correct SHA-256 hash', () => {
      const content = new TextEncoder().encode('test');
      // This is the actual SHA-256 hash of 'test'
      const expectedHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
      
      const result = blossomService.verifySha256Hash(content.buffer as ArrayBuffer, expectedHash);
      expect(result).toBe(true);
    });

    it('should return false for incorrect hash', () => {
      const content = new TextEncoder().encode('test content');
      const wrongHash = 'wronghash';
      
      const result = blossomService.verifySha256Hash(content.buffer as ArrayBuffer, wrongHash);
      expect(result).toBe(false);
    });

    it('should handle empty content', () => {
      const content = new ArrayBuffer(0);
      const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA-256 of empty string
      
      const result = blossomService.verifySha256Hash(content, hash);
      expect(result).toBe(true);
    });

    it('should handle case-insensitive hash comparison', () => {
      const content = new TextEncoder().encode('test');
      const hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
      const upperHash = hash.toUpperCase();
      
      const result1 = blossomService.verifySha256Hash(content.buffer as ArrayBuffer, hash);
      const result2 = blossomService.verifySha256Hash(content.buffer as ArrayBuffer, upperHash);
      expect(result1).toBe(result2);
    });
  });

  describe('clearCache', () => {
    it('should clear the server cache', async () => {
      // First, populate the cache
      const mockEvent = {
        tags: [['server', 'https://blossom.self.hosted']],
      };
      mockNdk.fetchEvents.mockResolvedValue([mockEvent]);

      await blossomService.getBlossomServers('test-pubkey');
      
      // Clear the cache
      blossomService.clearCache();
      
      // Fetch again - should call fetchEvents again
      await blossomService.getBlossomServers('test-pubkey');
      
      expect(mockNdk.fetchEvents).toHaveBeenCalledTimes(2);
    });
  });
});
