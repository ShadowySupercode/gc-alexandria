import type NDK from "@nostr-dev-kit/ndk";
import type { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";
import { Lazy } from "./lazy";

enum PublicationTreeNodeType {
  Root,
  Branch,
  Leaf,
}

interface PublicationTreeNode {
  type: PublicationTreeNodeType;
  address: string;
  parent?: PublicationTreeNode;
  children?: Array<Lazy<PublicationTreeNode>>;
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
   * A map of addresses in the tree to their corresponding lazy-loaded nodes. When a lazy node is
   * retrieved, it is added to the {@link PublicationTree.nodes} map.
   */
  private lazyNodes: Map<string, Lazy<PublicationTreeNode>> = new Map();

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
    const rootAddress = rootEvent.tagAddress();
    this.root = {
      type: PublicationTreeNodeType.Root,
      address: rootAddress,
      children: [],
    };

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
    const address = event.tagAddress();
    const parentAddress = parentEvent.tagAddress();
    const parentNode = this.nodes.get(parentAddress);

    if (!parentNode) {
      throw new Error(
        `PublicationTree: Parent node with address ${parentAddress} not found.`
      );
    }

    const node = {
      type: this.getNodeType(event),
      address,
      parent: parentNode,
      children: [],
    };
    parentNode.children!.push(new Lazy<PublicationTreeNode>(() => Promise.resolve(node)));
    this.nodes.set(address, node);
    this.events.set(address, event);
  }

  /**
   * Lazily adds an event to the publication tree by address if the full event is not already
   * loaded into memory.
   * @param address The address of the event to add.
   * @param parentEvent The parent event of the event to add.
   * @description The parent event must already be in the tree. Use
   * {@link PublicationTree.getEvent} to retrieve an event already in the tree.
   */
  addEventByAddress(address: string, parentEvent: NDKEvent) {
    const parentAddress = parentEvent.tagAddress();
    const parentNode = this.nodes.get(parentAddress);

    if (!parentNode) {
      throw new Error(
        `PublicationTree: Parent node with address ${parentAddress} not found.`
      );
    }

    const lazyNode = new Lazy<PublicationTreeNode>(async () => {
      const [kind, pubkey, dTag] = address.split(':');
      const event = await this.ndk.fetchEvent({
        kinds: [parseInt(kind)],
        authors: [pubkey],
        '#d': [dTag],
      });

      if (!event) {
        throw new Error(
          `PublicationTree: Event with address ${address} not found.`
        );
      }

      const node: PublicationTreeNode = {
        type: this.getNodeType(event),
        address,
        parent: parentNode,
        children: [],
      };

      this.nodes.set(address, node);
      this.events.set(address, event);

      return node;
    });

    parentNode.children!.push(lazyNode);
    this.lazyNodes.set(address, lazyNode);
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
      this.bookmark = firstLeafEvent!.tagAddress();
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

      for (const childAddress of currentChildAddresses) {
        if (this.nodes.has(childAddress)) {
          continue;
        }

        this.addEventByAddress(childAddress, currentEvent!);
      }

      // If the current event has no children, it is a leaf.
      if (currentChildAddresses.length === 0) {
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
      const siblings: Lazy<PublicationTreeNode>[] = parent!.children!;
      const currentIndex = siblings.findIndex(async sibling => (await sibling.value()).address === currentNode!.address);
      nextSibling = (await siblings.at(currentIndex + 1)?.value()) ?? null;

      // If the next sibling has children, it is not a leaf.
      if ((nextSibling?.children?.length ?? 0) > 0) {
        currentNode = (await nextSibling!.children!.at(0)!.value())!;
        parent = currentNode.parent;
        nextSibling = null;
      }
    } while (nextSibling == null);

    return this.getEvent(nextSibling!.address);
  }

  private getNodeType(event: NDKEvent): PublicationTreeNodeType {
    const address = event.tagAddress();
    const node = this.nodes.get(address);
    if (!node) {
      throw new Error(
        `PublicationTree: Event with address ${address} not found in the tree.`
      );
    }

    if (!node.parent) {
      return PublicationTreeNodeType.Root;
    }

    if (event.tags.some(tag => tag[0] === 'a')) {
      return PublicationTreeNodeType.Branch;
    }

    return PublicationTreeNodeType.Leaf;
  }

  // #endregion

  // #region Iteration Cursor

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

    async moveToFirstChild(): Promise<boolean> {
      if (!this.currentNode) {
        throw new Error("Cursor: Current node is null or undefined.");
      }

      const hasChildren = (this.currentNode.children?.length ?? 0) > 0;
      const isLeaf = this.tree.leaves.includes(this.currentNode.address);

      if (!hasChildren && isLeaf) {
        return false;
      }

      if (!hasChildren && !isLeaf) {
        // TODO: Fetch any missing children, then return the first child.
      }

      this.currentNode = (await this.currentNode.children?.at(0)?.value())!;
      return true;
    }

    async moveToNextSibling(): Promise<boolean> {
      if (!this.currentNode) {
        throw new Error("Cursor: Current node is null or undefined.");
      }

      const parent = this.currentNode.parent;
      const siblings = parent?.children;
      const currentIndex = siblings?.findIndex(async sibling =>
        (await sibling.value()).address === this.currentNode!.address
      );

      const nextSibling = (await siblings?.at(currentIndex! + 1)?.value()) ?? null;
      if (!nextSibling) {
        return false;
      }

      this.currentNode = nextSibling;
      return true;
    }

    moveToParent(): boolean {
      if (!this.currentNode) {
        throw new Error("Cursor: Current node is null or undefined.");
      }

      const parent = this.currentNode.parent;
      if (!parent) {
        return false;
      }

      this.currentNode = parent;
      return true;
    }
  };

  // #endregion
}