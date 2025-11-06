import { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";

/**
 * Generate mock comment data for testing comment UI and threading
 * Creates realistic thread structures with root comments and nested replies
 */

const loremIpsumComments = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.",
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.",
  "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit.",
  "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti.",
  "Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio.",
  "Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae.",
];

const loremIpsumReplies = [
  "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.",
  "Vel illum qui dolorem eum fugiat quo voluptas nulla pariatur.",
  "Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat.",
  "Omnis voluptas assumenda est, omnis dolor repellendus.",
  "Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur.",
  "Facere possimus, omnis voluptas assumenda est.",
  "Sed ut perspiciatis unde omnis iste natus error.",
  "Accusantium doloremque laudantium, totam rem aperiam.",
];

const mockPubkeys = [
  "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
  "b2c3d4e5f6789012345678901234567890123456789012345678901234abcde",
  "c3d4e5f6789012345678901234567890123456789012345678901234abcdef0",
  "d4e5f6789012345678901234567890123456789012345678901234abcdef01",
];

/**
 * Create a mock NDKEvent that looks like a real comment
 */
function createMockComment(
  id: string,
  content: string,
  pubkey: string,
  targetAddress: string,
  createdAt: number,
  replyToId?: string,
  replyToAuthor?: string
): any {
  const tags: string[][] = [
    ["A", targetAddress, "wss://relay.damus.io", pubkey],
    ["K", "30041"],
    ["P", pubkey, "wss://relay.damus.io"],
    ["a", targetAddress, "wss://relay.damus.io"],
    ["k", "30041"],
    ["p", pubkey, "wss://relay.damus.io"],
  ];

  if (replyToId && replyToAuthor) {
    tags.push(["e", replyToId, "wss://relay.damus.io", "reply"]);
    tags.push(["p", replyToAuthor, "wss://relay.damus.io"]);
  }

  // Return a plain object that matches NDKEvent structure
  return {
    id,
    kind: 1111,
    pubkey,
    created_at: createdAt,
    content,
    tags,
    sig: "mock-signature-" + id,
  };
}

/**
 * Generate mock comment thread structure
 * @param sectionAddress - The section address to attach comments to
 * @param numRootComments - Number of root comments to generate (default: 3)
 * @param numRepliesPerThread - Number of replies per thread (default: 2)
 * @returns Array of mock comment objects
 */
export function generateMockComments(
  sectionAddress: string,
  numRootComments: number = 3,
  numRepliesPerThread: number = 2
): any[] {
  const comments: any[] = [];
  const now = Math.floor(Date.now() / 1000);
  let commentIndex = 0;

  // Generate root comments
  for (let i = 0; i < numRootComments; i++) {
    const rootId = `mock-root-${i}-${Date.now()}`;
    const rootPubkey = mockPubkeys[i % mockPubkeys.length];
    const rootContent = loremIpsumComments[i % loremIpsumComments.length];
    const rootCreatedAt = now - (numRootComments - i) * 3600; // Stagger by hours

    const rootComment = createMockComment(
      rootId,
      rootContent,
      rootPubkey,
      sectionAddress,
      rootCreatedAt
    );

    comments.push(rootComment);

    // Generate replies to this root comment
    for (let j = 0; j < numRepliesPerThread; j++) {
      const replyId = `mock-reply-${i}-${j}-${Date.now()}`;
      const replyPubkey = mockPubkeys[(i + j + 1) % mockPubkeys.length];
      const replyContent = loremIpsumReplies[commentIndex % loremIpsumReplies.length];
      const replyCreatedAt = rootCreatedAt + (j + 1) * 1800; // 30 min after each

      const reply = createMockComment(
        replyId,
        replyContent,
        replyPubkey,
        sectionAddress,
        replyCreatedAt,
        rootId,
        rootPubkey
      );

      comments.push(reply);

      // Optionally add a nested reply (reply to reply)
      if (j === 0 && i < 2) {
        const nestedId = `mock-nested-${i}-${j}-${Date.now()}`;
        const nestedPubkey = mockPubkeys[(i + j + 2) % mockPubkeys.length];
        const nestedContent = loremIpsumReplies[(commentIndex + 1) % loremIpsumReplies.length];
        const nestedCreatedAt = replyCreatedAt + 900; // 15 min after reply

        const nested = createMockComment(
          nestedId,
          nestedContent,
          nestedPubkey,
          sectionAddress,
          nestedCreatedAt,
          replyId,
          replyPubkey
        );

        comments.push(nested);
      }

      commentIndex++;
    }
  }

  return comments;
}

/**
 * Generate mock comments for multiple sections
 * @param sectionAddresses - Array of section addresses
 * @returns Array of all mock comments across all sections
 */
export function generateMockCommentsForSections(
  sectionAddresses: string[]
): any[] {
  const allComments: any[] = [];

  sectionAddresses.forEach((address, index) => {
    // Vary the number of comments per section
    const numRoot = 2 + (index % 3); // 2-4 root comments
    const numReplies = 1 + (index % 2); // 1-2 replies per thread

    const sectionComments = generateMockComments(address, numRoot, numReplies);
    allComments.push(...sectionComments);
  });

  return allComments;
}
