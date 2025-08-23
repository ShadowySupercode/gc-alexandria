import { BlossomService } from "./blossom_service.ts";
import { getNdkContext } from "../ndk.ts";

/**
 * Utility functions for integrating Blossom (NIP-B7) support with media handling
 */

let blossomServiceInstance: BlossomService | null = null;

/**
 * Get or create a BlossomService instance
 * @returns BlossomService instance
 */
function getBlossomService(): BlossomService | null {
  if (!blossomServiceInstance) {
    const ndk = getNdkContext();
    if (ndk) {
      blossomServiceInstance = new BlossomService(ndk);
    }
  }
  return blossomServiceInstance;
}

/**
 * Process a media URL with Blossom fallback support
 * @param url The original media URL
 * @param pubkey The author's public key
 * @returns Promise that resolves to a blob URL or the original URL
 */
export async function processMediaUrlWithBlossom(
  url: string, 
  pubkey: string
): Promise<string> {
  const blossomService = getBlossomService();
  if (!blossomService) {
    console.warn("[BlossomMediaUtils] No NDK context available for Blossom service");
    return url;
  }

  // Check if this is a Blossom-style URL
  if (!blossomService.isBlossomStyleUrl(url)) {
    return url;
  }

  try {
    // Try to resolve the media URL with Blossom fallback
    const content = await blossomService.resolveMediaUrl(url, pubkey);
    
    if (content) {
      // Create a blob URL from the content
      const blob = new Blob([content]);
      const blobUrl = URL.createObjectURL(blob);
      
      console.log(`[BlossomMediaUtils] Successfully resolved media via Blossom: ${url}`);
      return blobUrl;
    }
  } catch (error) {
    console.error("[BlossomMediaUtils] Error processing media URL with Blossom:", error);
  }

  // Fall back to original URL if Blossom resolution fails
  return url;
}

/**
 * Check if a URL should be processed with Blossom fallback
 * @param url The URL to check
 * @returns True if the URL should be processed with Blossom
 */
export function shouldUseBlossomFallback(url: string): boolean {
  const blossomService = getBlossomService();
  if (!blossomService) {
    return false;
  }
  
  return blossomService.isBlossomStyleUrl(url);
}

/**
 * Extract SHA-256 hash from a URL
 * @param url The URL to check
 * @returns The SHA-256 hash if found, null otherwise
 */
export function extractSha256FromUrl(url: string): string | null {
  const blossomService = getBlossomService();
  if (!blossomService) {
    return null;
  }
  
  return blossomService.extractSha256FromUrl(url);
}

/**
 * Get Blossom servers for a user
 * @param pubkey The user's public key
 * @returns Array of Blossom server URLs
 */
export async function getBlossomServers(pubkey: string): Promise<string[]> {
  const blossomService = getBlossomService();
  if (!blossomService) {
    return [];
  }
  
  return await blossomService.getBlossomServers(pubkey);
}

/**
 * Clear the Blossom service cache
 */
export function clearBlossomCache(): void {
  const blossomService = getBlossomService();
  if (blossomService) {
    blossomService.clearCache();
  }
}

/**
 * Enhanced image processing that includes Blossom fallback
 * @param src The image source URL
 * @param pubkey The author's public key
 * @param onLoad Callback when image loads successfully
 * @param onError Callback when image fails to load
 */
export function processImageWithBlossom(
  src: string,
  pubkey: string,
  onLoad?: (url: string) => void,
  onError?: (error: string) => void
): void {
  if (!shouldUseBlossomFallback(src)) {
    // Not a Blossom-style URL, use normal image loading
    if (onLoad) onLoad(src);
    return;
  }

  processMediaUrlWithBlossom(src, pubkey)
    .then((processedUrl) => {
      if (onLoad) onLoad(processedUrl);
    })
    .catch((error) => {
      console.error("[BlossomMediaUtils] Error processing image with Blossom:", error);
      if (onError) onError(error.message);
    });
}

/**
 * Enhanced video processing that includes Blossom fallback
 * @param src The video source URL
 * @param pubkey The author's public key
 * @param onLoad Callback when video loads successfully
 * @param onError Callback when video fails to load
 */
export function processVideoWithBlossom(
  src: string,
  pubkey: string,
  onLoad?: (url: string) => void,
  onError?: (error: string) => void
): void {
  if (!shouldUseBlossomFallback(src)) {
    // Not a Blossom-style URL, use normal video loading
    if (onLoad) onLoad(src);
    return;
  }

  processMediaUrlWithBlossom(src, pubkey)
    .then((processedUrl) => {
      if (onLoad) onLoad(processedUrl);
    })
    .catch((error) => {
      console.error("[BlossomMediaUtils] Error processing video with Blossom:", error);
      if (onError) onError(error.message);
    });
}

/**
 * Enhanced audio processing that includes Blossom fallback
 * @param src The audio source URL
 * @param pubkey The author's public key
 * @param onLoad Callback when audio loads successfully
 * @param onError Callback when audio fails to load
 */
export function processAudioWithBlossom(
  src: string,
  pubkey: string,
  onLoad?: (url: string) => void,
  onError?: (error: string) => void
): void {
  if (!shouldUseBlossomFallback(src)) {
    // Not a Blossom-style URL, use normal audio loading
    if (onLoad) onLoad(src);
    return;
  }

  processMediaUrlWithBlossom(src, pubkey)
    .then((processedUrl) => {
      if (onLoad) onLoad(processedUrl);
    })
    .catch((error) => {
      console.error("[BlossomMediaUtils] Error processing audio with Blossom:", error);
      if (onError) onError(error.message);
    });
}
