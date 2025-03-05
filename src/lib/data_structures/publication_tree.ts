import type NDK from "@nostr-dev-kit/ndk";
import type { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";

interface PublicationTreeNode {
  address: string;
  parent?: PublicationTreeNode;
  children?: PublicationTreeNode[];
}

// TODO: Add an iterator over the leaves of the tree.
export class PublicationTree {
  private root: PublicationTreeNode;
  private nodes: Map<string, PublicationTreeNode>;
  private events: Map<string, NDKEvent>;
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

  // #region Private Methods

  /**
   * Traverses the publication tree in a depth-first manner to retrieve an event, filling in
   * missing nodes during the traversal.
   * @param address The address of the event to retrieve.
   * @returns The event, or null if the event is not found.
   */
  private async depthFirstRetrieve(address: string): Promise<NDKEvent | null> {
    if (this.nodes.has(address)) {
      return this.events.get(address)!;
    }

    const stack: string[] = [this.root.address];
    let currentEvent: NDKEvent | null | undefined;
    while (stack.length > 0) {
      const currentAddress = stack.pop();

      // Stop immediately if the target of the search is found.
      if (currentAddress === address) {
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

      // Push the popped address's children onto the stack for the next iteration.
      while (currentChildAddresses.length > 0) {
        stack.push(currentChildAddresses.pop()!);
      }
    }

    return null;
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
}