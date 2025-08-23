# Blossom (NIP-B7) Support in Alexandria

Alexandria now supports the Blossom protocol (NIP-B7) for handling media files that are addressed by their SHA-256 hash. This implementation provides automatic fallback to Blossom servers when media URLs fail to load.

## Overview

Blossom is a set of standards for dealing with servers that store files addressable by their SHA-256 sums. When a Nostr client finds a URL ending with a 64-character hex string (with or without a file extension) that is no longer available, it can use Blossom servers as a fallback to retrieve the content.

## Implementation Details

### Core Components

1. **BlossomService** (`src/lib/utils/blossom_service.ts`)
   - Main service class for handling Blossom functionality
   - Manages server discovery, URL generation, and SHA-256 verification
   - Includes caching for server lists to improve performance

2. **Blossom Media Utils** (`src/lib/utils/blossom_media_utils.ts`)
   - Utility functions for integrating Blossom with existing media handling
   - Provides enhanced media processing with automatic fallback

3. **EmbeddedEvent Component** (`src/lib/components/embedded_events/EmbeddedEvent.svelte`)
   - Updated to use Blossom fallback for images, videos, and audio
   - Automatically detects Blossom-style URLs and applies fallback logic

### Key Features

#### SHA-256 URL Detection
- Automatically detects URLs ending with 64-character hex strings
- Supports URLs with or without file extensions
- Examples:
  - `https://example.com/image/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678.png`
  - `https://example.com/file/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678`

#### Server Discovery
- Fetches `kind:10063` events from users to discover their Blossom servers
- **Optimized caching**: Current user's Blossom servers are cached in the user store on login
- **On-demand fetching**: Other users' servers are fetched and cached for 5 minutes
- Extracts server URLs from `server` tags in the event

#### Automatic Fallback
- When a media URL fails to load, automatically tries Blossom servers
- Generates Blossom URLs using the format: `https://server.com/<hash>[.extension]`
- Tries multiple servers in parallel for better reliability

#### SHA-256 Verification
- Verifies downloaded content matches the expected SHA-256 hash
- Ensures content integrity and prevents malicious file substitution
- Uses the `@noble/hashes` library for cryptographic operations

## Usage

### For Developers

#### Basic Blossom Service Usage

```typescript
import { BlossomService } from '$lib/utils/blossom_service';
import { getNdkContext } from '$lib/ndk';

const ndk = getNdkContext();
const blossomService = new BlossomService(ndk);

// Check if a URL is a Blossom-style URL
const isBlossomUrl = blossomService.isBlossomStyleUrl(url);

// Extract SHA-256 hash from URL
const hash = blossomService.extractSha256FromUrl(url);

// Get Blossom servers for a user
const servers = await blossomService.getBlossomServers(pubkey);

// Resolve media URL with Blossom fallback
const content = await blossomService.resolveMediaUrl(url, pubkey);
```

#### Media Processing with Blossom

```typescript
import { processImageWithBlossom } from '$lib/utils/blossom_media_utils';

// Process image with automatic Blossom fallback
processImageWithBlossom(
  imageUrl,
  authorPubkey,
  (blobUrl) => {
    // Success: use the blob URL
    img.src = blobUrl;
  },
  (error) => {
    // Error: handle fallback failure
    console.error('Blossom fallback failed:', error);
  }
);
```

### For Users

Blossom support is automatic and transparent. When viewing content in Alexandria:

1. **Normal Operation**: Media loads normally from the original URL
2. **Fallback Triggered**: If the original URL fails and it's a Blossom-style URL, Alexandria automatically:
   - Uses cached Blossom servers (for current user) or discovers the author's Blossom servers
   - Tries to fetch the media from those servers
   - Verifies the content matches the expected hash
   - Displays the media if successful

**Performance Benefits**: Your own Blossom servers are loaded once on login, making media fallback nearly instant.

## Configuration

### Constants

- `NostrKind.BlossomServerList = 10063` - The Nostr event kind for Blossom server lists
- Cache timeout: 5 minutes for server lists
- Fetch timeout: 10 seconds for media downloads

### MIME Types

The Blossom kind (10063) is registered with the MIME type system:
- MIME tag: `["m", "application/json"]`
- Nostr MIME tag: `["M", "blossom/server-list/replaceable"]`

## Testing

Run the Blossom service tests:

```bash
deno test tests/unit/blossom_service.test.ts
```

The test suite covers:
- SHA-256 URL detection and extraction
- Server discovery and caching
- URL generation for different server configurations
- SHA-256 hash verification
- Error handling and edge cases

## Security Considerations

1. **Hash Verification**: All downloaded content is verified against the expected SHA-256 hash
2. **Server Validation**: Only servers listed in the user's `kind:10063` event are used
3. **Timeout Protection**: Network requests have timeouts to prevent hanging
4. **Error Handling**: Graceful degradation when Blossom servers are unavailable

## Limitations

1. **Server Availability**: Fallback only works if the user has published a `kind:10063` event
2. **Content Size**: Large files may timeout during download
3. **CORS**: Some Blossom servers may not support CORS for browser requests
4. **Cache Management**: 
   - Current user's servers are cached in user store and persist across page reloads
   - Other users' servers are cached in memory and cleared on page reload

## Future Enhancements

Potential improvements for future versions:

1. **Persistent Cache**: Store server lists in IndexedDB for longer persistence
2. **Progressive Loading**: Show loading indicators during Blossom fallback
3. **Multiple Hash Support**: Support for other hash algorithms beyond SHA-256
4. **Server Health Checks**: Proactively test Blossom server availability
5. **User Configuration**: Allow users to configure preferred Blossom servers

## References

- [NIP-B7: Blossom Media](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [Blossom Protocol Documentation](https://github.com/hzrd149/blossom)
- [BUD-03: Server Discovery](https://github.com/hzrd149/blossom/blob/master/buds/03.md)
