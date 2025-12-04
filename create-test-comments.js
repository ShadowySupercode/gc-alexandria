import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import WebSocket from 'ws';

// Test user keys (generate fresh ones)
const testUserKey = generateSecretKey();
const testUserPubkey = getPublicKey(testUserKey);

const testUser2Key = generateSecretKey();
const testUser2Pubkey = getPublicKey(testUser2Key);

console.log('Test User 1 pubkey:', testUserPubkey);
console.log('Test User 2 pubkey:', testUser2Pubkey);

// The publication details from the article (REAL VALUES)
const publicationPubkey = 'dc4cd086cd7ce5b1832adf4fdd1211289880d2c7e295bcb0e684c01acee77c06';
const rootAddress = `30040:${publicationPubkey}:anarchistic-knowledge-the-art-of-thinking-without-permission`;

// Section addresses (from the actual publication structure)
const sections = [
  `30041:${publicationPubkey}:the-art-of-thinking-without-permission`,
  `30041:${publicationPubkey}:the-natural-promiscuity-of-understanding`,
  `30041:${publicationPubkey}:institutional-capture-and-knowledge-enclosure`,
  `30041:${publicationPubkey}:the-persistent-escape-of-knowledge`,
];

// Relays to publish to (matching CommentLayer's relay list)
const relays = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

// Test comments to create
const testComments = [
  {
    content: 'This is a fascinating exploration of how knowledge naturally resists institutional capture. The analogy to flowing water is particularly apt.',
    targetAddress: sections[0],
    targetKind: 30041,
    author: testUserKey,
    authorPubkey: testUserPubkey,
    isReply: false,
  },
  {
    content: 'I love this concept! It reminds me of how open source projects naturally organize without top-down control.',
    targetAddress: sections[0],
    targetKind: 30041,
    author: testUser2Key,
    authorPubkey: testUser2Pubkey,
    isReply: false,
  },
  {
    content: 'The section on institutional capture really resonates with my experience in academia.',
    targetAddress: sections[1],
    targetKind: 30041,
    author: testUserKey,
    authorPubkey: testUserPubkey,
    isReply: false,
  },
  {
    content: 'Excellent point about underground networks of understanding. This is exactly how most practical knowledge develops.',
    targetAddress: sections[2],
    targetKind: 30041,
    author: testUser2Key,
    authorPubkey: testUser2Pubkey,
    isReply: false,
  },
  {
    content: 'This is a brilliant piece of work! Really captures the tension between institutional knowledge and living understanding.',
    targetAddress: rootAddress,
    targetKind: 30040,
    author: testUserKey,
    authorPubkey: testUserPubkey,
    isReply: false,
  },
];

async function publishEvent(event, relayUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    let published = false;

    ws.on('open', () => {
      console.log(`Connected to ${relayUrl}`);
      ws.send(JSON.stringify(['EVENT', event]));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message[0] === 'OK' && message[1] === event.id) {
        if (message[2]) {
          console.log(`✓ Published event ${event.id.substring(0, 8)} to ${relayUrl}`);
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

    ws.on('error', (error) => {
      console.error(`WebSocket error: ${error.message}`);
      reject(error);
    });

    ws.on('close', () => {
      if (!published) {
        reject(new Error('Connection closed before OK received'));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!published) {
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

async function createAndPublishComments() {
  console.log('\n=== Creating Test Comments ===\n');

  const publishedEvents = [];

  for (const comment of testComments) {
    try {
      // Create unsigned event
      const unsignedEvent = {
        kind: 1111,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          // Root scope - uppercase tags
          ['A', comment.targetAddress, relays[0], publicationPubkey],
          ['K', comment.targetKind.toString()],
          ['P', publicationPubkey, relays[0]],

          // Parent scope - lowercase tags
          ['a', comment.targetAddress, relays[0]],
          ['k', comment.targetKind.toString()],
          ['p', publicationPubkey, relays[0]],
        ],
        content: comment.content,
        pubkey: comment.authorPubkey,
      };

      // If this is a reply, add reply tags
      if (comment.isReply && comment.replyToId) {
        unsignedEvent.tags.push(['e', comment.replyToId, relay, 'reply']);
        unsignedEvent.tags.push(['p', comment.replyToAuthor, relay]);
      }

      // Sign the event
      const signedEvent = finalizeEvent(unsignedEvent, comment.author);

      console.log(`\nCreating comment on ${comment.targetKind === 30040 ? 'collection' : 'section'}:`);
      console.log(`  Content: "${comment.content.substring(0, 60)}..."`);
      console.log(`  Target: ${comment.targetAddress}`);
      console.log(`  Event ID: ${signedEvent.id}`);

      // Publish to relay
      await publishEvent(signedEvent, relays[0]);
      publishedEvents.push(signedEvent);

      // Store event ID for potential replies
      comment.eventId = signedEvent.id;

      // Delay between publishes to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`Failed to publish comment: ${error.message}`);
    }
  }

  // Now create some threaded replies
  console.log('\n=== Creating Threaded Replies ===\n');

  const replies = [
    {
      content: 'Absolutely agree! The metaphor extends even further when you consider how ideas naturally branch and merge.',
      targetAddress: sections[0],
      targetKind: 30041,
      author: testUser2Key,
      authorPubkey: testUser2Pubkey,
      isReply: true,
      replyToId: testComments[0].eventId,
      replyToAuthor: testComments[0].authorPubkey,
    },
    {
      content: 'Great connection! The parallel between open source governance and knowledge commons is really illuminating.',
      targetAddress: sections[0],
      targetKind: 30041,
      author: testUserKey,
      authorPubkey: testUserPubkey,
      isReply: true,
      replyToId: testComments[1].eventId,
      replyToAuthor: testComments[1].authorPubkey,
    },
  ];

  for (const reply of replies) {
    try {
      const unsignedEvent = {
        kind: 1111,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          // Root scope
          ['A', reply.targetAddress, relays[0], publicationPubkey],
          ['K', reply.targetKind.toString()],
          ['P', publicationPubkey, relays[0]],

          // Parent scope (points to the comment we're replying to)
          ['a', reply.targetAddress, relays[0]],
          ['k', reply.targetKind.toString()],
          ['p', reply.replyToAuthor, relays[0]],

          // Reply markers
          ['e', reply.replyToId, relays[0], 'reply'],
        ],
        content: reply.content,
        pubkey: reply.authorPubkey,
      };

      const signedEvent = finalizeEvent(unsignedEvent, reply.author);

      console.log(`\nCreating reply:`);
      console.log(`  Content: "${reply.content.substring(0, 60)}..."`);
      console.log(`  Reply to: ${reply.replyToId.substring(0, 8)}`);
      console.log(`  Event ID: ${signedEvent.id}`);

      await publishEvent(signedEvent, relays[0]);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Longer delay to avoid rate limiting

    } catch (error) {
      console.error(`Failed to publish reply: ${error.message}`);
    }
  }

  console.log('\n=== Done! ===');
  console.log(`\nPublished ${publishedEvents.length + replies.length} total comments/replies`);
  console.log('\nRefresh the page to see the comments in the Comment Panel.');
}

// Run it
createAndPublishComments().catch(console.error);
