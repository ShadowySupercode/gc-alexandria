<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  export let events: NDKEvent[] = [];

  let svg: SVGSVGElement;
  let isDarkMode = false;
  const nodeRadius = 20;
  const linkDistance = 1;
  const arrowDistance = 3;
  const warmupClickEnergy = 0.9; // Energy to restart simulation on drag
  let container: HTMLDivElement;

  let width: number;
  let height: number;
  let windowHeight: number;

  $: graphHeight = windowHeight ? Math.max(windowHeight * 0.2, 400) : 400;

  $: if (container) {
    width = container.clientWidth || 1000;
    height = container.clientHeight || 600;
  }
  interface NetworkNode extends d3.SimulationNodeDatum {
    id: string;
    event?: NDKEvent;
    index?: number;
    isContainer: boolean;
    title: string;
    content: string;
    author: string;
    type: "Index" | "Content";
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
  }

  interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
    source: NetworkNode;
    target: NetworkNode;
    isSequential: boolean;
  }
  function createEventMap(events: NDKEvent[]): Map<string, NDKEvent> {
    return new Map(events.map((event) => [event.id, event]));
  }
  const logGravity = (alpha: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const gravityStrength = 0.1; // Adjustable parameter

    return function (d: NetworkNode) {
      const dx = d.x! - centerX;
      const dy = d.y! - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0) return;

      // Logarithmic falloff - force gets stronger the further out you go
      const force = Math.log(distance + 1) * gravityStrength * alpha;

      d.vx! -= (dx / distance) * force;
      d.vy! -= (dy / distance) * force;
    };
  };

  function getNode(
    id: string,
    nodeMap: Map<string, NetworkNode>,
    event?: NDKEvent,
    index?: number,
  ): NetworkNode | null {
    if (!id) return null;

    if (!nodeMap.has(id)) {
      const node: NetworkNode = {
        id,
        event,
        index,
        isContainer: event?.kind === 30040,
        title: event?.getMatchingTags("title")?.[0]?.[1] || "Untitled",
        content: event?.content || "",
        author: event?.pubkey || "",
        type: event?.kind === 30040 ? "Index" : "Content",
      };
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

  function generateGraph(events: NDKEvent[]): {
    nodes: NetworkNode[];
    links: NetworkLink[];
  } {
    const nodes: NetworkNode[] = [];
    const links: NetworkLink[] = [];
    const nodeMap = new Map<string, NetworkNode>();

    // Create event lookup map - O(n) operation done once
    const eventMap = createEventMap(events);

    const indexEvents = events.filter((e) => e.kind === 30040);

    indexEvents.forEach((index) => {
      if (!index.id) return;

      const contentRefs = index.getMatchingTags("e");
      const sourceNode = getNode(index.id, nodeMap, index);
      if (!sourceNode) return;
      nodes.push(sourceNode);

      contentRefs.forEach((tag, idx) => {
        if (!tag[1]) return;

        // O(1) lookup instead of O(n) search
        const targetEvent = eventMap.get(tag[1]);
        if (!targetEvent) return;

        const targetNode = getNode(tag[1], nodeMap, targetEvent, idx);
        if (!targetNode) return;
        nodes.push(targetNode);

        const prevNodeId =
          idx === 0 ? sourceNode.id : contentRefs[idx - 1]?.[1];
        const prevNode = nodeMap.get(prevNodeId);

        if (prevNode && targetNode) {
          links.push({
            source: prevNode,
            target: targetNode,
            isSequential: true,
          });
        }
      });
    });

    return { nodes, links };
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

    const { nodes, links } = generateGraph(events);
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
          .distance(linkDistance),
      )
      .force("gravity", logGravity)
      .force("collide", d3.forceCollide<NetworkNode>().radius(nodeRadius * 4));
    // .force("charge", d3.forceManyBody<NetworkNode>().strength(-1000))
    // .force("center", d3.forceCenter(width / 2, height / 2))
    // .force("x", d3.forceX<NetworkNode>(width / 2).strength(0.1))
    // .force("y", d3.forceY<NetworkNode>(height / 2).strength(0.1))
    // .force(
    //   "collision",
    //   d3.forceCollide<NetworkNode>().radius(nodeRadius * 2),
    // );
    simulation.on("end", () => {
      // Get the bounds of the graph
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const dx = bounds.width;
        const dy = bounds.height;
        const x = bounds.x;
        const y = bounds.y;

        // Calculate scale to fit
        const scale = 1.25 / Math.max(dx / width, dy / height);
        const translate = [
          width / 2 - scale * (x + dx / 2),
          height / 2 - scale * (y + dy / 2),
        ];

        // Apply the initial transform
        svgElement
          .transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
          );
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

    // Let's verify the links are being created
    console.log(
      "Number of paths created:",
      document.querySelectorAll("path").length,
    );
    console.log(
      "Paths with marker-end:",
      document.querySelectorAll("path[marker-end]").length,
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
    // Add tooltips
    const tooltip = d3
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

    node
      .on("mouseover", function (event, d) {
        tooltip
          .style("display", "block")
          .html(
            `
            <div class="space-y-2">
              <div class="font-bold text-base">${d.title}</div>
              <div class="text-gray-600 dark:text-gray-400 text-sm">
                ${d.type} (${d.isContainer ? "30040" : "30041"})
              </div>
              <div class="text-gray-600 dark:text-gray-400 text-sm overflow-hidden text-ellipsis">
                ID: ${d.id}
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
            </div>
          `,
          )
          .style("left", event.pageX - 10 + "px")
          .style("top", event.pageY + 10 + "px");
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      });

    // Handle simulation ticks
    simulation.on("tick", () => {
      logGravity(simulation.alpha())(nodes);
      link.attr("d", (d) => {
        const dx = d.target.x! - d.source.x!;
        const dy = d.target.y! - d.source.y!;
        const angle = Math.atan2(dy, dx);

        // Adjust these values to fine-tune the gap
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
  console.log("Marker definition:", document.querySelector("defs marker"));
  console.log("Path with marker:", document.querySelector("path[marker-end]"));

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
