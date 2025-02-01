<!-- EventNetwork.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { levelsToRender } from "$lib/state";
  import { generateGraph, getEventColor } from "./utils/networkBuilder";
  import { createSimulation, setupDragHandlers, applyGlobalLogGravity, applyConnectedGravity } from "./utils/forceSimulation";
  import Legend from "./Legend.svelte";
  import NodeTooltip from "./NodeTooltip.svelte";

  let { events = [] } = $props<{ events?: NDKEvent[] }>();

  let svg: SVGSVGElement;
  let isDarkMode = $state(false);
  let container: HTMLDivElement;

  // Use a string ID for comparisons instead of the node object
  let selectedNodeId = $state<string | null>(null);
  let tooltipVisible = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipNode = $state<NetworkNode | null>(null);

  const nodeRadius = 20;
  const linkDistance = 10;
  const arrowDistance = 10;

  let width = $state(1000);
  let height = $state(600);
  let windowHeight = $state<number | undefined>(undefined);
  
  let simulation: d3.Simulation<NetworkNode, NetworkLink> | null = null;
  let svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;

  let graphHeight = $derived(windowHeight ? Math.max(windowHeight * 0.2, 400) : 400);

  // Update dimensions when container changes
  $effect(() => {
    if (container) {
      width = container.clientWidth || width;
      height = container.clientHeight || height;
    }
  });

  // Track levelsToRender changes
  let currentLevels = $derived(levelsToRender);

  function initializeGraph() {
    if (!svg) return;

    const svgElement = d3.select(svg)
      .attr("viewBox", `0 0 ${width} ${height}`);

    // Clear existing content
    svgElement.selectAll("*").remove();

    // Create main group for zoom
    svgGroup = svgElement.append("g");

    // Set up zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 9])
      .on("zoom", (event) => {
        svgGroup.attr("transform", event.transform);
      });

    svgElement.call(zoom);

    // Set up arrow marker
    const defs = svgElement.append("defs");
    defs
      .append("marker")
      .attr("id", "arrowhead")
      .attr("markerUnits", "strokeWidth")
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
      .attr("stroke-width", 1);
  }

  function updateGraph() {
    if (!svg || !events?.length || !svgGroup) return;

    const { nodes, links } = generateGraph(events, currentLevels);
    if (!nodes.length) return;

    // Stop any existing simulation
    if (simulation) simulation.stop();

    // Create new simulation
    simulation = createSimulation(nodes, links, nodeRadius, linkDistance);
    const dragHandler = setupDragHandlers(simulation);

    // Update links
    const link = svgGroup
      .selectAll<SVGPathElement, NetworkLink>("path.link")
      .data(links, d => `${d.source.id}-${d.target.id}`)
      .join(
        enter => enter
          .append("path")
          .attr("class", "link network-link-leather")
          .attr("stroke-width", 2)
          .attr("marker-end", "url(#arrowhead)"),
        update => update,
        exit => exit.remove()
      );

    // Update nodes
    const node = svgGroup
      .selectAll<SVGGElement, NetworkNode>("g.node")
      .data(nodes, d => d.id)
      .join(
        enter => {
          const nodeEnter = enter
            .append("g")
            .attr("class", "node network-node-leather")
            .call(dragHandler);

          nodeEnter
            .append("circle")
            .attr("class", "drag-circle")
            .attr("r", nodeRadius * 2.5)
            .attr("fill", "transparent")
            .attr("stroke", "transparent")
            .style("cursor", "move");

          nodeEnter
            .append("circle")
            .attr("class", "visual-circle")
            .attr("r", nodeRadius)
            .attr("stroke-width", 2);

          nodeEnter
            .append("text")
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("fill", "black")
            .attr("font-size", "12px");

          return nodeEnter;
        },
        update => update,
        exit => exit.remove()
      );

    // Update node appearances
    node.select("circle.visual-circle")
      .attr("class", d => !d.isContainer
        ? "visual-circle network-node-leather network-node-content"
        : "visual-circle network-node-leather"
      )
      .attr("fill", d => !d.isContainer
        ? isDarkMode ? "#FFFFFF" : "network-link-leather"
        : getEventColor(d.id)
      );

    node.select("text")
      .text(d => d.isContainer ? "I" : "C");

    // Update node interactions
    node
      .on("mouseover", (event, d) => {
        if (!selectedNodeId) {
          tooltipVisible = true;
          tooltipNode = d;
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        }
      })
      .on("mousemove", (event, d) => {
        if (!selectedNodeId) {
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        }
      })
      .on("mouseout", () => {
        if (!selectedNodeId) {
          tooltipVisible = false;
          tooltipNode = null;
        }
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (selectedNodeId === d.id) {
          selectedNodeId = null;
          tooltipVisible = false;
          tooltipNode = d;
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        } else {
          selectedNodeId = d.id;
          tooltipVisible = true;
          tooltipNode = d;
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        }
      });

    // Handle simulation ticks
    simulation.on("tick", () => {
      nodes.forEach(node => {
        applyGlobalLogGravity(node, width / 2, height / 2, simulation!.alpha());
        applyConnectedGravity(node, links, simulation!.alpha());
      });

      // Update positions
      link.attr("d", d => {
        const dx = d.target.x! - d.source.x!;
        const dy = d.target.y! - d.source.y!;
        const angle = Math.atan2(dy, dx);

        const sourceGap = nodeRadius;
        const targetGap = nodeRadius + arrowDistance;

        const startX = d.source.x! + sourceGap * Math.cos(angle);
        const startY = d.source.y! + sourceGap * Math.sin(angle);
        const endX = d.target.x! - targetGap * Math.cos(angle);
        const endY = d.target.y! - targetGap * Math.sin(angle);

        return `M${startX},${startY}L${endX},${endY}`;
      });

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
  }

  onMount(() => {
    isDarkMode = document.body.classList.contains("dark");
    
    // Initialize the graph structure
    initializeGraph();
    
    // Handle window resizing
    const handleResize = () => {
      windowHeight = window.innerHeight;
    };
    windowHeight = window.innerHeight;
    window.addEventListener("resize", handleResize);

    // Watch for theme changes
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDarkMode = document.body.classList.contains("dark");
          if (newIsDarkMode !== isDarkMode) {
            isDarkMode = newIsDarkMode;
            // Update node colors when theme changes
            if (svgGroup) {
              svgGroup.selectAll<SVGGElement, NetworkNode>("g.node")
                .select("circle.visual-circle")
                .attr("fill", d => !d.isContainer
                  ? newIsDarkMode ? "#FFFFFF" : "network-link-leather"
                  : getEventColor(d.id)
                );
            }
          }
        }
      });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = graphHeight;
      }
      if (svg) {
        d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);
        // Trigger simulation to adjust to new dimensions
        if (simulation) {
          simulation.alpha(0.3).restart();
        }
      }
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    resizeObserver.observe(container);
    
    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (simulation) simulation.stop();
    };
  });

  // Watch for changes that should trigger a graph update
  $effect(() => {
    if (svg && events?.length) {
      // Include currentLevels in the effect dependencies
      const _ = currentLevels;
      updateGraph();
    }
  });
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

  {#if tooltipVisible && tooltipNode}
    <NodeTooltip
      node={tooltipNode}
      selected={tooltipNode.id === selectedNodeId}
      x={tooltipX}
      y={tooltipY}
    />
  {/if}

  <Legend />
</div>

<style>
  .tooltip {
    max-width: 300px;
    word-wrap: break-word;
  }
</style>