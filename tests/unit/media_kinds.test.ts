import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NostrKind, MEDIA_KINDS, VIDEO_KINDS, AUDIO_KINDS } from '../../src/lib/types';
import { getMimeTags } from '../../src/lib/utils/mime';
import { getEventType } from '$lib/utils/search_constants';
import { 
  parseImetaTag, 
  getImetaTags, 
  getBestVideoUrl, 
  getBestAudioUrl, 
  getPreviewImageUrl,
  getVideoDuration,
  getAudioDuration,
  getWaveformData 
} from '../../src/lib/utils/imeta';

describe('Media Kinds Support', () => {
  describe('NostrKind Enum', () => {
    it('should have correct media kind values', () => {
      expect(NostrKind.ImageMedia).toBe(20);
      expect(NostrKind.NormalVideo).toBe(21);
      expect(NostrKind.ShortVideo).toBe(22);
      expect(NostrKind.RootVoiceMessage).toBe(1222);
      expect(NostrKind.ReplyVoiceMessage).toBe(1244);
    });

    it('should include all media kinds in MEDIA_KINDS array', () => {
      expect(MEDIA_KINDS).toContain(NostrKind.ImageMedia);
      expect(MEDIA_KINDS).toContain(NostrKind.NormalVideo);
      expect(MEDIA_KINDS).toContain(NostrKind.ShortVideo);
      expect(MEDIA_KINDS).toContain(NostrKind.RootVoiceMessage);
      expect(MEDIA_KINDS).toContain(NostrKind.ReplyVoiceMessage);
      expect(MEDIA_KINDS).toHaveLength(5);
    });

    it('should include video kinds in VIDEO_KINDS array', () => {
      expect(VIDEO_KINDS).toContain(NostrKind.NormalVideo);
      expect(VIDEO_KINDS).toContain(NostrKind.ShortVideo);
      expect(VIDEO_KINDS).toHaveLength(2);
    });

    it('should include audio kinds in AUDIO_KINDS array', () => {
      expect(AUDIO_KINDS).toContain(NostrKind.RootVoiceMessage);
      expect(AUDIO_KINDS).toContain(NostrKind.ReplyVoiceMessage);
      expect(AUDIO_KINDS).toHaveLength(2);
    });
  });

  describe('MIME Type Support', () => {
    it('should return correct MIME tags for ImageMedia (kind 20)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.ImageMedia);
      expect(mTag).toEqual(['m', 'image/*']);
      expect(MTag[1]).toMatch(/^media\/image\/(replaceable|nonreplaceable)$/);
    });

    it('should return correct MIME tags for NormalVideo (kind 21)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.NormalVideo);
      expect(mTag).toEqual(['m', 'video/*']);
      expect(MTag[1]).toMatch(/^media\/video\/normal\/(replaceable|nonreplaceable)$/);
    });

    it('should return correct MIME tags for ShortVideo (kind 22)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.ShortVideo);
      expect(mTag).toEqual(['m', 'video/*']);
      expect(MTag[1]).toMatch(/^media\/video\/short\/(replaceable|nonreplaceable)$/);
    });

    it('should return correct MIME tags for RootVoiceMessage (kind 1222)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.RootVoiceMessage);
      expect(mTag).toEqual(['m', 'audio/*']);
      expect(MTag[1]).toMatch(/^media\/audio\/root\/(replaceable|nonreplaceable)$/);
    });

    it('should return correct MIME tags for ReplyVoiceMessage (kind 1224)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.ReplyVoiceMessage);
      expect(mTag).toEqual(['m', 'audio/*']);
      expect(MTag[1]).toMatch(/^media\/audio\/reply\/(replaceable|nonreplaceable)$/);
    });
  });

  describe('Event Type Classification', () => {
    it('should classify media kinds as regular events', () => {
      expect(getEventType(NostrKind.ImageMedia)).toBe('regular');
      expect(getEventType(NostrKind.NormalVideo)).toBe('regular');
      expect(getEventType(NostrKind.ShortVideo)).toBe('regular');
      expect(getEventType(NostrKind.RootVoiceMessage)).toBe('regular');
      expect(getEventType(NostrKind.ReplyVoiceMessage)).toBe('regular');
    });
  });
});

describe('Imeta Tag Parsing', () => {
  describe('parseImetaTag', () => {
    it('should parse basic imeta tag data', () => {
      const imetaTag = [
        'imeta',
        'url https://example.com/video.mp4',
        'dim 1920x1080',
        'm video/mp4',
        'size 1048576',
        'blurhash LGF5]+Yk^6#M@-5c,1J5@[or[Q6.',
        'x a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678'
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBe('https://example.com/video.mp4');
      expect(result.dimensions).toBe('1920x1080');
      expect(result.mimeType).toBe('video/mp4');
      expect(result.size).toBe('1048576');
      expect(result.blurhash).toBe('LGF5]+Yk^6#M@-5c,1J5@[or[Q6.');
      expect(result.x).toBe('a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678');
    });

    it('should parse multiple image and fallback URLs', () => {
      const imetaTag = [
        'imeta',
        'url https://example.com/video.mp4',
        'image https://example.com/thumb1.jpg',
        'image https://example.com/thumb2.jpg',
        'fallback https://backup1.com/video.mp4',
        'fallback https://backup2.com/video.mp4'
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBe('https://example.com/video.mp4');
      expect(result.image).toEqual([
        'https://example.com/thumb1.jpg',
        'https://example.com/thumb2.jpg'
      ]);
      expect(result.fallback).toEqual([
        'https://backup1.com/video.mp4',
        'https://backup2.com/video.mp4'
      ]);
    });

    it('should parse audio-specific fields', () => {
      const imetaTag = [
        'imeta',
        'url https://example.com/audio.m4a',
        'waveform 0 10 20 15 5 25 30 20 10 5',
        'duration 120'
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBe('https://example.com/audio.m4a');
      expect(result.waveform).toBe('0 10 20 15 5 25 30 20 10 5');
      expect(result.duration).toBe('120');
    });

    it('should handle empty imeta tag', () => {
      const imetaTag = ['imeta'];
      const result = parseImetaTag(imetaTag);
      
      expect(result).toEqual({});
    });

    it('should ignore unknown fields', () => {
      const imetaTag = [
        'imeta',
        'url https://example.com/video.mp4',
        'unknown field value',
        'm video/mp4'
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBe('https://example.com/video.mp4');
      expect(result.mimeType).toBe('video/mp4');
      // Note: unknown fields are ignored by the parser
    });
  });

  describe('getImetaTags', () => {
    it('should extract all imeta tags from an event', () => {
      const event = {
        tags: [
          ['imeta', 'url https://example.com/video1.mp4', 'm video/mp4'],
          ['imeta', 'url https://example.com/video2.mp4', 'm video/mp4'],
          ['title', 'Test Video'],
          ['imeta', 'url https://example.com/image.jpg', 'm image/jpeg']
        ]
      };

      const result = getImetaTags(event);
      
      expect(result).toHaveLength(3);
      expect(result[0].url).toBe('https://example.com/video1.mp4');
      expect(result[1].url).toBe('https://example.com/video2.mp4');
      expect(result[2].url).toBe('https://example.com/image.jpg');
    });

    it('should return empty array for event without imeta tags', () => {
      const event = {
        tags: [
          ['title', 'Test Video'],
          ['t', 'nostr']
        ]
      };

      const result = getImetaTags(event);
      
      expect(result).toEqual([]);
    });

    it('should handle event without tags', () => {
      const event = {};
      const result = getImetaTags(event);
      
      expect(result).toEqual([]);
    });
  });

  describe('getBestVideoUrl', () => {
    it('should return primary video URL', () => {
      const imetaData = [
        { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' },
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }
      ];

      const result = getBestVideoUrl(imetaData);
      
      expect(result).toBe('https://example.com/video.mp4');
    });

    it('should return fallback video URL when primary is not video', () => {
      const imetaData = [
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' },
        { fallback: ['https://example.com/video.mp4'], mimeType: 'video/mp4' }
      ];

      const result = getBestVideoUrl(imetaData);
      
      expect(result).toBe('https://example.com/video.mp4');
    });

    it('should return null when no video URLs found', () => {
      const imetaData = [
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' },
        { url: 'https://example.com/audio.m4a', mimeType: 'audio/mp4' }
      ];

      const result = getBestVideoUrl(imetaData);
      
      expect(result).toBeNull();
    });

    it('should return null for empty array', () => {
      const result = getBestVideoUrl([]);
      
      expect(result).toBeNull();
    });
  });

  describe('getBestAudioUrl', () => {
    it('should return primary audio URL', () => {
      const imetaData = [
        { url: 'https://example.com/audio.m4a', mimeType: 'audio/mp4' },
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }
      ];

      const result = getBestAudioUrl(imetaData);
      
      expect(result).toBe('https://example.com/audio.m4a');
    });

    it('should return fallback audio URL when primary is not audio', () => {
      const imetaData = [
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' },
        { fallback: ['https://example.com/audio.m4a'], mimeType: 'audio/mp4' }
      ];

      const result = getBestAudioUrl(imetaData);
      
      expect(result).toBe('https://example.com/audio.m4a');
    });

    it('should return null when no audio URLs found', () => {
      const imetaData = [
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' },
        { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' }
      ];

      const result = getBestAudioUrl(imetaData);
      
      expect(result).toBeNull();
    });
  });

  describe('getPreviewImageUrl', () => {
    it('should return first image URL from imeta data', () => {
      const imetaData = [
        { image: ['https://example.com/thumb1.jpg', 'https://example.com/thumb2.jpg'] },
        { image: ['https://example.com/thumb3.jpg'] }
      ];

      const result = getPreviewImageUrl(imetaData);
      
      expect(result).toBe('https://example.com/thumb1.jpg');
    });

    it('should return null when no image URLs found', () => {
      const imetaData = [
        { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' }
      ];

      const result = getPreviewImageUrl(imetaData);
      
      expect(result).toBeNull();
    });
  });

  describe('getVideoDuration', () => {
    it('should return duration from imeta tags', () => {
      const event = {
        tags: [
          ['imeta', 'duration 180'],
          ['title', 'Test Video']
        ]
      };

      const result = getVideoDuration(event);
      
      expect(result).toBe('180');
    });

    it('should return duration from duration tag when not in imeta', () => {
      const event = {
        tags: [
          ['duration', '120'],
          ['title', 'Test Video']
        ]
      };

      const result = getVideoDuration(event);
      
      expect(result).toBe('120');
    });

    it('should return null when no duration found', () => {
      const event = {
        tags: [
          ['title', 'Test Video']
        ]
      };

      const result = getVideoDuration(event);
      
      expect(result).toBeNull();
    });
  });

  describe('getAudioDuration', () => {
    it('should return duration from imeta tags', () => {
      const event = {
        tags: [
          ['imeta', 'duration 60'],
          ['title', 'Test Audio']
        ]
      };

      const result = getAudioDuration(event);
      
      expect(result).toBe('60');
    });

    it('should return null when no duration found', () => {
      const event = {
        tags: [
          ['title', 'Test Audio']
        ]
      };

      const result = getAudioDuration(event);
      
      expect(result).toBeNull();
    });
  });

  describe('getWaveformData', () => {
    it('should return waveform data from imeta tags', () => {
      const event = {
        tags: [
          ['imeta', 'waveform 0 10 20 15 5 25 30 20 10 5'],
          ['title', 'Test Audio']
        ]
      };

      const result = getWaveformData(event);
      
      expect(result).toBe('0 10 20 15 5 25 30 20 10 5');
    });

    it('should return null when no waveform found', () => {
      const event = {
        tags: [
          ['title', 'Test Audio']
        ]
      };

      const result = getWaveformData(event);
      
      expect(result).toBeNull();
    });
  });
});
