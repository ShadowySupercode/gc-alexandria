/**
 * Utility for position-based text highlighting in the DOM
 *
 * Highlights text by character offset rather than text search,
 * making highlights resilient to minor content changes.
 */

/**
 * Get all text nodes within an element, excluding script/style tags
 */
function getTextNodes(element: HTMLElement): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip text in script/style tags
        const parent = node.parentElement;
        if (
          parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE")
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip empty text nodes
        if (!node.textContent || node.textContent.trim().length === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  return textNodes;
}

/**
 * Calculate the total text length from text nodes
 */
function getTotalTextLength(textNodes: Text[]): number {
  return textNodes.reduce(
    (total, node) => total + (node.textContent?.length || 0),
    0,
  );
}

/**
 * Find text node and local offset for a given global character position
 */
function findNodeAtOffset(
  textNodes: Text[],
  globalOffset: number,
): { node: Text; localOffset: number } | null {
  let currentOffset = 0;

  for (const node of textNodes) {
    const nodeLength = node.textContent?.length || 0;

    if (globalOffset < currentOffset + nodeLength) {
      return {
        node,
        localOffset: globalOffset - currentOffset,
      };
    }

    currentOffset += nodeLength;
  }

  return null;
}

/**
 * Highlight text by character offset within a container element
 *
 * @param container - The root element to search within
 * @param startOffset - Character position where highlight starts (0-indexed)
 * @param endOffset - Character position where highlight ends (exclusive)
 * @param color - Background color for the highlight
 * @returns true if highlight was applied, false otherwise
 */
export function highlightByOffset(
  container: HTMLElement,
  startOffset: number,
  endOffset: number,
  color: string,
): boolean {
  console.log(
    `[highlightByOffset] Attempting to highlight chars ${startOffset}-${endOffset}`,
  );

  // Validate inputs
  if (startOffset < 0 || endOffset <= startOffset) {
    console.warn(
      `[highlightByOffset] Invalid offsets: ${startOffset}-${endOffset}`,
    );
    return false;
  }

  // Get all text nodes
  const textNodes = getTextNodes(container);
  if (textNodes.length === 0) {
    console.warn(`[highlightByOffset] No text nodes found in container`);
    return false;
  }

  const totalLength = getTotalTextLength(textNodes);
  console.log(
    `[highlightByOffset] Total text length: ${totalLength}, nodes: ${textNodes.length}`,
  );

  // Validate offsets are within bounds
  if (startOffset >= totalLength) {
    console.warn(
      `[highlightByOffset] Start offset ${startOffset} exceeds total length ${totalLength}`,
    );
    return false;
  }

  // Adjust end offset if it exceeds content
  const adjustedEndOffset = Math.min(endOffset, totalLength);

  // Find the nodes containing start and end positions
  const startPos = findNodeAtOffset(textNodes, startOffset);
  const endPos = findNodeAtOffset(textNodes, adjustedEndOffset);

  if (!startPos || !endPos) {
    console.warn(`[highlightByOffset] Could not locate positions in DOM`);
    return false;
  }

  console.log(`[highlightByOffset] Found positions:`, {
    startNode: startPos.node.textContent?.substring(0, 20),
    startLocal: startPos.localOffset,
    endNode: endPos.node.textContent?.substring(0, 20),
    endLocal: endPos.localOffset,
  });

  // Create the highlight mark element
  const createHighlightMark = (text: string): HTMLElement => {
    const mark = document.createElement("mark");
    mark.className = "highlight";
    mark.style.backgroundColor = color;
    mark.style.borderRadius = "2px";
    mark.style.padding = "2px 0";
    mark.textContent = text;
    return mark;
  };

  try {
    // Case 1: Highlight is within a single text node
    if (startPos.node === endPos.node) {
      const text = startPos.node.textContent || "";
      const before = text.substring(0, startPos.localOffset);
      const highlighted = text.substring(
        startPos.localOffset,
        endPos.localOffset,
      );
      const after = text.substring(endPos.localOffset);

      const parent = startPos.node.parentNode;
      if (!parent) return false;

      // Create fragment with before + highlight + after
      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      fragment.appendChild(createHighlightMark(highlighted));
      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, startPos.node);
      console.log(
        `[highlightByOffset] Applied single-node highlight: "${highlighted}"`,
      );
      return true;
    }

    // Case 2: Highlight spans multiple text nodes
    let currentNode: Text | null = startPos.node;
    let isFirstNode = true;
    let nodeIndex = textNodes.indexOf(currentNode);

    while (currentNode && nodeIndex <= textNodes.indexOf(endPos.node)) {
      const parent = currentNode.parentNode;
      if (!parent) break;

      const text = currentNode.textContent || "";
      let fragment = document.createDocumentFragment();

      if (isFirstNode) {
        // First node: split at start offset
        const before = text.substring(0, startPos.localOffset);
        const highlighted = text.substring(startPos.localOffset);

        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(createHighlightMark(highlighted));
        isFirstNode = false;
      } else if (currentNode === endPos.node) {
        // Last node: split at end offset
        const highlighted = text.substring(0, endPos.localOffset);
        const after = text.substring(endPos.localOffset);

        fragment.appendChild(createHighlightMark(highlighted));
        if (after) fragment.appendChild(document.createTextNode(after));
      } else {
        // Middle node: highlight entirely
        fragment.appendChild(createHighlightMark(text));
      }

      parent.replaceChild(fragment, currentNode);

      nodeIndex++;
      currentNode = textNodes[nodeIndex] || null;
    }

    console.log(`[highlightByOffset] Applied multi-node highlight`);
    return true;
  } catch (err) {
    console.error(`[highlightByOffset] Error applying highlight:`, err);
    return false;
  }
}

/**
 * Get the plain text content of an element (without HTML tags)
 * Useful for debugging and validation
 */
export function getPlainText(element: HTMLElement): string {
  const textNodes = getTextNodes(element);
  return textNodes.map((node) => node.textContent).join("");
}

/**
 * Get the character count of visible text in an element
 */
export function getTextLength(element: HTMLElement): number {
  return getPlainText(element).length;
}
