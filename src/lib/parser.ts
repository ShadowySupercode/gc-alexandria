import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import asciidoctor from 'asciidoctor';
import type {
  AbstractBlock,
  AbstractNode,
  Asciidoctor,
  Block,
  Document,
  Extensions,
  Section,
  ProcessorOptions,
} from 'asciidoctor';
import he from 'he';
import { writable, type Writable } from 'svelte/store';
import { zettelKinds } from './consts';

interface IndexMetadata {
  authors?: string[];
  version?: string;
  edition?: string;
  isbn?: string;
  publicationDate?: string;
  publisher?: string;
  summary?: string;
  coverImage?: string;
}

export enum SiblingSearchDirection {
  Previous,
  Next
}

export enum InsertLocation {
  Before,
  After
}

/**
 * @classdesc Pharos is an extension of the Asciidoctor class that adds Nostr Knowledge Base (NKB) 
 * features to core Asciidoctor functionality.  Asciidoctor is used to parse an AsciiDoc document
 * into an Abstract Syntax Tree (AST), and Phraos generates NKB events from the nodes in that tree.
 * @class
 * @augments Asciidoctor
 */
export default class Pharos {
  /**
   * Key to terminology used in the class:
   * 
   * Nostr Knowledge Base (NKB) entities:
   * - Zettel: Bite-sized pieces of text contained within kind 30041 events.
   * - Index: A kind 30040 event describing a collection of zettels or other Nostr events.
   * - Event: The generic term for a Nostr event.
   * 
   * Asciidoctor entities:
   * - Document: The entirety of an AsciiDoc document.  The document title is denoted by a level 0
   * header, and the document may contain metadata, such as author and edition, immediately below
   * the title.
   * - Section: A section of an AsciiDoc document demarcated by a header.  A section may contain
   * blocks and/or other sections.
   * - Block: A block of content within an AsciiDoc document.  Blocks are demarcated on either side
   * by newline characters.  Blocks may contain other blocks or inline content.  Blocks may be
   * images, paragraphs, sections, a document, or other types of content.
   * - Node: A unit of the parsed AsciiDoc document.  All blocks are nodes.  Nodes are related
   * hierarchically to form the Abstract Syntax Tree (AST) representation of the document.
   */

  private asciidoctor: Asciidoctor;

  private ndk: NDK;

  private contextCounters: Map<string, number> = new Map<string, number>();

  /**
   * The HTML content of the converted document.
   */
  private html?: string | Document;

  /**
   * The ID of the root node in the document.
   */
  private rootNodeId?: string;

  /**
   * Metadata to be used to populate the tags on the root index event.
   */
  private rootIndexMetadata: IndexMetadata = {};

  /**
   * A map of node IDs to the nodes themselves.
   */
  private nodes: Map<string, AbstractNode> = new Map<string, AbstractNode>();

  /**
   * A map of event d tags to the events themselves.
   */
  private events: Map<string, NDKEvent> = new Map<string, NDKEvent>();

  /**
   * A map of event d tags to the context name assigned to each event's originating node by the
   * Asciidoctor parser.
   */
  private eventToContextMap: Map<string, string> = new Map<string, string>();

  /**
   * A map of node IDs to the integer event kind that will be used to represent the node.
   */
  private eventToKindMap: Map<string, number> = new Map<string, number>();

  /**
   * A map of index IDs to the IDs of the nodes they reference.
   */
  private indexToChildEventsMap: Map<string, Set<string>> = new Map<string, Set<string>>();

  /**
   * A map of node IDs to the Nostr event IDs of the events they generate.
   */
  private eventIds: Map<string, string> = new Map<string, string>();

  /**
   * A map of the levels of the event tree to a list of event IDs at each level.
   */
  private eventsByLevelMap: Map<number, string[]> = new Map<number, string[]>();

  /**
   * When `true`, `getEvents()` should regenerate the event tree to propagate updates.
   */
  private shouldUpdateEventTree: boolean = false;

  // #region Public API

  constructor(ndk: NDK) {
    this.asciidoctor = asciidoctor();

    this.ndk = ndk;

    const pharos = this;
    this.asciidoctor.Extensions.register(function () {
      const registry = this;
      registry.treeProcessor(function () {
        const dsl = this;
        dsl.process(function (document) {
          const treeProcessor = this;
          pharos.treeProcessor(treeProcessor, document);
        });
      })
    });
  }

  parse(content: string, options?: ProcessorOptions | undefined): void {
    try {
      this.html = this.asciidoctor.convert(content, options) as string | Document | undefined;
    } catch (error) {
      console.error(error);
      throw new Error('Failed to parse AsciiDoc document.');
    }
  }

  /**
   * Fetches and parses the event tree for a publication given the event or event ID of the
   * publication's root index.
   * @param event The event or event ID of the publication's root index.
   */
  async fetch(event: NDKEvent | string): Promise<void> {
    let content: string;

    if (typeof event === 'string') {
      const index = await this.ndk.fetchEvent({ ids: [event] });
      if (!index) {
        throw new Error('Failed to fetch publication.');
      }

      content = await this.getPublicationContent(index);
    } else {
      content = await this.getPublicationContent(event);
    }

    this.parse(content);
  }

  /**
   * Generates and stores Nostr events from the parsed AsciiDoc document.  The events can be
   * modified via the parser's API and retrieved via the `getEvents()` method.
   * @param pubkey The public key (as a hex string) of the user that will sign and publish the 
   * events.
   */
  generate(pubkey: string): void {
    const stack = this.stackEventNodes();
    this.generateEvents(stack, pubkey);
  }

  /**
   * @param pubkey The public key (as a hex string) of the user generating the events.
   * @returns An array of Nostr events generated from the parsed AsciiDoc document.
   * @remarks This method returns the events as they are currently stored in the parser.  If none
   * are stored, they will be freshly generated.
   */
  getEvents(pubkey: string): NDKEvent[] {
    if (this.shouldUpdateEventTree) {
      const stack = this.stackEventNodes();
      return this.generateEvents(stack, pubkey);
    }

    return Array.from(this.events.values());
  }

  /**
   * Gets the entire HTML content of the AsciiDoc document.
   * @returns The HTML content of the converted document.
   */
  getHtml(): string {
    return this.html?.toString() || '';
  }

  /**
   * @returns The ID of the root index of the converted document.
   * @remarks The root index ID may be used to retrieve metadata or children from the root index.
   */
  getRootIndexId(): string {
    return this.normalizeId(this.rootNodeId) ?? '';
  }

  /**
   * @returns The title, if available, from the metadata of the index with the given ID.
   */
  getIndexTitle(id: string): string | undefined {
    const section = this.nodes.get(id) as Section;
    const title = section.getTitle() ?? '';
    return he.decode(title);
  }

  /**
   * @returns The IDs of any child indices of the index with the given ID.
   */
  getChildIndexIds(id: string): string[] {
    return Array.from(this.indexToChildEventsMap.get(id) ?? [])
      .filter(id => this.eventToKindMap.get(id) === 30040);
  }

  /**
   * @returns The IDs of any child zettels of the index with the given ID.
   */
  getChildZettelIds(id: string): string[] {
    return Array.from(this.indexToChildEventsMap.get(id) ?? [])
      .filter(id => this.eventToKindMap.get(id) !== 30040);
  }

  /**
   * @returns The IDs of any child nodes in the order in which they should be rendered.
   */
  getOrderedChildIds(id: string): string[] {
    return Array.from(this.indexToChildEventsMap.get(id) ?? []);
  }

  /**
   * @returns The content of the node with the given ID.  The presentation of the returned content
   * varies by the node's context.
   * @remarks By default, the content is returned as HTML produced by the
   * Asciidoctor converter.  However, other formats are returned for specific contexts:
   * - Paragraph: The content is returned as a plain string.
   */
  getContent(id: string): string {
    const normalizedId = this.normalizeId(id);
    const block = this.nodes.get(normalizedId!) as AbstractBlock;

    switch (block.getContext()) {
    case 'paragraph':
      return block.getContent() ?? '';
    }

    return block.convert();
  }

  /**
   * Updates the `content` field of a Nostr event in-place.
   * @param dTag The d tag of the event to update.
   * @param content The new content to assign to the event.
   * @returns The updated event.
   * @remarks Changing the content of a Nostr event changes its hash, but regenerating the event
   * tree is expensive.  Thus, the event tree will not be regenerated until the consumer next
   * invokes `getEvents()`.
   */
  updateEventContent(dTag: string, content: string): NDKEvent {
    const event = this.events.get(dTag);
    if (!event) {
      throw new Error(`No event found for #d:${dTag}.`);
    }

    this.updateEventByContext(dTag, content, this.eventToContextMap.get(dTag)!);

    return event;
  }

  /**
   * Finds the nearest sibling of the event with the given d tag.
   * @param targetDTag The d tag of the target event.
   * @param parentDTag The d tag of the target event's parent.
   * @param depth The depth of the target event within the parser tree.
   * @param direction The direction in which to search for a sibling.
   * @returns A tuple containing the d tag of the nearest sibling and the d tag of the nearest
   * sibling's parent.
   */
  getNearestSibling(
    targetDTag: string,
    depth: number,
    direction: SiblingSearchDirection
  ): [string | null, string | null] {
    const eventsAtLevel = this.eventsByLevelMap.get(depth);
    if (!eventsAtLevel) {
      throw new Error(`No events found at level ${depth}.`);
    }

    const targetIndex = eventsAtLevel.indexOf(targetDTag);

    if (targetIndex === -1) {
      throw new Error(`The event indicated by #d:${targetDTag} does not exist at level ${depth} of the event tree.`);
    }

    const parentDTag = this.getParent(targetDTag);

    if (!parentDTag) {
      throw new Error(`The event indicated by #d:${targetDTag} does not have a parent.`);
    }

    const grandparentDTag = this.getParent(parentDTag);

    // If the target is the first node at its level and we're searching for a previous sibling,
    // look among the siblings of the target's parent at the previous level.
    if (targetIndex === 0 && direction === SiblingSearchDirection.Previous) {
      // * Base case: The target is at the first level of the tree and has no previous sibling.
      if (!grandparentDTag) {
        return [null, null];
      }

      return this.getNearestSibling(parentDTag, depth - 1, direction);
    }

    // If the target is the last node at its level and we're searching for a next sibling,
    // look among the siblings of the target's parent at the previous level.
    if (targetIndex === eventsAtLevel.length - 1 && direction === SiblingSearchDirection.Next) {
      // * Base case: The target is at the last level of the tree and has no subsequent sibling.
      if (!grandparentDTag) {
        return [null, null];
      }

      return this.getNearestSibling(parentDTag, depth - 1, direction);
    }

    // * Base case: There is an adjacent sibling at the same depth as the target.
    switch (direction) {
    case SiblingSearchDirection.Previous:
      return [eventsAtLevel[targetIndex - 1], parentDTag];
    case SiblingSearchDirection.Next:
      return [eventsAtLevel[targetIndex + 1], parentDTag];
    }

    return [null, null];
  }

  /**
   * Gets the d tag of the parent of the event with the given d tag.
   * @param dTag The d tag of the target event.
   * @returns The d tag of the parent event, or null if the target event does not have a parent.
   * @throws An error if the target event does not exist in the parser tree.
   */
  getParent(dTag: string): string | null {
    // Check if the event exists in the parser tree.
    if (!this.eventIds.has(dTag)) {
      throw new Error(`The event indicated by #d:${dTag} does not exist in the parser tree.`);
    }

    // Iterate through all the index to child mappings.
    // This may be expensive on large trees.
    for (const [indexId, childIds] of this.indexToChildEventsMap) {
      // If this parent contains our target as a child, we found the parent
      if (childIds.has(dTag)) {
        return indexId;
      }
    }

    return null;
  }

  /**
   * Moves an event within the event tree.
   * @param targetDTag The d tag of the event to be moved.
   * @param destinationDTag The d tag another event, next to which the target will be placed.
   * @param insertAfter If true, the target will be placed after the destination event, otherwise,
   * it will be placed before the destination event.
   * @throws Throws an error if the parameters specify an invalid move.
   * @remarks Moving the target event within the tree changes the hash of several events, so the
   * event tree will be regenerated when the consumer next invokes `getEvents()`.
   */
  moveEvent(targetDTag: string, destinationDTag: string, insertAfter: boolean = false): void {
    const targetEvent = this.events.get(targetDTag);
    const destinationEvent = this.events.get(destinationDTag);
    const targetParent = this.getParent(targetDTag);
    const destinationParent = this.getParent(destinationDTag);

    if (!targetEvent) {
      throw new Error(`No event found for #d:${targetDTag}.`);
    }

    if (!destinationEvent) {
      throw new Error(`No event found for #d:${destinationDTag}.`);
    }

    if (!targetParent) {
      throw new Error(`The event indicated by #d:${targetDTag} does not have a parent.`);
    }

    if (!destinationParent) {
      throw new Error(`The event indicated by #d:${destinationDTag} does not have a parent.`);
    }

    // Remove the target from among the children of its current parent.
    this.indexToChildEventsMap.get(targetParent)?.delete(targetDTag);

    // If necessary, remove the target event from among the children of its destination parent.
    this.indexToChildEventsMap.get(destinationParent)?.delete(targetDTag);

    // Get the index of the destination event among the children of its parent.
    const destinationIndex = Array.from(this.indexToChildEventsMap.get(destinationParent) ?? [])
      .indexOf(destinationDTag);

    // Insert next to the index of the destination event, either before or after as specified by
    // the insertAfter flag.
    const destinationChildren = Array.from(this.indexToChildEventsMap.get(destinationParent) ?? []);
    insertAfter
      ? destinationChildren.splice(destinationIndex + 1, 0, targetDTag)
      : destinationChildren.splice(destinationIndex, 0, targetDTag);
    this.indexToChildEventsMap.set(destinationParent, new Set(destinationChildren));

    this.shouldUpdateEventTree = true;
  }

  /**
   * Resets the parser to its initial state, removing any parsed data.
   */
  reset(): void {
    this.contextCounters.clear();
    this.html = undefined;
    this.rootNodeId = undefined;
    this.rootIndexMetadata = {};
    this.nodes.clear();
    this.eventToKindMap.clear();
    this.indexToChildEventsMap.clear();
    this.eventsByLevelMap.clear();
    this.eventIds.clear();
  }

  // #endregion

  // #region Tree Processor Extensions

  /**
   * Walks the Asciidoctor Abstract Syntax Tree (AST) and performs the following mappings:
   * - Each node ID is mapped to the node itself.
   * - Each node ID is mapped to an integer event kind that will be used to represent the node.
   * - Each ID of a node containing children is mapped to the set of IDs of its children.
   */
  private treeProcessor(treeProcessor: Extensions.TreeProcessor, document: Document) {
    this.rootNodeId = this.generateNodeId(document);
    document.setId(this.rootNodeId);
    this.nodes.set(this.rootNodeId, document);
    this.eventToKindMap.set(this.rootNodeId, 30040);
    this.indexToChildEventsMap.set(this.rootNodeId, new Set<string>());

    /** FIFO queue (uses `Array.push()` and `Array.shift()`). */
    const nodeQueue: AbstractNode[] = document.getBlocks();

    while (nodeQueue.length > 0) {
      const block = nodeQueue.shift();
      if (!block) {
        continue;
      }

      if (block.getContext() === 'section') {
        const children = this.processSection(block as Section);
        nodeQueue.push(...children);
      } else {
        this.processBlock(block as Block);
      }
    }

    this.buildEventsByLevelMap(this.rootNodeId!, 0);
  }

  /**
   * Processes a section of the Asciidoctor AST.
   * @param section The section to process.
   * @returns An array of the section's child nodes.  If there are no child nodes, returns an empty
   * array.
   * @remarks Sections are mapped as kind 30040 indexToChildEventsMap by default.
   */
  private processSection(section: Section): AbstractNode[] {
    let sectionId = this.normalizeId(section.getId());
    if (!sectionId) {
      sectionId = this.generateNodeId(section);
    }

    // Prevent duplicates.
    if (this.nodes.has(sectionId)) {
      return [];
    }

    this.nodes.set(sectionId, section);
    this.eventToKindMap.set(sectionId, 30040);  // Sections are indexToChildEventsMap by default.
    this.indexToChildEventsMap.set(sectionId, new Set<string>());

    const parentId = this.normalizeId(section.getParent()?.getId());
    if (!parentId) {
      return [];
    }

    // Add the section to its parent index.
    this.indexToChildEventsMap.get(parentId)?.add(sectionId);

    // Limit to 5 levels of section depth.
    if (section.getLevel() >= 5) {
      return [];
    }

    return section.getBlocks();
  }

  /**
   * Processes a block of the Asciidoctor AST.
   * @param block The block to process.
   * @remarks Blocks are mapped as kind 30041 zettels by default.
   */
  private processBlock(block: Block): void {
    // Obtain or generate a unique ID for the block.
    let blockId = this.normalizeId(block.getId());
    if (!blockId) {
      blockId = this.generateNodeId(block) ;
      block.setId(blockId);
    }

    // Prevent duplicates.
    if (this.nodes.has(blockId)) {
      return;
    }

    this.nodes.set(blockId, block);
    this.eventToKindMap.set(blockId, 30041);  // Blocks are zettels by default.

    const parentId = this.normalizeId(block.getParent()?.getId());
    if (!parentId) {
      return;
    }

    // Add the block to its parent index.
    this.indexToChildEventsMap.get(parentId)?.add(blockId);
  }

  //#endregion

  // #region Event Tree Operations

  /**
   * Recursively walks the event tree and builds a map of the events at each level.
   * @param parentNodeId The ID of the parent node.
   * @param depth The depth of the parent node.
   */
  private buildEventsByLevelMap(parentNodeId: string, depth: number): void {
    // If we're at the root level, clear the map so it can be freshly rebuilt.
    if (depth === 0) {
      this.eventsByLevelMap.clear();
    }

    const children = this.indexToChildEventsMap.get(parentNodeId);
    if (!children) {
      return;
    }

    const eventsAtLevel = this.eventsByLevelMap.get(depth) ?? [];
    eventsAtLevel.push(...children);
    this.eventsByLevelMap.set(depth, eventsAtLevel);

    for (const child of children) {
      this.buildEventsByLevelMap(child, depth + 1);
    }
  }

  /**
   * Uses the NDK to crawl the event tree of a publication and return its content as a string.
   * @param event The root index event of the publication.
   * @returns The content of the publication as a string.
   * @remarks This function does a depth-first crawl of the event tree using the relays specified
   * on the NDK instance.
   */
  private async getPublicationContent(event: NDKEvent, depth: number = 0): Promise<string> {
    let content: string = '';

    // Format title into AsciiDoc header.
    const title = event.getMatchingTags('title')[0][1];
    let titleLevel = '';
    for (let i = 0; i <= depth; i++) {
      titleLevel += '=';
    }
    content += `${titleLevel} ${title}\n\n`;

    // TODO: Deprecate `e` tags in favor of `a` tags required by NIP-62.
    let tags = event.getMatchingTags('a');
    if (tags.length === 0) {
      tags = event.getMatchingTags('e');
    }

    // Base case: The event is a zettel.
    if (zettelKinds.includes(event.kind ?? -1)) {
      content += event.content;
      return content;
    }

    // Recursive case: The event is an index.
    const childEvents = await Promise.all(
      tags.map(tag => this.ndk.fetchEventFromTag(tag, event))
    );

    // Michael J - 15 December 2024 - This could be further parallelized by recursively fetching
    // children of index events before processing them for content.  We won't make that change now,
    // as it would increase complexity, but if performance suffers, we can revisit this option.
    const childContentPromises: Promise<string>[] = [];
    for (let i = 0; i < childEvents.length; i++) {
      const childEvent = childEvents[i];
      
      if (!childEvent) {
        console.warn(`NDK could not find event ${tags[i][1]}.`);
        continue;
      }

      childContentPromises.push(this.getPublicationContent(childEvent, depth + 1));
    }

    const childContents = await Promise.all(childContentPromises);
    content += childContents.join('\n\n');

    return content;
  }

  // #endregion

  // #region NDKEvent Generation

  /**
   * Generates a stack of node IDs such that processing them in LIFO order will generate any events
   * used by an index before generating that index itself.
   * @returns An array of node IDs in the order they should be processed to generate events.
   */
  private stackEventNodes(): string[] {
    const tempNodeIdStack: string[] = [this.rootNodeId!];
    const nodeIdStack: string[] = [];

    while (tempNodeIdStack.length > 0) {
      const parentId = tempNodeIdStack.pop()!;
      nodeIdStack.push(parentId);

      if (!this.indexToChildEventsMap.has(parentId)) {
        continue;
      }

      const childIds = Array.from(this.indexToChildEventsMap.get(parentId)!);
      tempNodeIdStack.push(...childIds);
    }

    return nodeIdStack;
  }

  /**
   * Generates Nostr events for each node in the given stack.
   * @param nodeIdStack An array of node IDs ordered such that processing them in LIFO order will
   * produce any child event before it is required by a parent index event.
   * @param pubkey The public key (as a hex string) of the user generating the events.
   * @returns An array of Nostr events.
   */
  private generateEvents(nodeIdStack: string[], pubkey: string): NDKEvent[] {
    const events: NDKEvent[] = [];

    while (nodeIdStack.length > 0) {
      const nodeId = nodeIdStack.pop();
      
      switch (this.eventToKindMap.get(nodeId!)) {
      case 30040:
        events.push(this.generateIndexEvent(nodeId!, pubkey));
        break;

      case 30041:
      default:
        // Kind 30041 (zettel) is currently the default kind for contentful events.
        events.push(this.generateZettelEvent(nodeId!, pubkey));
        break;
      }
    }

    this.shouldUpdateEventTree = false;
    return events;
  }

  /**
   * Generates a kind 30040 index event for the node with the given ID.
   * @param nodeId The ID of the AsciiDoc document node from which to generate an index event.  The
   * node ID will be used as the event's unique d tag identifier.
   * @param pubkey The public key (not encoded in npub form) of the user generating the events.
   * @returns An unsigned NDKEvent with the requisite tags, including e tags pointing to each of its
   * children, and dated to the present moment.
   */
  private generateIndexEvent(nodeId: string, pubkey: string): NDKEvent {
    const title = (this.nodes.get(nodeId)! as AbstractBlock).getTitle();
    // TODO: Use a tags as per NIP-62.
    const childTags = Array.from(this.indexToChildEventsMap.get(nodeId)!)
      .map(id => ['#e', this.eventIds.get(id)!]);

    const event = new NDKEvent(this.ndk);
    event.kind = 30040;
    event.content = '';
    event.tags = [
      ['title', title!],
      ['#d', nodeId],
      ...childTags
    ];
    event.created_at = Date.now();
    event.pubkey = pubkey;

    // Add optional metadata to the root index event.
    if (nodeId === this.rootNodeId) {
      const document = this.nodes.get(nodeId) as Document;

      // Store the metadata so it is available if we need it later.
      this.rootIndexMetadata = {
        authors: document
          .getAuthors()
          .map(author => author.getName())
          .filter(name => name != null),
        version: document.getRevisionNumber(),
        edition: document.getRevisionRemark(),
        publicationDate: document.getRevisionDate(),
      };

      if (this.rootIndexMetadata.authors) {
        event.tags.push(['author', ...this.rootIndexMetadata.authors!]);
      }

      if (this.rootIndexMetadata.version || this.rootIndexMetadata.edition) {
        event.tags.push(
          [
            'version',
            this.rootIndexMetadata.version!,
            this.rootIndexMetadata.edition!
          ].filter(value => value != null)
        );
      }

      if (this.rootIndexMetadata.publicationDate) {
        event.tags.push(['published_on', this.rootIndexMetadata.publicationDate!]);
      }
    }

    // Event ID generation must be the last step.
    const eventId = event.getEventHash();  
    this.eventIds.set(nodeId, eventId);
    event.id = eventId;

    this.events.set(nodeId, event);

    return event;
  }

  /**
   * Generates a kind 30041 zettel event for the node with the given ID.
   * @param nodeId The ID of the AsciiDoc document node from which to generate an index event.  The
   * node ID will be used as the event's unique d tag identifier.
   * @param pubkey The public key (not encoded in npub form) of the user generating the events.
   * @returns An unsigned NDKEvent containing the content of the zettel, the requisite tags, and
   * dated to the present moment.
   */
  private generateZettelEvent(nodeId: string, pubkey: string): NDKEvent {
    const title = (this.nodes.get(nodeId)! as Block).getTitle();
    const content = (this.nodes.get(nodeId)! as Block).getSource();  // AsciiDoc source content.

    const event = new NDKEvent(this.ndk);
    event.kind = 30041;
    event.content = content!;
    event.tags = [
      ['title', title!],
      ['#d', nodeId],
      ...this.extractAndNormalizeWikilinks(content!),
    ];
    event.created_at = Date.now();
    event.pubkey = pubkey;

    // Event ID generation must be the last step.
    const eventId = event.getEventHash();  
    this.eventIds.set(nodeId, eventId);
    event.id = eventId;

    this.events.set(nodeId, event);

    return event;
  }

  // #endregion

  // #region Utility Functions

  /**
   * Generates an ID for the given block that is unique within the document, and adds a mapping of
   * the generated ID to the block's context, as determined by the Asciidoctor parser.
   */
  private generateNodeId(block: AbstractBlock): string {
    let blockId: string | null = this.normalizeId(block.getId());

    if (blockId != null && blockId.length > 0) {
      return blockId;
    }

    blockId = this.normalizeId(block.getTitle());

    // Use the provided title, if possible.
    if (blockId != null && blockId.length > 0) {
      return blockId;
    }

    const documentId = this.rootNodeId;
    let blockNumber: number;

    const context = block.getContext();
    switch (context) {
    case 'admonition':
      blockNumber = this.contextCounters.get('admonition') ?? 0;
      blockId = `${documentId}-admonition-${blockNumber++}`;
      this.contextCounters.set('admonition', blockNumber);
      break;

    case 'audio':
      blockNumber = this.contextCounters.get('audio') ?? 0;
      blockId = `${documentId}-audio-${blockNumber++}`;
      this.contextCounters.set('audio', blockNumber);
      break;

    case 'colist':
      blockNumber = this.contextCounters.get('colist') ?? 0;
      blockId = `${documentId}-colist-${blockNumber++}`;
      this.contextCounters.set('colist', blockNumber);
      break;

    case 'dlist':
      blockNumber = this.contextCounters.get('dlist') ?? 0;
      blockId = `${documentId}-dlist-${blockNumber++}`;
      this.contextCounters.set('dlist', blockNumber);
      break;

    case 'document':
      blockNumber = this.contextCounters.get('document') ?? 0;
      blockId = `${documentId}-document-${blockNumber++}`;
      this.contextCounters.set('document', blockNumber);
      break;

    case 'example':
      blockNumber = this.contextCounters.get('example') ?? 0;
      blockId = `${documentId}-example-${blockNumber++}`;
      this.contextCounters.set('example', blockNumber);
      break;

    case 'floating_title':
      blockNumber = this.contextCounters.get('floating_title') ?? 0;
      blockId = `${documentId}-floating-title-${blockNumber++}`;
      this.contextCounters.set('floating_title', blockNumber);
      break;

    case 'image':
      blockNumber = this.contextCounters.get('image') ?? 0;
      blockId = `${documentId}-image-${blockNumber++}`;
      this.contextCounters.set('image', blockNumber);
      break;

    case 'list_item':
      blockNumber = this.contextCounters.get('list_item') ?? 0;
      blockId = `${documentId}-list-item-${blockNumber++}`;
      this.contextCounters.set('list_item', blockNumber);
      break;

    case 'listing':
      blockNumber = this.contextCounters.get('listing') ?? 0;
      blockId = `${documentId}-listing-${blockNumber++}`;
      this.contextCounters.set('listing', blockNumber);
      break;

    case 'literal':
      blockNumber = this.contextCounters.get('literal') ?? 0;
      blockId = `${documentId}-literal-${blockNumber++}`;
      this.contextCounters.set('literal', blockNumber);
      break;

    case 'olist':
      blockNumber = this.contextCounters.get('olist') ?? 0;
      blockId = `${documentId}-olist-${blockNumber++}`;
      this.contextCounters.set('olist', blockNumber);
      break;

    case 'open':
      blockNumber = this.contextCounters.get('open') ?? 0;
      blockId = `${documentId}-open-${blockNumber++}`;
      this.contextCounters.set('open', blockNumber);
      break;

    case 'page_break':
      blockNumber = this.contextCounters.get('page_break') ?? 0;
      blockId = `${documentId}-page-break-${blockNumber++}`;
      this.contextCounters.set('page_break', blockNumber);
      break;

    case 'paragraph':
      blockNumber = this.contextCounters.get('paragraph') ?? 0;
      blockId = `${documentId}-paragraph-${blockNumber++}`;
      this.contextCounters.set('paragraph', blockNumber);
      break;

    case 'pass':
      blockNumber = this.contextCounters.get('pass') ?? 0;
      blockId = `${documentId}-pass-${blockNumber++}`;
      this.contextCounters.set('pass', blockNumber);
      break;

    case 'preamble':
      blockNumber = this.contextCounters.get('preamble') ?? 0;
      blockId = `${documentId}-preamble-${blockNumber++}`;
      this.contextCounters.set('preamble', blockNumber);
      break;

    case 'quote':
      blockNumber = this.contextCounters.get('quote') ?? 0;
      blockId = `${documentId}-quote-${blockNumber++}`;
      this.contextCounters.set('quote', blockNumber);
      break;

    case 'section':
      blockNumber = this.contextCounters.get('section') ?? 0;
      blockId = `${documentId}-section-${blockNumber++}`;
      this.contextCounters.set('section', blockNumber);
      break;

    case 'sidebar':
      blockNumber = this.contextCounters.get('sidebar') ?? 0;
      blockId = `${documentId}-sidebar-${blockNumber++}`;
      this.contextCounters.set('sidebar', blockNumber);
      break;

    case 'table':
      blockNumber = this.contextCounters.get('table') ?? 0;
      blockId = `${documentId}-table-${blockNumber++}`;
      this.contextCounters.set('table', blockNumber);
      break;

    case 'table_cell':
      blockNumber = this.contextCounters.get('table_cell') ?? 0;
      blockId = `${documentId}-table-cell-${blockNumber++}`;
      this.contextCounters.set('table_cell', blockNumber);
      break;

    case 'thematic_break':
      blockNumber = this.contextCounters.get('thematic_break') ?? 0;
      blockId = `${documentId}-thematic-break-${blockNumber++}`;
      this.contextCounters.set('thematic_break', blockNumber);
      break;

    case 'toc':
      blockNumber = this.contextCounters.get('toc') ?? 0;
      blockId = `${documentId}-toc-${blockNumber++}`;
      this.contextCounters.set('toc', blockNumber);
      break;

    case 'ulist':
      blockNumber = this.contextCounters.get('ulist') ?? 0;
      blockId = `${documentId}-ulist-${blockNumber++}`;
      this.contextCounters.set('ulist', blockNumber);
      break;

    case 'verse':
      blockNumber = this.contextCounters.get('verse') ?? 0;
      blockId = `${documentId}-verse-${blockNumber++}`;
      this.contextCounters.set('verse', blockNumber);
      break;

    case 'video':
      blockNumber = this.contextCounters.get('video') ?? 0;
      blockId = `${documentId}-video-${blockNumber++}`;
      this.contextCounters.set('video', blockNumber);
      break;

    default:
      blockNumber = this.contextCounters.get('block') ?? 0;
      blockId = `${documentId}-block-${blockNumber++}`;
      this.contextCounters.set('block', blockNumber);
      break;
    }

    block.setId(blockId);
    this.eventToContextMap.set(blockId, context);

    return blockId;
  }

  private normalizeId(input?: string): string | null {
    if (input == null || input.length === 0) {
      return null;
    }

    return he.decode(input)
      .toLowerCase()
      .replace(/[_]/g, ' ')  // Replace underscores with spaces.
      .trim()
      .replace(/\s+/g, '-')  // Replace spaces with dashes.
      .replace(/[^a-z0-9\-]/g, '');  // Remove non-alphanumeric characters except dashes.
  }

  private updateEventByContext(dTag: string, value: string, context: string) {
    switch (context) {
    case 'document':
    case 'section':
      this.updateEventTitle(dTag, value);
      break;
    
    default:
      this.updateEventBody(dTag, value);
      break;
    }
  }

  private updateEventTitle(dTag: string, value: string) {
    const event = this.events.get(dTag);
    this.events.delete(dTag);
    this.events.set(value, event!);
    this.rehashEvent(dTag, event!);
  }

  private updateEventBody(dTag: string, value: string) {
    const event = this.events.get(dTag);
    event!.content = value;
    this.rehashEvent(dTag, event!);
  }

  private rehashEvent(dTag: string, event: NDKEvent) {
    event.id = event.getEventHash();
    this.eventIds.set(dTag, event.id);
    this.shouldUpdateEventTree = true;
  }

  private extractAndNormalizeWikilinks(content: string): string[][] {
    const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
    const wikilinks: string[][] = [];
    let match: RegExpExecArray | null;

    // TODO: Match custom-named wikilinks as defined in NIP-54.
    while ((match = wikilinkPattern.exec(content)) !== null) {
      const linkName = match[1];
      const normalizedText = this.normalizeId(linkName);
      wikilinks.push(['wikilink', normalizedText!]);
    }

    return wikilinks;
  }

  // TODO: Add search-based wikilink resolution.

  // #endregion
}

export const pharosInstance: Writable<Pharos> = writable();
