/**
 * Parse imeta tag data according to NIP-92 specification
 * @param imetaTag The imeta tag array from a Nostr event
 * @returns Parsed imeta data object
 */
export interface ImetaData {
  url?: string;
  dimensions?: string;
  mimeType?: string;
  size?: string;
  blurhash?: string;
  x?: string; // SHA256 hash
  image?: string[];
  fallback?: string[];
  service?: string;
  waveform?: string;
  duration?: string;
}

export function parseImetaTag(imetaTag: string[]): ImetaData {
  const data: ImetaData = {};
  
  for (let i = 1; i < imetaTag.length; i++) {
    const item = imetaTag[i];
    
    if (item.startsWith('url ')) {
      data.url = item.substring(4);
    } else if (item.startsWith('dim ')) {
      data.dimensions = item.substring(4);
    } else if (item.startsWith('m ')) {
      data.mimeType = item.substring(2);
    } else if (item.startsWith('size ')) {
      data.size = item.substring(5);
    } else if (item.startsWith('blurhash ')) {
      data.blurhash = item.substring(9);
    } else if (item.startsWith('x ')) {
      data.x = item.substring(2);
    } else if (item.startsWith('image ')) {
      if (!data.image) data.image = [];
      data.image.push(item.substring(6));
    } else if (item.startsWith('fallback ')) {
      if (!data.fallback) data.fallback = [];
      data.fallback.push(item.substring(9));
    } else if (item.startsWith('service ')) {
      data.service = item.substring(8);
    } else if (item.startsWith('waveform ')) {
      data.waveform = item.substring(9);
    } else if (item.startsWith('duration ')) {
      data.duration = item.substring(9);
    }
  }
  
  return data;
}

/**
 * Get all imeta tags from an event and parse them
 * @param event The Nostr event
 * @returns Array of parsed imeta data objects
 */
export function getImetaTags(event: any): ImetaData[] {
  if (!event.tags) return [];
  
  const imetaTags = event.tags.filter((tag: string[]) => tag[0] === 'imeta');
  return imetaTags.map(parseImetaTag);
}

/**
 * Get the best video URL from imeta tags (prioritizes primary URL, then fallbacks)
 * @param imetaData Array of parsed imeta data
 * @returns The best video URL to use
 */
export function getBestVideoUrl(imetaData: ImetaData[]): string | null {
  if (imetaData.length === 0) return null;
  
  // For videos, prefer the first imeta tag with a video URL
  for (const data of imetaData) {
    if (data.url && data.mimeType?.startsWith('video/')) {
      return data.url;
    }
  }
  
  // If no primary URL, try fallbacks
  for (const data of imetaData) {
    if (data.fallback && data.fallback.length > 0 && data.mimeType?.startsWith('video/')) {
      return data.fallback[0];
    }
  }
  
  return null;
}

/**
 * Get the best audio URL from imeta tags
 * @param imetaData Array of parsed imeta data
 * @returns The best audio URL to use
 */
export function getBestAudioUrl(imetaData: ImetaData[]): string | null {
  if (imetaData.length === 0) return null;
  
  // For audio, prefer the first imeta tag with an audio URL
  for (const data of imetaData) {
    if (data.url && data.mimeType?.startsWith('audio/')) {
      return data.url;
    }
  }
  
  // If no primary URL, try fallbacks
  for (const data of imetaData) {
    if (data.fallback && data.fallback.length > 0 && data.mimeType?.startsWith('audio/')) {
      return data.fallback[0];
    }
  }
  
  return null;
}

/**
 * Get preview image URL from imeta tags
 * @param imetaData Array of parsed imeta data
 * @returns The best preview image URL to use
 */
export function getPreviewImageUrl(imetaData: ImetaData[]): string | null {
  if (imetaData.length === 0) return null;
  
  // Look for image URLs in imeta tags
  for (const data of imetaData) {
    if (data.image && data.image.length > 0) {
      return data.image[0];
    }
  }
  
  return null;
}

/**
 * Get video duration from imeta tags or event tags
 * @param event The Nostr event
 * @returns Duration in seconds as string, or null
 */
export function getVideoDuration(event: any): string | null {
  // First check imeta tags for duration
  const imetaData = getImetaTags(event);
  for (const data of imetaData) {
    if (data.duration) {
      return data.duration;
    }
  }
  
  // Then check for duration tag
  if (event.tags) {
    const durationTag = event.tags.find((tag: string[]) => tag[0] === 'duration');
    if (durationTag && durationTag[1]) {
      return durationTag[1];
    }
  }
  
  return null;
}

/**
 * Get audio duration from imeta tags
 * @param event The Nostr event
 * @returns Duration in seconds as string, or null
 */
export function getAudioDuration(event: any): string | null {
  // Check imeta tags for duration
  const imetaData = getImetaTags(event);
  for (const data of imetaData) {
    if (data.duration) {
      return data.duration;
    }
  }
  
  return null;
}

/**
 * Get waveform data from imeta tags
 * @param event The Nostr event
 * @returns Waveform data as string, or null
 */
export function getWaveformData(event: any): string | null {
  const imetaData = getImetaTags(event);
  for (const data of imetaData) {
    if (data.waveform) {
      return data.waveform;
    }
  }
  
  return null;
}
