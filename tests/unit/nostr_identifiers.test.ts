import { describe, it, expect } from 'vitest';
import { 
  isEventId, 
  isCoordinate, 
  parseCoordinate, 
  createCoordinate,
  isNostrIdentifier 
} from '../../src/lib/utils/nostr_identifiers';

describe('Nostr Identifier Validation', () => {
  describe('isEventId', () => {
    it('should validate correct hex event IDs', () => {
      const validId = 'a'.repeat(64);
      expect(isEventId(validId)).toBe(true);
      
      const validIdWithMixedCase = 'A'.repeat(32) + 'f'.repeat(32);
      expect(isEventId(validIdWithMixedCase)).toBe(true);
    });

    it('should reject invalid event IDs', () => {
      expect(isEventId('')).toBe(false);
      expect(isEventId('abc')).toBe(false);
      expect(isEventId('a'.repeat(63))).toBe(false); // too short
      expect(isEventId('a'.repeat(65))).toBe(false); // too long
      expect(isEventId('g'.repeat(64))).toBe(false); // invalid hex char
    });
  });

  describe('isCoordinate', () => {
    it('should validate correct coordinates', () => {
      const validCoordinate = `30040:${'a'.repeat(64)}:chapter-1`;
      expect(isCoordinate(validCoordinate)).toBe(true);
      
      const coordinateWithColonsInDTag = `30041:${'b'.repeat(64)}:chapter:with:colons`;
      expect(isCoordinate(coordinateWithColonsInDTag)).toBe(true);
    });

    it('should reject invalid coordinates', () => {
      expect(isCoordinate('')).toBe(false);
      expect(isCoordinate('abc')).toBe(false);
      expect(isCoordinate('30040:abc:chapter-1')).toBe(false); // invalid pubkey
      expect(isCoordinate('30040:abc')).toBe(false); // missing d-tag
      expect(isCoordinate('abc:def:ghi')).toBe(false); // invalid kind
      expect(isCoordinate('-1:abc:def')).toBe(false); // negative kind
    });
  });

  describe('parseCoordinate', () => {
    it('should parse valid coordinates correctly', () => {
      const coordinate = `30040:${'a'.repeat(64)}:chapter-1`;
      const parsed = parseCoordinate(coordinate);
      
      expect(parsed).toEqual({
        kind: 30040,
        pubkey: 'a'.repeat(64),
        dTag: 'chapter-1'
      });
    });

    it('should handle d-tags with colons', () => {
      const coordinate = `30041:${'b'.repeat(64)}:chapter:with:colons`;
      const parsed = parseCoordinate(coordinate);
      
      expect(parsed).toEqual({
        kind: 30041,
        pubkey: 'b'.repeat(64),
        dTag: 'chapter:with:colons'
      });
    });

    it('should return null for invalid coordinates', () => {
      expect(parseCoordinate('')).toBeNull();
      expect(parseCoordinate('abc')).toBeNull();
      expect(parseCoordinate('30040:abc:chapter-1')).toBeNull();
    });
  });

  describe('createCoordinate', () => {
    it('should create valid coordinates', () => {
      const coordinate = createCoordinate(30040, 'a'.repeat(64), 'chapter-1');
      expect(coordinate).toBe(`30040:${'a'.repeat(64)}:chapter-1`);
    });

    it('should handle d-tags with colons', () => {
      const coordinate = createCoordinate(30041, 'b'.repeat(64), 'chapter:with:colons');
      expect(coordinate).toBe(`30041:${'b'.repeat(64)}:chapter:with:colons`);
    });
  });

  describe('isNostrIdentifier', () => {
    it('should accept valid event IDs', () => {
      expect(isNostrIdentifier('a'.repeat(64))).toBe(true);
    });

    it('should accept valid coordinates', () => {
      const coordinate = `30040:${'a'.repeat(64)}:chapter-1`;
      expect(isNostrIdentifier(coordinate)).toBe(true);
    });

    it('should reject invalid identifiers', () => {
      expect(isNostrIdentifier('')).toBe(false);
      expect(isNostrIdentifier('abc')).toBe(false);
      expect(isNostrIdentifier('30040:abc:chapter-1')).toBe(false);
    });
  });
}); 