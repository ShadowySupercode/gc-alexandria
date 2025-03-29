import type NDK from "@nostr-dev-kit/ndk";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { Lazy } from "./lazy.ts";
import { findIndexAsync as _findIndexAsync } from '../utils.ts';

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
  #root: PublicationTreeNode;

  /**
   * A map of addresses in the tree to their corresponding nodes.
   */
  #nodes: Map<string, Lazy<PublicationTreeNode>>;

  /**
   * A map of addresses in the tree to their corresponding events.
   */
  #events: Map<string, NDKEvent>;

  /**
   * An ordered list of the addresses of the leaves of the tree.
   */
  #leaves: string[] = [];

  /**
   * The address of the last-visited node.  Used for iteration and progressive retrieval.
   */
  #bookmark?: string;

  /**
   * The NDK instance used to fetch events.
   */
  #ndk: NDK;

  constructor(rootEvent: NDKEvent, ndk: NDK) {
    const rootAddress = rootEvent.tagAddress();
    this.#root = {
      type: PublicationTreeNodeType.Root,
      address: rootAddress,
      children: [],
    };

    this.#nodes = new Map<string, Lazy<PublicationTreeNode>>();
    this.#nodes.set(rootAddress, new Lazy<PublicationTreeNode>(() => Promise.resolve(this.#root)));

    this.#events = new Map<string, NDKEvent>();
    this.#events.set(rootAddress, rootEvent);

    this.#ndk = ndk;
  }

  /**
   * Adds an event to the publication tree.
   * @param event The event to be added.
   * @param parentEvent The parent event of the event to be added.
   * @throws An error if the parent event is not in the tree.
   * @description The parent event must already be in the tree. Use
   * {@link PublicationTree.getEvent} to retrieve an event already in the tree.
   */
  async addEvent(event: NDKEvent, parentEvent: NDKEvent) {
    const address = event.tagAddress();
    const parentAddress = parentEvent.tagAddress();
    const parentNode = await this.#nodes.get(parentAddress)?.value();

    if (!parentNode) {
      throw new Error(
        `PublicationTree: Parent node with address ${parentAddress} not found.`
      );
    }

    const node: PublicationTreeNode = {
      type: await this.#getNodeType(event),
      address,
      parent: parentNode,
      children: [],
    };
    parentNode.children!.push(new Lazy<PublicationTreeNode>(() => Promise.resolve(node)));
    this.#nodes.set(address, new Lazy<PublicationTreeNode>(() => Promise.resolve(node)));
    this.#events.set(address, event);
  }

  /**
   * Lazily adds an event to the publication tree by address if the full event is not already
   * loaded into memory.
   * @param address The address of the event to add.
   * @param parentEvent The parent event of the event to add.
   * @description The parent event must already be in the tree. Use
   * {@link PublicationTree.getEvent} to retrieve an event already in the tree.
   */
  async addEventByAddress(address: string, parentEvent: NDKEvent) {
    const parentAddress = parentEvent.tagAddress();
    const parentNode = await this.#nodes.get(parentAddress)?.value();

    if (!parentNode) {
      throw new Error(
        `PublicationTree: Parent node with address ${parentAddress} not found.`
      );
    }

    await this.#addNode(address, parentNode);
  }

  /**
   * Retrieves an event from the publication tree.
   * @param address The address of the event to retrieve.
   * @returns The event, or null if the event is not found.
   */
  async getEvent(address: string): Promise<NDKEvent | null> {
    let event = this.#events.get(address) ?? null;
    if (!event) {
      event = await this.#depthFirstRetrieve(address);
    }

    return event;
  }

  /**
   * Retrieves the events in the hierarchy of the event with the given address.
   * @param address The address of the event for which to retrieve the hierarchy.
   * @returns Returns an array of events in the addressed event's hierarchy, beginning with the
   * root and ending with the addressed event.
   */
  async getHierarchy(address: string): Promise<NDKEvent[]> {
    let node = await this.#nodes.get(address)?.value();
    if (!node) {
      throw new Error(`PublicationTree: Node with address ${address} not found.`);
    }

    const hierarchy: NDKEvent[] = [this.#events.get(address)!];
    
    while (node.parent) {
      hierarchy.push(this.#events.get(node.parent.address)!);
      node = node.parent;
    }

    return hierarchy.reverse();
  }

  /**
   * Sets a start point for iteration over the leaves of the tree.
   * @param address The address of the event to bookmark.
   */
  setBookmark(address: string) {
    this.#bookmark = address;
    this.#cursor.tryMoveTo(address);
  }

  // #region Iteration Cursor

  #cursor = new class {
    target: PublicationTreeNode | null | undefined;

    #tree: PublicationTree;

    constructor(tree: PublicationTree) {
      this.#tree = tree;
    }

    async tryMoveTo(address?: string) {
      if (!address) {
        const startEvent = await this.#tree.#depthFirstRetrieve();
        this.target = await this.#tree.#nodes.get(startEvent!.tagAddress())?.value();
      } else {
        this.target = await this.#tree.#nodes.get(address)?.value();
      }

      if (!this.target) {
        return false;
      }

      return true;
    }

    async tryMoveToFirstChild(): Promise<boolean> {
      if (!this.target) {
        throw new Error("Cursor: Target node is null or undefined.");
      }

      if (this.target.type === PublicationTreeNodeType.Leaf) {
        return false;
      }
      
      this.target = (await this.target.children?.at(0)?.value())!;
      return true;
    }

    async tryMoveToNextSibling(): Promise<boolean> {
      if (!this.target) {
        throw new Error("Cursor: Target node is null or undefined.");
      }

      const parent = this.target.parent;
      const siblings = parent?.children;
      if (!siblings) {
        return false;
      }

      const currentIndex = await siblings.findIndexAsync(
        async (sibling: Lazy<PublicationTreeNode>) => (await sibling.value()).address === this.target!.address
      );

      if (currentIndex === -1) {
        return false;
      }

      const nextSibling = (await siblings.at(currentIndex + 1)?.value()) ?? null;
      if (!nextSibling) {
        return false;
      }

      this.target = nextSibling;
      return true;
    }

    tryMoveToParent(): boolean {
      if (!this.target) {
        throw new Error("Cursor: Target node is null or undefined.");
      }

      const parent = this.target.parent;
      if (!parent) {
        return false;
      }

      this.target = parent;
      return true;
    }
  }(this);

  // #endregion

  // #region Async Iterator Implementation

  [Symbol.asyncIterator](): AsyncIterator<NDKEvent> {
    return this;
  }

  async next(): Promise<IteratorResult<NDKEvent>> {
    if (!this.#cursor.target) {
      await this.#cursor.tryMoveTo(this.#bookmark);
    }

    do {
      if (await this.#cursor.tryMoveToFirstChild()) {
        continue;
      }

      if (await this.#cursor.tryMoveToNextSibling()) {
        continue;
      }

      if (this.#cursor.tryMoveToParent()) {
        continue;
      }

      if (this.#cursor.target?.type === PublicationTreeNodeType.Root) {
        return { done: true, value: null };
      }
    } while (this.#cursor.target?.type !== PublicationTreeNodeType.Leaf);

    const event = await this.getEvent(this.#cursor.target!.address);
    return { done: false, value: event! };
  }

  // #endregion

  // #region Private Methods

  /**
   * Traverses the publication tree in a depth-first manner to retrieve an event, filling in
   * missing nodes during the traversal.
   * @param address The address of the event to retrieve. If no address is provided, the function
   * will return the first leaf in the tree.
   * @returns The event, or null if the event is not found.
   */
  async #depthFirstRetrieve(address?: string): Promise<NDKEvent | null> {
    if (address && this.#nodes.has(address)) {
      return this.#events.get(address)!;
    }

    const stack: string[] = [this.#root.address];
    let currentNode: PublicationTreeNode | null | undefined = this.#root;
    let currentEvent: NDKEvent | null | undefined = this.#events.get(this.#root.address)!;
    while (stack.length > 0) {
      const currentAddress = stack.pop();
      currentNode = await this.#nodes.get(currentAddress!)?.value();
      if (!currentNode) {
        throw new Error(`PublicationTree: Node with address ${currentAddress} not found.`);
      }

      currentEvent = this.#events.get(currentAddress!);
      if (!currentEvent) {
        throw new Error(`PublicationTree: Event with address ${currentAddress} not found.`);
      }

      // Stop immediately if the target of the search is found.
      if (address != null && currentAddress === address) {
        return currentEvent;
      }

      const currentChildAddresses = currentEvent.tags
        .filter(tag => tag[0] === 'a')
        .map(tag => tag[1]);

      // If the current event has no children, it is a leaf.
      if (currentChildAddresses.length === 0) {
        // Return the first leaf if no address was provided.
        if (address == null) {
          return currentEvent!;
        }

        continue;
      }

      // Augment the tree with the children of the current event.
      for (const childAddress of currentChildAddresses) {
        if (this.#nodes.has(childAddress)) {
          continue;
        }

        await this.#addNode(childAddress, currentNode!);
      }

      // Push the popped address's children onto the stack for the next iteration.
      while (currentChildAddresses.length > 0) {
        const nextAddress = currentChildAddresses.pop()!;
        stack.push(nextAddress);
      }
    }

    return null;
  }

  #addNode(address: string, parentNode: PublicationTreeNode) {
    const lazyNode = new Lazy<PublicationTreeNode>(() => this.#resolveNode(address, parentNode));
    parentNode.children!.push(lazyNode);
    this.#nodes.set(address, lazyNode);
  }

  /**
   * Resolves a node address into an event, and creates new nodes for its children.
   * 
   * This method is intended for use as a {@link Lazy} resolver.
   * 
   * @param address The address of the node to resolve.
   * @param parentNode The parent node of the node to resolve.
   * @returns The resolved node.
   */
  async #resolveNode(
    address: string,
    parentNode: PublicationTreeNode
  ): Promise<PublicationTreeNode> {
    const [kind, pubkey, dTag] = address.split(':');
    const event = await this.#ndk.fetchEvent({
      kinds: [parseInt(kind)],
      authors: [pubkey],
      '#d': [dTag],
    });

    if (!event) {
      throw new Error(
        `PublicationTree: Event with address ${address} not found.`
      );
    }

    this.#events.set(address, event);

    const childAddresses = event.tags.filter(tag => tag[0] === 'a').map(tag => tag[1]);
    
    const node: PublicationTreeNode = {
      type: await this.#getNodeType(event),
      address,
      parent: parentNode,
      children: [],
    };

    for (const address of childAddresses) {
      this.addEventByAddress(address, event);
    }

    return node;
  }

  async #getNodeType(event: NDKEvent): Promise<PublicationTreeNodeType> {
    if (event.tagAddress() === this.#root.address) {
      return PublicationTreeNodeType.Root;
    }

    if (event.kind === 30040 && event.tags.some(tag => tag[0] === 'a')) {
      return PublicationTreeNodeType.Branch;
    }

    return PublicationTreeNodeType.Leaf;
  }

  // #endregion
}