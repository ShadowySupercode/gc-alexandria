<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  export let events: NDKEvent[] = [];

  let svg;
  let isDarkMode = false;
  const width = 1200;
  const height = 600;
  const nodeRadius = 20;
  const dragRadius = 45;
  const linkDistance = 120;

  function updateTheme() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle("dark");
    if (svg) drawNetwork();
  }

  function getEventColor(eventId: string): string {
    const num = parseInt(eventId.slice(0, 4), 16);
    const hue = num % 360;
    const saturation = 70;
    const lightness = 75;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  function generateGraph(events: NDKEvent[]) {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    function getNode(id: string, event?: NDKEvent, index?: number) {
      if (!id) return null;

      if (!nodeMap.has(id)) {
        const node = {
          id,
          event,
          index,
          isContainer: event?.kind === 30040,
          title: event?.getMatchingTags("title")?.[0]?.[1] || "Untitled",
          content: event?.content || "",
          author: event?.pubkey,
          type: event?.kind === 30040 ? "Index" : "Content",
        };
        nodes.push(node);
        nodeMap.set(id, node);
      }
      return nodeMap.get(id);
    }

    // Process index events first
    const indexEvents = events.filter((e) => e.kind === 30040);

    indexEvents.forEach((index) => {
      if (!index.id) return;

      const contentRefs = index.getMatchingTags("e");
      const sourceNode = getNode(index.id, index);
      if (!sourceNode) return;

      // Create a linear chain of content events
      contentRefs.forEach((tag, idx) => {
        if (!tag[1]) return;

        const targetEvent = events.find((e) => e.id === tag[1]);
        if (!targetEvent) return;

        const targetNode = getNode(tag[1], targetEvent, idx);
        if (!targetNode) return;

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

  function drawNetwork() {
    if (!svg || !events?.length) return;

    d3.select(svg).selectAll("*").remove();

    const { nodes, links } = generateGraph(events);
    if (!nodes.length) return;

    const svgElement = d3
      .select(svg)
      .attr(
        "class",
        "network-leather w-full border border-gray-300 dark:border-gray-700 rounded",
      )
      .attr("viewBox", [0, 0, width, height]);

    // Set up zoom behavior
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svgElement.call(zoom);

    const g = svgElement.append("g");

    // Force simulation setup
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(linkDistance),
      )
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1))
      .force("collision", d3.forceCollide().radius(nodeRadius * 2.5));

    // Define arrow marker with black fill
    const marker = g
      .append("defs")
      .selectAll("marker")
      .data(["arrowhead"])
      .join("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 20 20")
      .attr("refX", nodeRadius + 10)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto");

    marker
      .append("path")
      .attr("d", "M -8,-5 L 0, 0 L -8, 5 Z")
      .attr("class", "network-link-leather"); // Black fill for arrowhead

    // Create links
    const link = g
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("class", "network-link-leather")
      .attr("stroke-width", 2)
      .attr("fill", "none")
      .attr("marker-end", "url(#arrow)")
      .attr("fill", "none");

    // Create nodes
    const node = g
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "node network-node-leather")
      .call(
        d3
          .drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended),
      );

    // Add invisible larger circle for better drag handling
    node
      .append("circle")
      .attr("r", dragRadius)
      .attr("fill", "transparent")
      .style("cursor", "move");

    // Add visible node circle
    node
      .append("circle")
      .attr("r", nodeRadius)
      .attr("fill", (d) => {
        if (!d.isContainer) {
          return isDarkMode ? "#342718" : "#d6c1a8"; // primary-800 : primary-100
        }
        return getEventColor(d.id);
      })
      .attr("stroke", "#000000") // Black outline for all nodes
      .attr("stroke-width", 2);

    // Add text labels
    node
      .append("text")
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#000000") // Always black
      .attr("font-size", "12px")
      .attr("font-weight", "bold") // Making it bold for better contrast
      .text((d) => (d.isContainer ? "I" : "C"));

    // Add tooltips
    const tooltip = d3
      .select("body")
      .append("div")
      .attr(
        "class",
        "fixed hidden bg-primary-0 dark:bg-primary-1000 " +
          "text-gray-800 dark:text-gray-300 " +
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
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
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
      link.attr("d", (d) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const angle = Math.atan2(dy, dx);

        // Adjust start and end points to prevent overlap with nodes
        const startX = d.source.x + nodeRadius * Math.cos(angle);
        const startY = d.source.y + nodeRadius * Math.sin(angle);
        const endX = d.target.x - nodeRadius * Math.cos(angle);
        const endY = d.target.y - nodeRadius * Math.sin(angle);

        return `M${startX},${startY}L${endX},${endY}`;
      });
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Drag handlers
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }

  $: {
    if (svg && events?.length) {
      drawNetwork();
    }
  }

  onMount(() => {
    isDarkMode = document.body.classList.contains("dark");

    // Watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDarkMode = document.body.classList.contains("dark");
          if (newIsDarkMode !== isDarkMode) {
            isDarkMode = newIsDarkMode;
            drawNetwork();
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  });
</script>

# /lib/components/EventNetwork.svelte
<div class="w-full">
  <svg
    bind:this={svg}
    class="w-full border border-gray-300 dark:border-gray-700 rounded"
    {width}
    {height}
  />
  <div
    class="mt-4 p-4 bg-primary-0 dark:bg-primary-1000 rounded-lg shadow border border-gray-200 dark:border-gray-800"
  >
    <h3 class="text-lg font-bold mb-2 text-gray-800 dark:text-gray-300">
      Legend
    </h3>
    <ul class="list-disc pl-5 space-y-2 text-gray-800 dark:text-gray-300">
      <li class="flex items-center">
        <div class="relative w-6 h-6 mr-2">
          <!-- Increased size to match network -->
          <span
            class="absolute inset-0 rounded-full border-2 border-black"
            style="background-color: hsl(200, 70%, 75%)"
          />
          <span
            class="absolute inset-0 flex items-center justify-center text-black"
            style="font-size: 12px;">I</span
          >
        </div>
        <span>Index events (kind 30040) - Each with a unique pastel color</span>
      </li>
      <li class="flex items-center">
        <div class="relative w-6 h-6 mr-2">
          <span
            class="absolute inset-0 rounded-full border-2 border-black bg-gray-700 dark:bg-gray-300"
            style="background-color: #d6c1a8"
          />
          <span
            class="absolute inset-0 flex items-center justify-center text-black"
            style="font-size: 12px;  ">C</span
          >
        </div>
        <span>Content events (kind 30041) - Publication sections</span>
      </li>
      <li class="flex items-center">
        <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24">
          <path
            d="M4 12h16M16 6l6 6-6 6"
            class="network-link-leather"
            stroke-width="2"
            stroke-linecap="round"
            marker-end="url(#arrowhead)"
          />
        </svg>
        <span>Arrows indicate reading/sequence order</span>
      </li>
    </ul>
  </div>
</div>

<style>
  :global(.network-link-leather) {
    @apply stroke-gray-400 dark:stroke-gray-600 fill-gray-400 dark:fill-gray-600;
  }

  :global(.text-leather) {
    @apply fill-gray-800 dark:fill-gray-300;
  }
</style>
