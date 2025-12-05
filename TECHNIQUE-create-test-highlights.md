# Technique: Creating Test Highlight Events for Nostr Publications

## Overview

This technique allows you to create test highlight events (kind 9802) for
testing the highlight rendering system in Alexandria. Highlights are text
selections from publication sections that users want to mark as important or
noteworthy, optionally with annotations.

## When to Use This

- Testing highlight fetching and rendering
- Verifying highlight filtering by section
- Testing highlight display UI (inline markers, side panel, etc.)
- Debugging highlight-related features
- Demonstrating the highlight system to stakeholders

## Prerequisites

1. **Node.js packages**: `nostr-tools` and `ws`
   ```bash
   npm install nostr-tools ws
   ```

2. **Valid publication structure**: You need the actual publication address
   (naddr) and its internal structure (section addresses, pubkeys)

## Step 1: Decode the Publication Address

If you have an `naddr` (Nostr address), decode it to find the publication
structure:

**Script**: `check-publication-structure.js`

```javascript
import { nip19 } from "nostr-tools";
import WebSocket from "ws";

const naddr = "naddr1qvzqqqr4t..."; // Your publication naddr

console.log("Decoding naddr...\n");
const decoded = nip19.decode(naddr);
console.log("Decoded:", JSON.stringify(decoded, null, 2));

const { data } = decoded;
const rootAddress = `${data.kind}:${data.pubkey}:${data.identifier}`;
console.log("\nRoot Address:", rootAddress);

// Fetch the index event to see what sections it references
const relay = "wss://relay.nostr.band";

async function fetchPublication() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relay);
    const events = [];

    ws.on("open", () => {
      console.log(`\nConnected to ${relay}`);
      console.log("Fetching index event...\n");

      const filter = {
        kinds: [data.kind],
        authors: [data.pubkey],
        "#d": [data.identifier],
      };

      const subscriptionId = `sub-${Date.now()}`;
      ws.send(JSON.stringify(["REQ", subscriptionId, filter]));
    });

    ws.on("message", (message) => {
      const [type, subId, event] = JSON.parse(message.toString());

      if (type === "EVENT") {
        events.push(event);
        console.log("Found index event:", event.id);
        console.log("\nTags:");
        event.tags.forEach((tag) => {
          if (tag[0] === "a") {
            console.log(`  Section address: ${tag[1]}`);
          }
          if (tag[0] === "d") {
            console.log(`  D-tag: ${tag[1]}`);
          }
          if (tag[0] === "title") {
            console.log(`  Title: ${tag[1]}`);
          }
        });
      } else if (type === "EOSE") {
        ws.close();
        resolve(events);
      }
    });

    ws.on("error", reject);

    setTimeout(() => {
      ws.close();
      resolve(events);
    }, 5000);
  });
}

fetchPublication()
  .then(() => console.log("\nDone!"))
  .catch(console.error);
```

**Run it**: `node check-publication-structure.js`

**Expected output**: Section addresses like
`30041:dc4cd086...:the-art-of-thinking-without-permission`

## Step 2: Understand Kind 9802 Event Structure

A highlight event (kind 9802) has this structure:

```javascript
{
  kind: 9802,
  pubkey: "<highlighter-pubkey>",
  created_at: 1704067200,
  tags: [
    ["a", "<section-address>", "<relay>"],           // Required: target section
    ["context", "<surrounding-text>"],                 // Optional: helps locate highlight
    ["p", "<author-pubkey>", "<relay>", "author"],   // Optional: original author
    ["comment", "<user-annotation>"]                   // Optional: user's note
  ],
  content: "<the-actual-highlighted-text>",           // Required: the selected text
  id: "<calculated>",
  sig: "<calculated>"
}
```

### Critical Differences from Comments (kind 1111):

| Aspect                 | Comments (1111)                                                  | Highlights (9802)                            |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| **Content field**      | User's comment text                                              | The highlighted text itself                  |
| **User annotation**    | N/A (content is the comment)                                     | Optional `["comment", ...]` tag              |
| **Context**            | Not used                                                         | `["context", ...]` provides surrounding text |
| **Threading**          | Uses `["e", ..., "reply"]` tags                                  | No threading (flat structure)                |
| **Tag capitalization** | Uses both uppercase (A, K, P) and lowercase (a, k, p) for NIP-22 | Only lowercase tags                          |

## Step 3: Create Test Highlight Events

**Script**: `create-test-highlights.js`

```javascript
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import WebSocket from "ws";

// Test user keys (generate fresh ones)
const testUserKey = generateSecretKey();
const testUserPubkey = getPublicKey(testUserKey);

console.log("Test User pubkey:", testUserPubkey);

// The publication details (from Step 1)
const publicationPubkey =
  "dc4cd086cd7ce5b1832adf4fdd1211289880d2c7e295bcb0e684c01acee77c06";
const rootAddress =
  `30040:${publicationPubkey}:anarchistic-knowledge-the-art-of-thinking-without-permission`;

// Section addresses (from Step 1 output)
const sections = [
  `30041:${publicationPubkey}:the-art-of-thinking-without-permission`,
  `30041:${publicationPubkey}:the-natural-promiscuity-of-understanding`,
  // ... more sections
];

// Relays to publish to (matching HighlightLayer's relay list)
const relays = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
];

// Test highlights to create
const testHighlights = [
  {
    highlightedText:
      "Knowledge that tries to stay put inevitably becomes ossified",
    context:
      "This is the fundamental paradox... Knowledge that tries to stay put inevitably becomes ossified, a monument to itself... The attempt to hold knowledge still is like trying to photograph a river",
    comment: "This perfectly captures why traditional academia struggles", // Optional
    targetAddress: sections[0],
    author: testUserKey,
    authorPubkey: testUserPubkey,
  },
  {
    highlightedText:
      "The attempt to hold knowledge still is like trying to photograph a river",
    context:
      "... a monument to itself rather than a living practice. The attempt to hold knowledge still is like trying to photograph a river—you capture an image, but you lose the flow.",
    comment: null, // No annotation, just highlight
    targetAddress: sections[0],
    author: testUserKey,
    authorPubkey: testUserPubkey,
  },
];

async function publishEvent(event, relayUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    let published = false;

    ws.on("open", () => {
      console.log(`Connected to ${relayUrl}`);
      ws.send(JSON.stringify(["EVENT", event]));
    });

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message[0] === "OK" && message[1] === event.id) {
        if (message[2]) {
          console.log(`✓ Published ${event.id.substring(0, 8)}`);
          published = true;
          ws.close();
          resolve();
        } else {
          console.error(`✗ Rejected: ${message[3]}`);
          ws.close();
          reject(new Error(message[3]));
        }
      }
    });

    ws.on("error", reject);
    ws.on("close", () => {
      if (!published) reject(new Error("Connection closed"));
    });

    setTimeout(() => {
      if (!published) {
        ws.close();
        reject(new Error("Timeout"));
      }
    }, 10000);
  });
}

async function createAndPublishHighlights() {
  console.log("\n=== Creating Test Highlights ===\n");

  for (const highlight of testHighlights) {
    try {
      // Create unsigned event
      const unsignedEvent = {
        kind: 9802,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["a", highlight.targetAddress, relays[0]],
          ["context", highlight.context],
          ["p", publicationPubkey, relays[0], "author"],
        ],
        content: highlight.highlightedText, // The highlighted text
        pubkey: highlight.authorPubkey,
      };

      // Add optional comment/annotation
      if (highlight.comment) {
        unsignedEvent.tags.push(["comment", highlight.comment]);
      }

      // Sign the event
      const signedEvent = finalizeEvent(unsignedEvent, highlight.author);

      console.log(
        `\nHighlight: "${highlight.highlightedText.substring(0, 60)}..."`,
      );
      console.log(`Target: ${highlight.targetAddress}`);
      console.log(`Event ID: ${signedEvent.id}`);

      // Publish
      await publishEvent(signedEvent, relays[0]);

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`Failed: ${error.message}`);
    }
  }

  console.log("\n=== Done! ===");
  console.log('\nRefresh the page and toggle "Show Highlights" to view them.');
}

createAndPublishHighlights().catch(console.error);
```

## Step 4: Run and Verify

1. **Run the script**:
   ```bash
   node create-test-highlights.js
   ```

2. **Expected output**:
   ```
   Test User pubkey: a1b2c3d4...

   === Creating Test Highlights ===

   Highlight: "Knowledge that tries to stay put inevitably becomes oss..."
   Target: 30041:dc4cd086...:the-art-of-thinking-without-permission
   Event ID: e5f6g7h8...
   Connected to wss://relay.damus.io
   ✓ Published e5f6g7h8

   ...

   === Done! ===
   ```

3. **Verify in the app**:
   - Refresh the publication page
   - Click "Show Highlights" button
   - Highlighted text should appear with yellow background
   - Hover to see annotation (if provided)

## Common Issues and Solutions

### Issue: "Relay rejected: rate-limited"

**Cause**: Publishing too many events too quickly

**Solution**: Increase delay between publishes

```javascript
await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 seconds
```

### Issue: Highlights don't appear after publishing

**Possible causes**:

1. Wrong section address - verify with `check-publication-structure.js`
2. HighlightLayer not fetching from the relay you published to
3. Browser cache - hard refresh (Ctrl+Shift+R)

**Debug steps**:

```javascript
// In browser console, check what highlights are being fetched:
console.log("All highlights:", allHighlights);

// Check if your event ID is present
allHighlights.find((h) => h.id === "your-event-id");
```

### Issue: Context not matching actual publication text

**Cause**: The publication content changed, or you're using sample text

**Solution**: Copy actual text from the publication:

1. Open the publication in browser
2. Select the text you want to highlight
3. Copy a larger surrounding context (2-3 sentences)
4. Use that as the `context` value

## Key Patterns to Remember

1. **Content field = highlighted text** (NOT a comment)
2. **Context tag helps locate** the highlight in the source document
3. **Comment tag is optional** user annotation
4. **No threading** - highlights are flat, not threaded like comments
5. **Single lowercase 'a' tag** - not uppercase/lowercase pairs like comments
6. **Always verify addresses** with `check-publication-structure.js` first

## Adapting for Different Publications

To use this technique on a different publication:

1. Get the publication's naddr from the URL
2. Run `check-publication-structure.js` with that naddr
3. Update these values in `create-test-highlights.js`:
   - `publicationPubkey`
   - `rootAddress`
   - `sections` array
4. Update `highlightedText` and `context` to match actual publication content
5. Run the script

## Further Reading

- NIP-84 (Highlights): https://github.com/nostr-protocol/nips/blob/master/84.md
- `src/lib/components/publications/HighlightLayer.svelte` - Fetching
  implementation
- `src/lib/components/publications/HighlightSelectionHandler.svelte` - Event
  creation
- NIP-19 (Address encoding):
  https://github.com/nostr-protocol/nips/blob/master/19.md
