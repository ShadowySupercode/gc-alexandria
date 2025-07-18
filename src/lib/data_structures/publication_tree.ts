import type NDK from "@nostr-dev-kit/ndk";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { Lazy } from "./lazy.ts";

enum PublicationTreeNodeType {
  Branch,
  Leaf,
}

enum PublicationTreeNodeStatus {
  Resolved,
  Error,
}

export enum TreeTraversalMode {
  Leaves,
  All,
}

enum TreeTraversalDirection {
  Forward,
  Backward,
}

interface PublicationTreeNode {
  type: PublicationTreeNodeType;
  status: PublicationTreeNodeStatus;
  address: string;
  parent?: PublicationTreeNode;
  children?: Array<Lazy<PublicationTreeNode>>;
}

export class PublicationTree implements AsyncIterable<NDKEvent | null> {
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

  #nodeAddedObservers: Array<(address: string) => void> = [];

  #nodeResolvedObservers: Array<(address: string) => void> = [];

  #bookmarkMovedObservers: Array<(address: string) => void> = [];

  constructor(rootEvent: NDKEvent, ndk: NDK) {
    const rootAddress = rootEvent.tagAddress();
    this.#root = {
      type: PublicationTreeNodeType.Branch,
      status: PublicationTreeNodeStatus.Resolved,
      address: rootAddress,
      children: [],
    };

    this.#nodes = new Map<string, Lazy<PublicationTreeNode>>();
    this.#nodes.set(
      rootAddress,
      new Lazy<PublicationTreeNode>(() => Promise.resolve(this.#root)),
    );

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
        `PublicationTree: Parent node with address ${parentAddress} not found.`,
      );
    }

    const node: PublicationTreeNode = {
      type: await this.#getNodeType(event),
      status: PublicationTreeNodeStatus.Resolved,
      address,
      parent: parentNode,
      children: [],
    };
    const lazyNode = new Lazy<PublicationTreeNode>(() => Promise.resolve(node));
    parentNode.children!.push(lazyNode);
    this.#nodes.set(address, lazyNode);
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
        `PublicationTree: Parent node with address ${parentAddress} not found.`,
      );
    }

    this.#addNode(address, parentNode);
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
   * Retrieves the addresses of the loaded children, if any, of the node with the given address.
   *
   * @param address The address of the parent node.
   * @returns An array of addresses of any loaded child nodes.
   *
   * Note that this method resolves all children of the node.
   */
  async getChildAddresses(address: string): Promise<Array<string | null>> {
    const node = await this.#nodes.get(address)?.value();
    if (!node) {
      throw new Error(
        `[PublicationTree] Node with address ${address} not found.`,
      );
    }

    return Promise.all(
      node.children?.map(
        async (child) => (await child.value())?.address ?? null,
      ) ?? [],
    );
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
      throw new Error(
        `[PublicationTree] Node with address ${address} not found.`,
      );
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
    this.#cursor.tryMoveTo(address).then((success) => {
      if (success) {
        this.#bookmarkMovedObservers.forEach((observer) => observer(address));
      }
    });
  }

  onBookmarkMoved(observer: (address: string) => void) {
    this.#bookmarkMovedObservers.push(observer);
  }

  onNodeAdded(observer: (address: string) => void) {
    this.#nodeAddedObservers.push(observer);
  }

  /**
   * Registers an observer function that is invoked whenever a new node is resolved.  Nodes are
   * added lazily.
   *
   * @param observer The observer function.
   */
  onNodeResolved(observer: (address: string) => void) {
    this.#nodeResolvedObservers.push(observer);
  }

  // #region Iteration Cursor

  #cursor = new (class {
    target: PublicationTreeNode | null | undefined;

    #tree: PublicationTree;

    constructor(tree: PublicationTree) {
      this.#tree = tree;
    }

    async tryMoveTo(address?: string) {
      if (!address) {
        const startEvent = await this.#tree.#depthFirstRetrieve();
        this.target = await this.#tree.#nodes
          .get(startEvent!.tagAddress())
          ?.value();
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
        console.debug(
          "[Publication Tree Cursor] Target node is null or undefined.",
        );
        return false;
      }

      if (this.target.type === PublicationTreeNodeType.Leaf) {
        return false;
      }

      if (this.target.children == null || this.target.children.length === 0) {
        return false;
      }

      this.target = await this.target.children?.at(0)?.value();
      return true;
    }

    async tryMoveToLastChild(): Promise<boolean> {
      if (!this.target) {
        console.debug(
          "[Publication Tree Cursor] Target node is null or undefined.",
        );
        return false;
      }

      if (this.target.type === PublicationTreeNodeType.Leaf) {
        return false;
      }

      if (this.target.children == null || this.target.children.length === 0) {
        return false;
      }

      this.target = await this.target.children?.at(-1)?.value();
      return true;
    }

    async tryMoveToNextSibling(): Promise<boolean> {
      if (!this.target) {
        console.debug(
          "[Publication Tree Cursor] Target node is null or undefined.",
        );
        return false;
      }

      const parent = this.target.parent;
      const siblings = parent?.children;
      if (!siblings) {
        return false;
      }

      const currentIndex = await siblings.findIndexAsync(
        async (sibling: Lazy<PublicationTreeNode>) =>
          (await sibling.value())?.address === this.target!.address,
      );

      if (currentIndex === -1) {
        return false;
      }

      if (currentIndex + 1 >= siblings.length) {
        return false;
      }

      this.target = await siblings.at(currentIndex + 1)?.value();
      return true;
    }

    async tryMoveToPreviousSibling(): Promise<boolean> {
      if (!this.target) {
        console.debug(
          "[Publication Tree Cursor] Target node is null or undefined.",
        );
        return false;
      }

      const parent = this.target.parent;
      const siblings = parent?.children;
      if (!siblings) {
        return false;
      }

      const currentIndex = await siblings.findIndexAsync(
        async (sibling: Lazy<PublicationTreeNode>) =>
          (await sibling.value())?.address === this.target!.address,
      );

      if (currentIndex === -1) {
        return false;
      }

      if (currentIndex <= 0) {
        return false;
      }

      this.target = await siblings.at(currentIndex - 1)?.value();
      return true;
    }

    tryMoveToParent(): boolean {
      if (!this.target) {
        console.debug(
          "[Publication Tree Cursor] Target node is null or undefined.",
        );
        return false;
      }

      const parent = this.target.parent;
      if (!parent) {
        return false;
      }

      this.target = parent;
      return true;
    }
  })(this);

  // #endregion

  // #region Async Iterator Implementation

  [Symbol.asyncIterator](): AsyncIterator<NDKEvent | null> {
    return this;
  }

  /**
   * Return the next event in the tree for the given traversal mode.
   *
   * @param mode The traversal mode. Can be {@link TreeTraversalMode.Leaves} or
   * {@link TreeTraversalMode.All}.
   * @returns The next event in the tree, or null if the tree is empty.
   */
  async next(
    mode: TreeTraversalMode = TreeTraversalMode.Leaves,
  ): Promise<IteratorResult<NDKEvent | null>> {
    if (!this.#cursor.target) {
      if (await this.#cursor.tryMoveTo(this.#bookmark)) {
        return this.#yieldEventAtCursor(false);
      }
    }

    switch (mode) {
      case TreeTraversalMode.Leaves:
        return this.#walkLeaves(TreeTraversalDirection.Forward);
      case TreeTraversalMode.All:
        return this.#preorderWalkAll(TreeTraversalDirection.Forward);
    }
  }

  /**
   * Return the previous event in the tree for the given traversal mode.
   *
   * @param mode The traversal mode. Can be {@link TreeTraversalMode.Leaves} or
   * {@link TreeTraversalMode.All}.
   * @returns The previous event in the tree, or null if the tree is empty.
   */
  async previous(
    mode: TreeTraversalMode = TreeTraversalMode.Leaves,
  ): Promise<IteratorResult<NDKEvent | null>> {
    if (!this.#cursor.target) {
      if (await this.#cursor.tryMoveTo(this.#bookmark)) {
        const event = await this.getEvent(this.#cursor.target!.address);
        return { done: false, value: event };
      }
    }

    switch (mode) {
      case TreeTraversalMode.Leaves:
        return this.#walkLeaves(TreeTraversalDirection.Backward);
      case TreeTraversalMode.All:
        return this.#preorderWalkAll(TreeTraversalDirection.Backward);
    }
  }

  async #yieldEventAtCursor(
    done: boolean,
  ): Promise<IteratorResult<NDKEvent | null>> {
    const value = (await this.getEvent(this.#cursor.target!.address)) ?? null;
    return { done, value };
  }

  /**
   * Walks the tree in the given direction, yielding the event at each leaf.
   *
   * @param direction The direction to walk the tree.
   * @returns The event at the leaf, or null if the tree is empty.
   *
   * Based on Raymond Chen's tree traversal algorithm example.
   * https://devblogs.microsoft.com/oldnewthing/20200106-00/?p=103300
   */
  async #walkLeaves(
    direction: TreeTraversalDirection = TreeTraversalDirection.Forward,
  ): Promise<IteratorResult<NDKEvent | null>> {
    const tryMoveToSibling: () => Promise<boolean> =
      direction === TreeTraversalDirection.Forward
        ? this.#cursor.tryMoveToNextSibling.bind(this.#cursor)
        : this.#cursor.tryMoveToPreviousSibling.bind(this.#cursor);
    const tryMoveToChild: () => Promise<boolean> =
      direction === TreeTraversalDirection.Forward
        ? this.#cursor.tryMoveToFirstChild.bind(this.#cursor)
        : this.#cursor.tryMoveToLastChild.bind(this.#cursor);

    do {
      if (await tryMoveToSibling()) {
        while (await tryMoveToChild()) {
          continue;
        }

        if (this.#cursor.target!.status === PublicationTreeNodeStatus.Error) {
          return { done: false, value: null };
        }

        return this.#yieldEventAtCursor(false);
      }
    } while (this.#cursor.tryMoveToParent());

    if (this.#cursor.target!.status === PublicationTreeNodeStatus.Error) {
      return { done: false, value: null };
    }

    // If we get to this point, we're at the root node (can't move up any more).
    return { done: true, value: null };
  }

  /**
   * Walks the tree in the given direction, yielding the event at each node.
   *
   * @param direction The direction to walk the tree.
   * @returns The event at the node, or null if the tree is empty.
   *
   * Based on Raymond Chen's preorder walk algorithm example.
   * https://devblogs.microsoft.com/oldnewthing/20200107-00/?p=103304
   */
  async #preorderWalkAll(
    direction: TreeTraversalDirection = TreeTraversalDirection.Forward,
  ): Promise<IteratorResult<NDKEvent | null>> {
    const tryMoveToSibling: () => Promise<boolean> =
      direction === TreeTraversalDirection.Forward
        ? this.#cursor.tryMoveToNextSibling.bind(this.#cursor)
        : this.#cursor.tryMoveToPreviousSibling.bind(this.#cursor);
    const tryMoveToChild: () => Promise<boolean> =
      direction === TreeTraversalDirection.Forward
        ? this.#cursor.tryMoveToFirstChild.bind(this.#cursor)
        : this.#cursor.tryMoveToLastChild.bind(this.#cursor);

    if (await tryMoveToChild()) {
      return this.#yieldEventAtCursor(false);
    }

    do {
      if (await tryMoveToSibling()) {
        return this.#yieldEventAtCursor(false);
      }
    } while (this.#cursor.tryMoveToParent());

    if (this.#cursor.target!.status === PublicationTreeNodeStatus.Error) {
      return { done: false, value: null };
    }

    // If we get to this point, we're at the root node (can't move up any more).
    return this.#yieldEventAtCursor(true);
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
    let currentEvent: NDKEvent | null | undefined = this.#events.get(
      this.#root.address,
    )!;
    while (stack.length > 0) {
      const currentAddress = stack.pop();
      currentNode = await this.#nodes.get(currentAddress!)?.value();
      if (!currentNode) {
        throw new Error(
          `[PublicationTree] Node with address ${currentAddress} not found.`,
        );
      }

      currentEvent = this.#events.get(currentAddress!);
      if (!currentEvent) {
        console.warn(
          `[PublicationTree] Event with address ${currentAddress} not found.`,
        );
        return null;
      }

      // Stop immediately if the target of the search is found.
      if (address != null && currentAddress === address) {
        return currentEvent;
      }

      const currentChildAddresses = currentEvent.tags
        .filter((tag) => tag[0] === "a")
        .map((tag) => tag[1]);

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
    const lazyNode = new Lazy<PublicationTreeNode>(() =>
      this.#resolveNode(address, parentNode),
    );
    parentNode.children!.push(lazyNode);
    this.#nodes.set(address, lazyNode);

    this.#nodeAddedObservers.forEach((observer) => observer(address));
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
    parentNode: PublicationTreeNode,
  ): Promise<PublicationTreeNode> {
    const [kind, pubkey, dTag] = address.split(":");
    const event = await this.#ndk.fetchEvent({
      kinds: [parseInt(kind)],
      authors: [pubkey],
      "#d": [dTag],
    });

    if (!event) {
      console.debug(
        `[PublicationTree] Event with address ${address} not found.`,
      );

      return {
        type: PublicationTreeNodeType.Leaf,
        status: PublicationTreeNodeStatus.Error,
        address,
        parent: parentNode,
        children: [],
      };
    }

    this.#events.set(address, event);

    const childAddresses = event.tags
      .filter((tag) => tag[0] === "a")
      .map((tag) => tag[1]);

    const node: PublicationTreeNode = {
      type: this.#getNodeType(event),
      status: PublicationTreeNodeStatus.Resolved,
      address,
      parent: parentNode,
      children: [],
    };

    for (const address of childAddresses) {
      this.addEventByAddress(address, event);
    }

    this.#nodeResolvedObservers.forEach((observer) => observer(address));

    return node;
  }

  #getNodeType(event: NDKEvent): PublicationTreeNodeType {
    if (event.kind === 30040 && event.tags.some((tag) => tag[0] === "a")) {
      return PublicationTreeNodeType.Branch;
    }

    return PublicationTreeNodeType.Leaf;
  }

  // #endregion
}
