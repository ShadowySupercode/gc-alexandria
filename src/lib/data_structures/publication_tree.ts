import type NDK from "@nostr-dev-kit/ndk";
import type { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";

interface PublicationTreeNode {
  address: string;
  parent?: PublicationTreeNode;
  children?: PublicationTreeNode[];
}

export class PublicationTree implements AsyncIterable<NDKEvent> {
  /**
   * The root node of the tree.
   */
  private root: PublicationTreeNode;

  /**
   * A map of addresses in the tree to their corresponding nodes.
   */
  private nodes: Map<string, PublicationTreeNode>;

  /**
   * A map of addresses in the tree to their corresponding events.
   */
  private events: Map<string, NDKEvent>;

  /**
   * An ordered list of the addresses of the leaves of the tree.
   */
  private leaves: string[] = [];

  /**
   * The address of the last-visited node.  Used for iteration and progressive retrieval.
   */
  private bookmark?: string;

  /**
   * The NDK instance used to fetch events.
   */
  private ndk: NDK;

  constructor(rootEvent: NDKEvent, ndk: NDK) {
    const rootAddress = this.getAddressFromEvent(rootEvent);
    this.root = { address: rootAddress, children: [] };

    this.nodes = new Map<string, PublicationTreeNode>();
    this.nodes.set(rootAddress, this.root);

    this.events = new Map<string, NDKEvent>();
    this.events.set(rootAddress, rootEvent);

    this.ndk = ndk;
  }

  /**
   * Adds an event to the publication tree.
   * @param event The event to be added.
   * @param parentEvent The parent event of the event to be added.
   * @throws An error if the parent event is not in the tree.
   * @description The parent event must already be in the tree. Use
   * {@link PublicationTree.getEvent} to retrieve an event already in the tree.
   */
  addEvent(event: NDKEvent, parentEvent: NDKEvent) {
    const address = this.getAddressFromEvent(event);
    const parentAddress = this.getAddressFromEvent(parentEvent);
    const parentNode = this.nodes.get(parentAddress);

    if (!parentNode) {
      throw new Error(
        `PublicationTree: Parent node with address ${parentAddress} not found.`
      );
    }

    const node = {
      address,
      parent: parentNode,
      children: [],
    };
    parentNode.children!.push(node);
    this.nodes.set(address, node);
    this.events.set(address, event);
  }

  /**
   * Retrieves an event from the publication tree.
   * @param address The address of the event to retrieve.
   * @returns The event, or null if the event is not found.
   */
  async getEvent(address: string): Promise<NDKEvent | null> {
    let event = this.events.get(address) ?? null;
    if (!event) {
      event = await this.depthFirstRetrieve(address);
    }

    return event;
  }

  /**
   * Sets a start point for iteration over the leaves of the tree.
   * @param address The address of the event to bookmark.
   */
  setBookmark(address: string) {
    this.bookmark = address;
  }

  [Symbol.asyncIterator](): AsyncIterator<NDKEvent> {
    return this;
  }

  async next(): Promise<IteratorResult<NDKEvent>> {
    // If no bookmark is set, start at the first leaf.  Retrieve that first leaf if necessary.
    if (!this.bookmark) {
      this.bookmark = this.leaves.at(0);
      if (this.bookmark) {
        const bookmarkEvent = await this.getEvent(this.bookmark);
        return { done: false, value: bookmarkEvent! };
      }

      const firstLeafEvent = await this.depthFirstRetrieve();
      this.bookmark = this.getAddressFromEvent(firstLeafEvent!);
      return { done: false, value: firstLeafEvent! };
    }

    // TODO: Invoke a funciton to retrieve the next sibling of the bookmark.

    return { done: true, value: null };
  }

  // #region Private Methods

  /**
   * Traverses the publication tree in a depth-first manner to retrieve an event, filling in
   * missing nodes during the traversal.
   * @param address The address of the event to retrieve. If no address is provided, the function
   * will return the first leaf in the tree.
   * @returns The event, or null if the event is not found.
   */
  private async depthFirstRetrieve(address?: string): Promise<NDKEvent | null> {
    if (address && this.nodes.has(address)) {
      return this.events.get(address)!;
    }

    const stack: string[] = [this.root.address];
    let currentEvent: NDKEvent | null | undefined;
    while (stack.length > 0) {
      const currentAddress = stack.pop();

      // Stop immediately if the target of the search is found.
      if (address != null && currentAddress === address) {
        return this.events.get(address)!;
      }

      // Augment the tree with the children of the current event.
      const currentChildAddresses = this.events
        .get(currentAddress!)!.tags
        .filter(tag => tag[0] === 'a')
        .map(tag => tag[1]);

      const kinds = new Set<number>();
      const pubkeys = new Set<string>();
      const dTags = new Set<string>();
      for (const childAddress of currentChildAddresses) {
        if (this.nodes.has(childAddress)) {
          continue;
        }
        
        const [kind, pubkey, dTag] = childAddress.split(':');
        kinds.add(parseInt(kind));
        pubkeys.add(pubkey);
        dTags.add(dTag);
      }

      const childEvents = await this.ndk.fetchEvents({
        kinds: Array.from(kinds),
        authors: Array.from(pubkeys),
        '#d': Array.from(dTags),
      });

      for (const childEvent of childEvents) {
        this.addEvent(childEvent, currentEvent!);
      }

      // If the current event has no children, it is a leaf.
      if (childEvents.size === 0) {
        this.leaves.push(currentAddress!);

        // Return the first leaf if no address was provided.
        if (address == null) {
          return currentEvent!;
        }

        continue;
      }

      // Push the popped address's children onto the stack for the next iteration.
      while (currentChildAddresses.length > 0) {
        stack.push(currentChildAddresses.pop()!);
      }
    }

    return null;
  }

  private async getNextSibling(address: string): Promise<NDKEvent | null> {
    if (!this.leaves.includes(address)) {
      throw new Error(
        `PublicationTree: Address ${address} is not a leaf. Cannot retrieve next sibling.`
      );
    }

    let currentNode = this.nodes.get(address);
    if (!currentNode) {
      return null;
    }

    let parent = currentNode.parent;
    if (!parent) {
      throw new Error(
        `PublicationTree: Address ${address} has no parent. Cannot retrieve next sibling.`
      );
    }

    // TODO: Handle the case where the current node is the last leaf.

    let nextSibling: PublicationTreeNode | null = null;
    do {
      const siblings: PublicationTreeNode[] = parent!.children!;
      const currentIndex = siblings.findIndex(sibling => sibling.address === currentNode!.address);
      nextSibling = siblings.at(currentIndex + 1) ?? null;

      // If the next sibling has children, it is not a leaf.
      if ((nextSibling?.children?.length ?? 0) > 0) {
        currentNode = nextSibling!.children!.at(0)!;
        parent = currentNode.parent;
        nextSibling = null;
      }
    } while (nextSibling == null);

    return this.getEvent(nextSibling!.address);
  }

  private getAddressFromEvent(event: NDKEvent): string {
    if (event.kind! < 30000 || event.kind! >= 40000) {
      throw new Error(
        "PublicationTree: Invalid event kind. Event kind must be in the range 30000-39999"
      );
    }

    return `${event.kind}:${event.pubkey}:${event.dTag}`;
  }

  // #endregion

  // #region Iteration Cursor

  // TODO: Flesh out this class.
  Cursor = class {
    private tree: PublicationTree;
    private currentNode: PublicationTreeNode | null | undefined;

    constructor(tree: PublicationTree, currentNode: PublicationTreeNode | null = null) {
      this.tree = tree;
      
      if (!currentNode) {
        this.currentNode = this.tree.bookmark
          ? this.tree.nodes.get(this.tree.bookmark)
          : null;
      }
    }

    firstChild(): PublicationTreeNode | null {

    }

    nextSibling(): PublicationTreeNode | null {

    }

    parent(): PublicationTreeNode | null {

    }
  };

  // #endregion
}