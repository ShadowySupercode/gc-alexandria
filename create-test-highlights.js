import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import WebSocket from "ws";

// Test user keys (generate fresh ones)
const testUserKey = generateSecretKey();
const testUserPubkey = getPublicKey(testUserKey);

const testUser2Key = generateSecretKey();
const testUser2Pubkey = getPublicKey(testUser2Key);

console.log("Test User 1 pubkey:", testUserPubkey);
console.log("Test User 2 pubkey:", testUser2Pubkey);

// The publication details from the article (REAL VALUES)
const publicationPubkey =
  "dc4cd086cd7ce5b1832adf4fdd1211289880d2c7e295bcb0e684c01acee77c06";
const rootAddress =
  `30040:${publicationPubkey}:anarchistic-knowledge-the-art-of-thinking-without-permission`;

// Section addresses (from the actual publication structure)
const sections = [
  `30041:${publicationPubkey}:the-art-of-thinking-without-permission`,
  `30041:${publicationPubkey}:the-natural-promiscuity-of-understanding`,
  `30041:${publicationPubkey}:institutional-capture-and-knowledge-enclosure`,
  `30041:${publicationPubkey}:the-persistent-escape-of-knowledge`,
];

// Relays to publish to (matching HighlightLayer's relay list)
const relays = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
];

// Test highlights to create
// AI-NOTE: Kind 9802 highlight events contain the actual highlighted text in .content
// and optionally a user comment/annotation in the ["comment", ...] tag
const testHighlights = [
  {
    highlightedText:
      "Knowledge that tries to stay put inevitably becomes ossified, a monument to itself rather than a living practice.",
    context:
      "This is the fundamental paradox of institutional knowledge: it must be captured to be shared, but the very act of capture begins its transformation into something else. Knowledge that tries to stay put inevitably becomes ossified, a monument to itself rather than a living practice. The attempt to hold knowledge still is like trying to photograph a river—you capture an image, but you lose the flow.",
    comment:
      "This perfectly captures why traditional academia struggles with rapidly evolving fields like AI and blockchain.",
    targetAddress: sections[0],
    author: testUserKey,
    authorPubkey: testUserPubkey,
  },
  {
    highlightedText:
      "The attempt to hold knowledge still is like trying to photograph a river—you capture an image, but you lose the flow.",
    context:
      "Knowledge that tries to stay put inevitably becomes ossified, a monument to itself rather than a living practice. The attempt to hold knowledge still is like trying to photograph a river—you capture an image, but you lose the flow.",
    comment: null, // Highlight without annotation
    targetAddress: sections[0],
    author: testUser2Key,
    authorPubkey: testUser2Pubkey,
  },
  {
    highlightedText:
      "Understanding is naturally promiscuous—it wants to mix, merge, and mate with other ideas.",
    context:
      "The natural state of knowledge is not purity but promiscuity. Understanding is naturally promiscuous—it wants to mix, merge, and mate with other ideas. It crosses boundaries not despite them but because of them. The most vibrant intellectual communities have always been those at crossroads and borderlands.",
    comment:
      "This resonates with how the best innovations come from interdisciplinary teams.",
    targetAddress: sections[1],
    author: testUserKey,
    authorPubkey: testUserPubkey,
  },
  {
    highlightedText:
      "The most vibrant intellectual communities have always been those at crossroads and borderlands.",
    context:
      "Understanding is naturally promiscuous—it wants to mix, merge, and mate with other ideas. It crosses boundaries not despite them but because of them. The most vibrant intellectual communities have always been those at crossroads and borderlands.",
    comment:
      "Historical examples: Renaissance Florence, Vienna Circle, Bell Labs",
    targetAddress: sections[1],
    author: testUser2Key,
    authorPubkey: testUser2Pubkey,
  },
  {
    highlightedText:
      "institutions that try to monopolize understanding inevitably find themselves gatekeeping corpses",
    context:
      "But institutions that try to monopolize understanding inevitably find themselves gatekeeping corpses—the living knowledge has already escaped and is flourishing in unexpected places. By the time the gatekeepers notice, the game has moved.",
    comment: null,
    targetAddress: sections[2],
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
          console.log(
            `✓ Published event ${event.id.substring(0, 8)} to ${relayUrl}`,
          );
          published = true;
          ws.close();
          resolve();
        } else {
          console.error(`✗ Relay rejected event: ${message[3]}`);
          ws.close();
          reject(new Error(message[3]));
        }
      }
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error: ${error.message}`);
      reject(error);
    });

    ws.on("close", () => {
      if (!published) {
        reject(new Error("Connection closed before OK received"));
      }
    });

    // Timeout after 10 seconds
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

  const publishedEvents = [];

  for (const highlight of testHighlights) {
    try {
      // Create unsigned event
      // AI-NOTE: For kind 9802, the .content field contains the HIGHLIGHTED TEXT,
      // not a comment. User annotations go in the optional ["comment", ...] tag.
      const unsignedEvent = {
        kind: 9802,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          // Target section
          ["a", highlight.targetAddress, relays[0]],

          // Surrounding context (helps locate the highlight)
          ["context", highlight.context],

          // Original publication author
          ["p", publicationPubkey, relays[0], "author"],
        ],
        content: highlight.highlightedText, // The actual highlighted text
        pubkey: highlight.authorPubkey,
      };

      // Add optional comment/annotation if present
      if (highlight.comment) {
        unsignedEvent.tags.push(["comment", highlight.comment]);
      }

      // Sign the event
      const signedEvent = finalizeEvent(unsignedEvent, highlight.author);

      console.log(`\nCreating highlight on section:`);
      console.log(
        `  Highlighted: "${highlight.highlightedText.substring(0, 60)}..."`,
      );
      if (highlight.comment) {
        console.log(`  Comment: "${highlight.comment.substring(0, 60)}..."`);
      }
      console.log(`  Target: ${highlight.targetAddress}`);
      console.log(`  Event ID: ${signedEvent.id}`);

      // Publish to relay
      await publishEvent(signedEvent, relays[0]);
      publishedEvents.push(signedEvent);

      // Delay between publishes to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`Failed to publish highlight: ${error.message}`);
    }
  }

  console.log("\n=== Done! ===");
  console.log(`\nPublished ${publishedEvents.length} total highlights`);
  console.log("\nRefresh the page to see the highlights.");
  console.log('Toggle "Show Highlights" to view them inline.');
}

// Run it
createAndPublishHighlights().catch(console.error);
