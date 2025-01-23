<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { nip19 } from "nostr-tools";
  import { FeedType, standardRelays } from "$lib/consts";
  import { levelsToRender } from "$lib/state";
  let levels;
  levelsToRender.subscribe((value) => {
    levels = value;
  });
  export let events: NDKEvent[] = [];
  let feedType: FeedType = FeedType.StandardRelays;

  let svg: SVGSVGElement;
  let isDarkMode = false;
  const nodeRadius = 20;
  const linkDistance = 10;
  const arrowDistance = 10;
  const warmupClickEnergy = 0.01; // Energy to restart simulation on drag
  let container: HTMLDivElement;

  let width: number = 1000;
  let height: number = 600;
  let windowHeight: number;

  $: graphHeight = windowHeight ? Math.max(windowHeight * 0.2, 400) : 400;

  $: if (container) {
    width = container.clientWidth || width;
    height = container.clientHeight || height;
  }

  interface NetworkNode extends d3.SimulationNodeDatum {
    id: string;
    event?: NDKEvent;
    level: number;
    isContainer: boolean;
    title: string;
    content: string;
    author: string;
    type: "Index" | "Content";
    naddr?: string;
    nevent?: string;
    x?: number;
    y?: number;
  }

  interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
    source: NetworkNode;
    target: NetworkNode;
    isSequential: boolean;
  }
  interface GraphData {
    nodes: NetworkNode[];
    links: NetworkLink[];
  }
  interface GraphState {
    nodeMap: Map<string, NetworkNode>;
    links: NetworkLink[];
    eventMap: Map<string, NDKEvent>;
    referencedIds: Set<string>;
  }
  function initializeGraphState(events: NDKEvent[]): GraphState {
    const nodeMap = new Map<string, NetworkNode>();
    const eventMap = createEventMap(events);

    // Create initial nodes
    events.forEach((event) => {
      if (!event.id) return;
      const node: NetworkNode = createNetworkNode(event, feedType, 0, 0);
      nodeMap.set(event.id, node);
    });

    // Build referenced IDs set
    const referencedIds = new Set<string>();
    events.forEach((event) => {
      event.getMatchingTags("a").forEach((tag) => {
        const id = extractEventIdFromATag(tag);
        if (id) referencedIds.add(id);
      });
    });

    return {
      nodeMap,
      links: [],
      eventMap,
      referencedIds,
    };
  }

  function processSequence(
    sequence: NetworkNode[],
    indexEvent: NDKEvent,
    level: number,
    state: GraphState,
    maxLevel: number,
  ): void {
    if (level >= maxLevel || sequence.length === 0) return;

    // Set levels for sequence nodes
    sequence.forEach((node) => {
      node.level = level + 1;
    });

    // Create initial link from index to first content
    const indexNode = state.nodeMap.get(indexEvent.id);
    if (indexNode && sequence[0]) {
      state.links.push({
        source: indexNode,
        target: sequence[0],
        isSequential: true,
      });
    }

    // Create sequential links
    for (let i = 0; i < sequence.length - 1; i++) {
      const currentNode = sequence[i];
      const nextNode = sequence[i + 1];

      state.links.push({
        source: currentNode,
        target: nextNode,
        isSequential: true,
      });

      processNestedIndex(currentNode, level + 1, state, maxLevel);
    }

    // Process final node if it's an index
    const lastNode = sequence[sequence.length - 1];
    if (lastNode?.isContainer) {
      processNestedIndex(lastNode, level + 1, state, maxLevel);
    }
  }

  function processNestedIndex(
    node: NetworkNode,
    level: number,
    state: GraphState,
    maxLevel: number,
  ): void {
    if (!node.isContainer || level >= maxLevel) return;

    const nestedEvent = state.eventMap.get(node.id);
    if (nestedEvent) {
      processIndexEvent(nestedEvent, level, state, maxLevel);
    }
  }
  function processIndexEvent(
    indexEvent: NDKEvent,
    level: number,
    state: GraphState,
    maxLevel: number,
  ): void {
    if (level >= maxLevel) return;

    const sequence = indexEvent
      .getMatchingTags("a")
      .map((tag) => extractEventIdFromATag(tag))
      .filter((id): id is string => id !== null)
      .map((id) => state.nodeMap.get(id))
      .filter((node): node is NetworkNode => node !== undefined);

    processSequence(sequence, indexEvent, level, state, maxLevel);
  }
  /**
   * Creates a NetworkNode from an NDKEvent, including naddr generation
   * @param event The NDK event to convert into a network node
   * @param index Optional index position
   * @returns NetworkNode with generated naddr if applicable
   */
  export function createNetworkNode(
    event: NDKEvent,
    feedType: FeedType,
    index?: number,
    level?: number,
  ): NetworkNode {
    let relays = standardRelays;
    const isContainer = event.kind === 30040;

    const node: NetworkNode = {
      id: event.id,
      event,
      index,
      isContainer,
      level: level || 0,
      title: event.getMatchingTags("title")?.[0]?.[1] || "Untitled",
      content: event.content || "",
      author: event.pubkey || "",
      kind: event.kind,
      type: event?.kind === 30040 ? "Index" : "Content",
    };

    // Generate naddr for replaceable events
    if (event.kind && event.pubkey) {
      try {
        // Get the 'd' tag value if it exists
        const dTag = event.getMatchingTags("d")?.[0]?.[1] || "";

        // Create TLV data structure for naddr
        const data = {
          pubkey: event.pubkey, // TLV type 2: author
          identifier: dTag, // TLV type 0: special (identifier/'d' tag)
          kind: event.kind, // TLV type 3: kind
          relays: relays, // TLV type 1: relays (optional)
        };

        node.naddr = nip19.naddrEncode(data);
      } catch (error) {
        console.warn("Failed to generate naddr for node:", error);
      }
      try {
        const nevent = nip19.neventEncode({
          id: event.id,
          relays: relays,
          kind: event.kind,
        });
        node.nevent = nevent;
      } catch (error) {
        console.warn("Failed to decode naddr for node:", error);
      }
    }

    return node;
  }

  function createEventMap(events: NDKEvent[]): Map<string, NDKEvent> {
    const eventMap = new Map<string, NDKEvent>();

    // First pass: Map all events by their ID
    events.forEach((event) => {
      if (event.id) {
        eventMap.set(event.id, event);
      }
    });

    return eventMap;
  }

  function extractEventIdFromATag(tag: string[]): string | null {
    // Extract event ID from the fourth position in 'a' tag
    return tag[3] || null;
  }

  function updateNodeVelocity(
    node: NetworkNode,
    deltaVx: number,
    deltaVy: number,
  ) {
    if (typeof node.vx === "number" && typeof node.vy === "number") {
      node.vx = node.vx - deltaVx;
      node.vy = node.vy - deltaVy;
    }
  }

  function applyGlobalLogGravity(
    node: NetworkNode,
    centerX: number,
    centerY: number,
    alpha: number,
  ) {
    const dx = (node.x ?? 0) - centerX;
    const dy = (node.y ?? 0) - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    const force = Math.log(distance + 1) * 0.05 * alpha;
    updateNodeVelocity(node, (dx / distance) * force, (dy / distance) * force);
  }

  function applyConnectedGravity(
    node: NetworkNode,
    links: NetworkLink[],
    alpha: number,
  ) {
    const connectedNodes = links
      .filter(
        (link) => link.source.id === node.id || link.target.id === node.id,
      )
      .map((link) => (link.source.id === node.id ? link.target : link.source));

    if (connectedNodes.length === 0) return;

    const cogX = d3.mean(connectedNodes, (n) => n.x);
    const cogY = d3.mean(connectedNodes, (n) => n.y);

    if (cogX === undefined || cogY === undefined) return;

    const dx = (node.x ?? 0) - cogX;
    const dy = (node.y ?? 0) - cogY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    const force = distance * 0.3 * alpha;
    updateNodeVelocity(node, (dx / distance) * force, (dy / distance) * force);
  }
  function getNode(
    id: string,
    nodeMap: Map<string, NetworkNode>,
    event?: NDKEvent,
    index?: number,
  ): NetworkNode | null {
    if (!id) return null;

    if (!nodeMap.has(id)) {
      const node: NetworkNode = createNetworkNode(event, feedType, index, 0);
      nodeMap.set(id, node);
    }
    return nodeMap.get(id) || null;
  }

  function getEventColor(eventId: string): string {
    const num = parseInt(eventId.slice(0, 4), 16);
    const hue = num % 360;
    const saturation = 70;
    const lightness = 75;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // Generate the complete graph structure
  function generateGraph(
    events: NDKEvent[],
    maxLevel: number = level,
  ): GraphData {
    const state = initializeGraphState(events);

    // Process root indices
    events
      .filter((e) => e.kind === 30040 && e.id && !state.referencedIds.has(e.id))
      .forEach((rootIndex) => processIndexEvent(rootIndex, 0, state, maxLevel));

    return {
      nodes: Array.from(state.nodeMap.values()),
      links: state.links,
    };
  }
  function setupDragHandlers(
    simulation: d3.Simulation<NetworkNode, NetworkLink>,
  ) {
    // Create drag behavior with proper typing
    const dragBehavior = d3
      .drag<SVGGElement, NetworkNode>()
      .on(
        "start",
        (
          event: d3.D3DragEvent<SVGGElement, NetworkNode, NetworkNode>,
          d: NetworkNode,
        ) => {
          // Warm up simulation when drag starts
          if (!event.active)
            simulation.alphaTarget(warmupClickEnergy).restart();
          // Fix node position during drag
          d.fx = d.x;
          d.fy = d.y;
        },
      )
      .on(
        "drag",
        (
          event: d3.D3DragEvent<SVGGElement, NetworkNode, NetworkNode>,
          d: NetworkNode,
        ) => {
          // Update fixed position to drag position
          d.fx = event.x;
          d.fy = event.y;
        },
      )
      .on(
        "end",
        (
          event: d3.D3DragEvent<SVGGElement, NetworkNode, NetworkNode>,
          d: NetworkNode,
        ) => {
          // Cool down simulation when drag ends
          if (!event.active) simulation.alphaTarget(0);
          // Release fixed position, allowing forces to take over
          d.fx = null;
          d.fy = null;
        },
      );
    return dragBehavior;
  }
  function drawNetwork() {
    if (!svg || !events?.length) return;

    const { nodes, links } = generateGraph(events, levels);
    if (!nodes.length) return;

    const svgElement = d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);
    // Set up zoom behavior
    let g = svgElement.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 9])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svgElement.call(zoom);
    if (g.empty()) {
      g = svgElement.append("g");

      // Define arrow marker with black fill
    }
    svgElement.select("defs").remove();
    const defs = svgElement.append("defs");
    defs
      .append("marker")
      .attr("id", "arrowhead")
      .attr("markerUnits", "strokeWidth") // Added this
      .attr("viewBox", "-10 -5 10 10")
      .attr("refX", 0)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M -10 -5 L 0 0 L -10 5 z")
      .attr("class", "network-link-leather")
      .attr("fill", "none")
      .attr("stroke-width", 1); // Added stroke

    // Force simulation setup
    const simulation = d3
      .forceSimulation<NetworkNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<NetworkNode, NetworkLink>(links)
          .id((d) => d.id)
          .distance(linkDistance * 0.1),
      )
      .force("collide", d3.forceCollide<NetworkNode>().radius(nodeRadius * 4));
    simulation.on("end", () => {
      // Get the bounds of the graph
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const dx = bounds.width;
        const dy = bounds.height;
        const x = bounds.x;
        const y = bounds.y;

        // Calculate scale to fit
        // const scale = 1.25 / Math.max(dx / width, dy / height);
        // const translate = [
        //   width / 2 - scale * (x + dx / 2),
        //   height / 2 - scale * (y + dy / 2),
        // ];

        // Apply the initial transform
        // svgElement
        //   .transition()
        //   .duration(750)
        //   .call(
        //     zoom.transform,
        //     d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
        //   );
      }
    });
    const dragHandler = setupDragHandlers(simulation);

    // Create links
    // First, make sure we're selecting and creating links correctly
    const link = g
      .selectAll("path") // Changed from "path.link" to just "path"
      .data(links)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead)") // This should now be applied
            .attr("class", "network-link-leather"), // Add class if needed
        (update) => update,
        (exit) => exit.remove(),
      );

    // Create nodes
    const node = g
      .selectAll<SVGGElement, NetworkNode>("g.node")
      .data(nodes, (d: NetworkNode) => d.id)
      .join(
        (enter) => {
          const nodeEnter = enter
            .append("g")
            .attr("class", "node network-node-leather")
            .call(dragHandler);

          // add drag circle
          nodeEnter
            .append("circle")
            .attr("r", nodeRadius * 2.5)
            .attr("fill", "transparent")
            .attr("stroke", "transparent")
            .style("cursor", "move");

          // add visual circle, stroke based on current theme
          nodeEnter
            .append("circle")
            .attr("r", nodeRadius)
            .attr("class", (d: NetworkNode) =>
              !d.isContainer
                ? "network-node-leather network-node-content"
                : "network-node-leather",
            )
            .attr("stroke-width", 2);

          // add text labels
          nodeEnter
            .append("text")
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("fill", "black")
            .attr("font-size", "12px");
          // .attr("font-weight", "bold");

          return nodeEnter;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    // Add text labels
    node
      .select("circle:nth-child(2)")
      .attr("fill", (d: NetworkNode) =>
        !d.isContainer
          ? isDarkMode
            ? "#FFFFFF"
            : "network-link-leather"
          : getEventColor(d.id),
      );

    node.select("text").text((d: NetworkNode) => (d.isContainer ? "I" : "C"));
    let selectedNode: NetworkNode | null = null;
    // Add tooltips
    const tooltipDiv = d3
      .select("body")
      .append("div")
      .attr(
        "class",
        "tooltip-leather fixed hidden p-4 rounded shadow-lg " +
          "bg-primary-0 dark:bg-primary-800 " +
          "border border-gray-200 dark:border-gray-800 " +
          "p-4 rounded shadow-lg border border-gray-200 dark:border-gray-800 " +
          "transition-colors duration-200",
      )
      .style("z-index", 1000);

    const renderTooltip = (d: NetworkNode, pageX: number, pageY: number) => {
      tooltipDiv
        .html(
          `
    <div class="space-y-2">
      <div class="font-bold text-base">${d.title}</div>
      <div class="text-gray-600 dark:text-gray-400 text-sm">
        ${d.type} (${d.isContainer ? "30040" : "30041"})
      </div>
      <div class="text-gray-600 dark:text-gray-400 text-sm overflow-hidden text-ellipsis">
        ID:
        ${d.id}
        ${d.naddr}
        ${d.nevent}

      </div>
      ${
        d.content
          ? `
        <div class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-40">
          ${d.content}
        </div>
      `
          : ""
      }
      ${
        selectedNode === d
          ? `
        <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Click node again to dismiss
        </div>
      `
          : ""
      }
    </div>
  `,
        )
        .style("left", `${pageX + 10}px`)
        .style("top", `${pageY - 10}px`);
    };
    node
      .on("mouseover", function (event, d) {
        if (!selectedNode) {
          tooltipDiv.style("display", "block");
          renderTooltip(d, event.pageX, event.pageY);
        }
      })
      .on("mousemove", function (event, d) {
        if (!selectedNode) {
          tooltipDiv.style("display", "block");
          renderTooltip(d, event.pageX, event.pageY);
        }
      })
      .on("mouseout", () => {
        if (!selectedNode) {
          tooltipDiv.style("display", "none");
        }
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        console.log("Clicked node", d);

        if (selectedNode === d) {
          selectedNode = null;
          tooltipDiv.style("display", "none");
        } else {
          selectedNode = d;
          tooltipDiv.style("display", "block");
          renderTooltip(d, event.pageX, event.pageY);
        }
      });

    // Handle simulation ticks
    simulation.on("tick", () => {
      nodes.forEach((node) => {
        applyGlobalLogGravity(node, width / 2, height / 2, simulation.alpha());
        applyConnectedGravity(node, links, simulation.alpha());
      });
      link.attr("d", (d) => {
        const dx = d.target.x! - d.source.x!;
        const dy = d.target.y! - d.source.y!;
        const angle = Math.atan2(dy, dx);

        const sourceGap = nodeRadius;
        const targetGap = nodeRadius + arrowDistance; // Increased gap for arrowhead

        const startX = d.source.x! + sourceGap * Math.cos(angle);
        const startY = d.source.y! + sourceGap * Math.sin(angle);
        const endX = d.target.x! - targetGap * Math.cos(angle);
        const endY = d.target.y! - targetGap * Math.sin(angle);

        return `M${startX},${startY}L${endX},${endY}`;
      });
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  }

  onMount(() => {
    isDarkMode = document.body.classList.contains("dark");
    // Add window resize listener
    const handleResize = () => {
      windowHeight = window.innerHeight;
    };

    // Initial resize
    windowHeight = window.innerHeight;
    window.addEventListener("resize", handleResize);

    // Watch for theme changes
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDarkMode = document.body.classList.contains("dark");
          if (newIsDarkMode !== isDarkMode) {
            isDarkMode = newIsDarkMode;
            // drawNetwork();
          }
        }
      });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = graphHeight;
      }

      // first remove all nodes and links
      d3.select(svg).selectAll("*").remove();
      drawNetwork();
    });

    // Start observers
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    resizeObserver.observe(container);
    // Clean up
    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
    };
  });
  // Reactive redaw
  $: {
    if (svg && events?.length) {
      drawNetwork();
    }
  }
</script>

<div
  class="flex flex-col w-full h-[calc(100vh-120px)] min-h-[400px] max-h-[900px] p-4 gap-4"
>
  <div class="h-[calc(100%-130px)] min-h-[300px]" bind:this={container}>
    <svg
      bind:this={svg}
      class="w-full h-full border border-gray-300 dark:border-gray-700 rounded"
    />
  </div>
  <!-- Legend -->
  <div class="leather-legend">
    <h3 class="text-lg font-bold mb-2 h-leather">Legend</h3>
    <ul class="legend-list">
      <li class="legend-item">
        <div class="legend-icon">
          <span
            class="legend-circle"
            style="background-color: hsl(200, 70%, 75%)"
          >
          </span>
          <span class="legend-letter">I</span>
        </div>
        <span>Index events (kind 30040) - Each with a unique pastel color</span>
      </li>

      <li class="legend-item">
        <div class="legend-icon">
          <span class="legend-circle content"></span>
          <span class="legend-letter">C</span>
        </div>
        <span>Content events (kind 30041) - Publication sections</span>
      </li>

      <li class="legend-item">
        <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
          <path d="M4 12h16M16 6l6 6-6 6" class="network-link-leather" />
        </svg>
        <span>Arrows indicate reading/sequence order</span>
      </li>
    </ul>
  </div>
</div>

<style>
  .legend-list {
    @apply list-disc pl-5 space-y-2 text-gray-800 dark:text-gray-300;
  }

  .legend-item {
    @apply flex items-center;
  }

  .legend-icon {
    @apply relative w-6 h-6 mr-2;
  }

  .legend-circle {
    @apply absolute inset-0 rounded-full border-2 border-black;
  }

  .legend-circle.content {
    @apply bg-gray-700 dark:bg-gray-300;
    background-color: #d6c1a8;
  }

  .legend-letter {
    @apply absolute inset-0 flex items-center justify-center text-black text-xs;
  }
</style>
