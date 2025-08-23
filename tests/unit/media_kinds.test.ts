import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NostrKind, MEDIA_KINDS, VIDEO_KINDS, AUDIO_KINDS } from '../../src/lib/types.ts';
import { getMimeTags } from '../../src/lib/utils/mime.ts';
import { getEventType } from '../../src/lib/utils/search_constants.ts';
import { 
  parseImetaTag, 
  getImetaTags, 
  getBestVideoUrl, 
  getBestAudioUrl, 
  getPreviewImageUrl,
  getVideoDuration,
  getAudioDuration,
  getWaveformData 
} from '../../src/lib/utils/imeta.ts';

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
      expect(MTag[1]).toBe('media/image/regular');
    });

    it('should return correct MIME tags for NormalVideo (kind 21)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.NormalVideo);
      expect(mTag).toEqual(['m', 'video/*']);
      expect(MTag[1]).toBe('media/video/normal/regular');
    });

    it('should return correct MIME tags for ShortVideo (kind 22)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.ShortVideo);
      expect(mTag).toEqual(['m', 'video/*']);
      expect(MTag[1]).toBe('media/video/short/regular');
    });

    it('should return correct MIME tags for RootVoiceMessage (kind 1222)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.RootVoiceMessage);
      expect(mTag).toEqual(['m', 'audio/*']);
      expect(MTag[1]).toBe('media/audio/root/regular');
    });

    it('should return correct MIME tags for ReplyVoiceMessage (kind 1224)', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.ReplyVoiceMessage);
      expect(mTag).toEqual(['m', 'audio/*']);
      expect(MTag[1]).toBe('media/audio/reply/regular');
    });

    it('should return correct MIME tags for non-media events', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.TextNote);
      expect(mTag).toEqual(['m', 'text/plain']);
      expect(MTag[1]).toBe('note/microblog/regular');
    });

    it('should return correct MIME tags for replaceable events', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.UserMetadata);
      expect(mTag).toEqual(['m', 'application/json']);
      expect(MTag[1]).toBe('meta-data/user/replaceable');
    });

    it('should return correct MIME tags for addressable events', () => {
      const [mTag, MTag] = getMimeTags(NostrKind.LongFormNote);
      expect(mTag).toEqual(['m', 'text/markup']);
      expect(MTag[1]).toBe('article/long-form/addressable');
    });

    it('should return default MIME tags for unknown event kinds', () => {
      const [mTag, MTag] = getMimeTags(99999);
      expect(mTag).toEqual(['m', 'text/plain']);
      expect(MTag[1]).toBe('note/generic/regular');
    });

    it('should return correct MIME tags for all media kinds', () => {
      const mediaKinds = [
        NostrKind.ImageMedia,
        NostrKind.NormalVideo,
        NostrKind.ShortVideo,
        NostrKind.RootVoiceMessage,
        NostrKind.ReplyVoiceMessage,
      ];

      mediaKinds.forEach(kind => {
        const [mTag, MTag] = getMimeTags(kind);
        expect(mTag[0]).toBe('m');
        expect(MTag[0]).toBe('M');
        expect(MTag[1]).toContain('media/');
        expect(MTag[1]).toContain('/regular');
      });
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

    it('should parse complex imeta tag with all fields', () => {
      const imetaTag = [
        'imeta',
        'url https://example.com/complex-video.mp4',
        'image https://example.com/thumb1.jpg',
        'image https://example.com/thumb2.jpg',
        'fallback https://backup1.com/video.mp4',
        'fallback https://backup2.com/video.mp4',
        'dim 1920x1080',
        'm video/mp4',
        'size 1048576',
        'blurhash LGF5]+Yk^6#M@-5c,1J5@[or[Q6.',
        'x a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
        'waveform 0 10 20 15 5 25 30 20 10 5',
        'duration 180'
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBe('https://example.com/complex-video.mp4');
      expect(result.image).toEqual([
        'https://example.com/thumb1.jpg',
        'https://example.com/thumb2.jpg'
      ]);
      expect(result.fallback).toEqual([
        'https://backup1.com/video.mp4',
        'https://backup2.com/video.mp4'
      ]);
      expect(result.dimensions).toBe('1920x1080');
      expect(result.mimeType).toBe('video/mp4');
      expect(result.size).toBe('1048576');
      expect(result.blurhash).toBe('LGF5]+Yk^6#M@-5c,1J5@[or[Q6.');
      expect(result.x).toBe('a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456');
      expect(result.waveform).toBe('0 10 20 15 5 25 30 20 10 5');
      expect(result.duration).toBe('180');
    });

    it('should handle malformed imeta tag gracefully', () => {
      const imetaTag = [
        'imeta',
        'url', // Missing value
        'dim', // Missing value
        'm', // Missing value
        'size abc', // Non-numeric size
        'duration xyz' // Non-numeric duration
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBeUndefined();
      expect(result.dimensions).toBeUndefined();
      expect(result.mimeType).toBeUndefined();
      expect(result.size).toBe('abc');
      expect(result.duration).toBe('xyz');
    });

    it('should handle duplicate fields (last one wins)', () => {
      const imetaTag = [
        'imeta',
        'url https://example.com/first.mp4',
        'url https://example.com/second.mp4',
        'm image/jpeg',
        'm video/mp4',
        'duration 60',
        'duration 120'
      ];

      const result = parseImetaTag(imetaTag);
      
      expect(result.url).toBe('https://example.com/second.mp4');
      expect(result.mimeType).toBe('video/mp4');
      expect(result.duration).toBe('120');
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

    it('should prioritize video URLs over fallback URLs', () => {
      const imetaData = [
        { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' },
        { fallback: ['https://example.com/fallback-video.mp4'], mimeType: 'video/mp4' }
      ];

      const result = getBestVideoUrl(imetaData);
      
      expect(result).toBe('https://example.com/video.mp4');
    });

    it('should return first video URL when multiple video URLs exist', () => {
      const imetaData = [
        { url: 'https://example.com/video1.mp4', mimeType: 'video/mp4' },
        { url: 'https://example.com/video2.mp4', mimeType: 'video/mp4' },
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }
      ];

      const result = getBestVideoUrl(imetaData);
      
      expect(result).toBe('https://example.com/video1.mp4');
    });

    it('should handle video URLs with different video MIME types', () => {
      const imetaData = [
        { url: 'https://example.com/video.webm', mimeType: 'video/webm' },
        { url: 'https://example.com/video.avi', mimeType: 'video/x-msvideo' },
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }
      ];

      const result = getBestVideoUrl(imetaData);
      
      expect(result).toBe('https://example.com/video.webm');
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

    it('should prioritize audio URLs over fallback URLs', () => {
      const imetaData = [
        { url: 'https://example.com/audio.m4a', mimeType: 'audio/mp4' },
        { fallback: ['https://example.com/fallback-audio.m4a'], mimeType: 'audio/mp4' }
      ];

      const result = getBestAudioUrl(imetaData);
      
      expect(result).toBe('https://example.com/audio.m4a');
    });

    it('should return first audio URL when multiple audio URLs exist', () => {
      const imetaData = [
        { url: 'https://example.com/audio1.m4a', mimeType: 'audio/mp4' },
        { url: 'https://example.com/audio2.mp3', mimeType: 'audio/mpeg' },
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }
      ];

      const result = getBestAudioUrl(imetaData);
      
      expect(result).toBe('https://example.com/audio1.m4a');
    });

    it('should handle audio URLs with different audio MIME types', () => {
      const imetaData = [
        { url: 'https://example.com/audio.wav', mimeType: 'audio/wav' },
        { url: 'https://example.com/audio.ogg', mimeType: 'audio/ogg' },
        { url: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }
      ];

      const result = getBestAudioUrl(imetaData);
      
      expect(result).toBe('https://example.com/audio.wav');
    });

    it('should return null for empty array', () => {
      const result = getBestAudioUrl([]);
      
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

    it('should return null for empty array', () => {
      const result = getPreviewImageUrl([]);
      
      expect(result).toBeNull();
    });

    it('should return first image URL from first imeta entry with images', () => {
      const imetaData = [
        { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' },
        { image: ['https://example.com/thumb1.jpg', 'https://example.com/thumb2.jpg'] },
        { image: ['https://example.com/thumb3.jpg'] }
      ];

      const result = getPreviewImageUrl(imetaData);
      
      expect(result).toBe('https://example.com/thumb1.jpg');
    });

    it('should handle single image URL', () => {
      const imetaData = [
        { image: ['https://example.com/single-thumb.jpg'] }
      ];

      const result = getPreviewImageUrl(imetaData);
      
      expect(result).toBe('https://example.com/single-thumb.jpg');
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

    it('should prioritize imeta duration over duration tag', () => {
      const event = {
        tags: [
          ['imeta', 'duration 180'],
          ['duration', '120'],
          ['title', 'Test Video']
        ]
      };

      const result = getVideoDuration(event);
      
      expect(result).toBe('180');
    });

    it('should handle numeric duration values', () => {
      const event = {
        tags: [
          ['imeta', 'duration 0'],
          ['title', 'Test Video']
        ]
      };

      const result = getVideoDuration(event);
      
      expect(result).toBe('0');
    });

    it('should handle large duration values', () => {
      const event = {
        tags: [
          ['imeta', 'duration 3600'],
          ['title', 'Test Video']
        ]
      };

      const result = getVideoDuration(event);
      
      expect(result).toBe('3600');
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

    it('should handle numeric duration values', () => {
      const event = {
        tags: [
          ['imeta', 'duration 0'],
          ['title', 'Test Audio']
        ]
      };

      const result = getAudioDuration(event);
      
      expect(result).toBe('0');
    });

    it('should handle large duration values', () => {
      const event = {
        tags: [
          ['imeta', 'duration 7200'],
          ['title', 'Test Audio']
        ]
      };

      const result = getAudioDuration(event);
      
      expect(result).toBe('7200');
    });

    it('should handle decimal duration values', () => {
      const event = {
        tags: [
          ['imeta', 'duration 120.5'],
          ['title', 'Test Audio']
        ]
      };

      const result = getAudioDuration(event);
      
      expect(result).toBe('120.5');
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

    it('should handle waveform data with decimal values', () => {
      const event = {
        tags: [
          ['imeta', 'waveform 0.5 10.2 20.8 15.1 5.9 25.3 30.7 20.4 10.6 5.2'],
          ['title', 'Test Audio with Decimals']
        ]
      };

      const result = getWaveformData(event);
      
      expect(result).toBe('0.5 10.2 20.8 15.1 5.9 25.3 30.7 20.4 10.6 5.2');
    });

    it('should handle single waveform value', () => {
      const event = {
        tags: [
          ['imeta', 'waveform 15'],
          ['title', 'Test Audio Single Value']
        ]
      };

      const result = getWaveformData(event);
      
      expect(result).toBe('15');
    });
  });
});
