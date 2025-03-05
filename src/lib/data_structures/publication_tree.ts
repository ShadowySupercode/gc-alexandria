import type { NDKEvent } from "@nostr-dev-kit/ndk";

interface PublicationTreeNode {
  address: string;
  parent?: PublicationTreeNode;
  children?: PublicationTreeNode[];
}

// TODO: Add public method(s) for event retrieval.
// TODO: Add methods for DFS and BFS traversal-retrieval.
export class PublicationTree {
  private root: PublicationTreeNode;
  private nodes: Map<string, PublicationTreeNode>;
  private events: Map<string, NDKEvent>;

  constructor(rootEvent: NDKEvent) {
    const rootAddress = this.getAddress(rootEvent);
    this.root = { address: rootAddress, children: [] };

    this.nodes = new Map<string, PublicationTreeNode>();
    this.nodes.set(rootAddress, this.root);

    this.events = new Map<string, NDKEvent>();
    this.events.set(rootAddress, rootEvent);
  }

  addEvent(event: NDKEvent, parentEvent: NDKEvent) {
    const address = this.getAddress(event);
    const parentAddress = this.getAddress(parentEvent);
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

  private getAddress(event: NDKEvent): string {
    if (event.kind! < 30000 || event.kind! >= 40000) {
      throw new Error(
        "PublicationTree: Invalid event kind. Event kind must be in the range 30000-39999"
      );
    }

    return `${event.kind}:${event.pubkey}:${event.dTag}`;
  }
}