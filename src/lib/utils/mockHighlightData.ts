/**
 * Generate mock highlight data (kind 9802) for testing highlight UI
 * Creates realistic highlight events with context and optional annotations
 */

// Sample highlighted text snippets (things users might actually highlight)
const highlightedTexts = [
  'Knowledge that tries to stay put inevitably becomes ossified',
  'The attempt to hold knowledge still is like trying to photograph a river',
  'Understanding emerges not from rigid frameworks but from fluid engagement',
  'Traditional institutions struggle with the natural promiscuity of ideas',
  'Thinking without permission means refusing predetermined categories',
  'The most valuable insights often come from unexpected juxtapositions',
  'Anarchistic knowledge rejects the notion of authorized interpreters',
  'Every act of reading is an act of creative interpretation',
  'Hierarchy in knowledge systems serves power, not understanding',
  'The boundary between creator and consumer is an artificial construction',
];

// Context strings (surrounding text to help locate the highlight)
const contexts = [
  'This is the fundamental paradox of institutionalized knowledge. Knowledge that tries to stay put inevitably becomes ossified, a monument to itself rather than a living practice.',
  'The attempt to hold knowledge still is like trying to photograph a river—you capture an image, but you lose the flow. What remains is a static representation, not the dynamic reality.',
  'Understanding emerges not from rigid frameworks but from fluid engagement with ideas, people, and contexts. This fluidity is precisely what traditional systems attempt to eliminate.',
  'Traditional institutions struggle with the natural promiscuity of ideas—the way concepts naturally migrate, mutate, and merge across boundaries that were meant to contain them.',
  'Thinking without permission means refusing predetermined categories and challenging the gatekeepers who claim authority over legitimate thought.',
  'The most valuable insights often come from unexpected juxtapositions, from bringing together ideas that were never meant to meet.',
  'Anarchistic knowledge rejects the notion of authorized interpreters, asserting instead that meaning-making is a fundamentally distributed and democratic process.',
  'Every act of reading is an act of creative interpretation, a collaboration between text and reader that produces something new each time.',
  'Hierarchy in knowledge systems serves power, not understanding. It determines who gets to speak, who must listen, and what counts as legitimate knowledge.',
  'The boundary between creator and consumer is an artificial construction, one that digital networks make increasingly untenable and obsolete.',
];

// Optional annotations (user comments on their highlights)
const annotations = [
  'This perfectly captures the institutional problem',
  'Key insight - worth revisiting',
  'Reminds me of Deleuze on rhizomatic structures',
  'Fundamental critique of academic gatekeeping',
  'The core argument in one sentence',
  null, // Some highlights have no annotation
  'Important for understanding the broader thesis',
  null,
  'Connects to earlier discussion on page 12',
  null,
];

// Mock pubkeys - MUST be exactly 64 hex characters
const mockPubkeys = [
  'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
  'b2c3d4e5f67890123456789012345678901234567890123456789012345678ab',
  'c3d4e5f67890123456789012345678901234567890123456789012345678abcd',
  'd4e5f67890123456789012345678901234567890123456789012345678abcdef',
  'e5f6789012345678901234567890123456789012345678901234567890abcdef',
];

/**
 * Create a mock highlight event (kind 9802)
 *
 * AI-NOTE: Unlike comments (kind 1111), highlights have:
 * - content field = the highlighted text itself (NOT a user comment)
 * - ["context", ...] tag with surrounding text to help locate the highlight
 * - Optional ["comment", ...] tag for user annotations
 * - Optional ["offset", start, end] tag for position-based highlighting
 * - Single lowercase ["a", targetAddress] tag (not uppercase/lowercase pairs)
 */
function createMockHighlight(
  id: string,
  highlightedText: string,
  context: string,
  targetAddress: string,
  pubkey: string,
  createdAt: number,
  authorPubkey: string,
  annotation?: string | null,
  offsetStart?: number,
  offsetEnd?: number
): any {
  const tags: string[][] = [
    ['a', targetAddress, 'wss://relay.damus.io'],
    ['context', context],
    ['p', authorPubkey, 'wss://relay.damus.io', 'author'],
  ];

  // Add optional annotation
  if (annotation) {
    tags.push(['comment', annotation]);
  }

  // Add optional offset for position-based highlighting
  if (offsetStart !== undefined && offsetEnd !== undefined) {
    tags.push(['offset', offsetStart.toString(), offsetEnd.toString()]);
  }

  return {
    id,
    kind: 9802,
    pubkey,
    created_at: createdAt,
    content: highlightedText, // The highlighted text itself
    tags,
    sig: 'mock-signature-' + id,
  };
}

/**
 * Generate mock highlights for a section
 * @param sectionAddress - The section address to attach highlights to
 * @param authorPubkey - The author's pubkey (for the "p" tag)
 * @param numHighlights - Number of highlights to generate (default: 3-5 random)
 * @returns Array of mock highlight objects
 */
export function generateMockHighlights(
  sectionAddress: string,
  authorPubkey: string,
  numHighlights: number = Math.floor(Math.random() * 2) + 2 // 2-3 highlights
): any[] {
  const highlights: any[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Generate position-based highlights at the beginning of each section
  // For test mode, we use simple placeholder text and rely on offset-based highlighting
  // The offset tags will highlight the ACTUAL text at those positions in the section

  for (let i = 0; i < numHighlights; i++) {
    const id = `mock-highlight-${i}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const highlighterPubkey = mockPubkeys[i % mockPubkeys.length];
    const annotation = annotations[i % annotations.length];
    const createdAt = now - (numHighlights - i) * 7200; // Stagger by 2 hours

    // Create sequential highlights at the beginning of the section
    // Each highlight is exactly 100 characters
    const highlightLength = 100;
    const offsetStart = i * 120; // Space between highlights (120 chars apart)
    const offsetEnd = offsetStart + highlightLength;

    // Use placeholder text - the actual highlighted text will be determined by the offsets
    const placeholderText = `Test highlight ${i + 1}`;
    const placeholderContext = `This is test highlight ${i + 1} at position ${offsetStart}-${offsetEnd}`;

    const highlight = createMockHighlight(
      id,
      placeholderText,
      placeholderContext,
      sectionAddress,
      highlighterPubkey,
      createdAt,
      authorPubkey,
      annotation,
      offsetStart,
      offsetEnd
    );

    highlights.push(highlight);
  }

  return highlights;
}

/**
 * Generate mock highlights for multiple sections
 * @param sectionAddresses - Array of section addresses
 * @param authorPubkey - The publication author's pubkey
 * @returns Array of all mock highlights across all sections
 */
export function generateMockHighlightsForSections(
  sectionAddresses: string[],
  authorPubkey: string = 'dc4cd086cd7ce5b1832adf4fdd1211289880d2c7e295bcb0e684c01acee77c06'
): any[] {
  const allHighlights: any[] = [];

  sectionAddresses.forEach((address, index) => {
    // Each section gets 2 highlights at the very beginning (positions 0-100 and 120-220)
    const numHighlights = 2;
    const sectionHighlights = generateMockHighlights(address, authorPubkey, numHighlights);
    console.log(`[MockHighlightData] Generated ${numHighlights} highlights for section ${address.split(':')[2]?.substring(0, 20)}... at positions 0-100, 120-220`);
    allHighlights.push(...sectionHighlights);
  });

  console.log(`[MockHighlightData] Total: ${allHighlights.length} highlights across ${sectionAddresses.length} sections`);
  console.log(`[MockHighlightData] Each highlight is anchored to its section via "a" tag and uses offset tags for position`);
  return allHighlights;
}
