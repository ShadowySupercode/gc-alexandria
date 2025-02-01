<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { levelsToRender } from "$lib/state";
  import { FeedType } from "$lib/consts";
  import type { NetworkNode, NetworkLink } from "./types";
  import { generateGraph, getEventColor } from "./graphUtils";
  import { createSimulation, setupDragHandlers, applyGlobalLogGravity, applyConnectedGravity } from "./forceUtils";
  import Legend from "./Legend.svelte";
  import NodeTooltip from "./NodeTooltip.svelte";

  export let events: NDKEvent[] = [];
  let feedType: FeedType = FeedType.StandardRelays;

  let svg: SVGSVGElement;
  let isDarkMode = false;
  let container: HTMLDivElement;

  let selectedNode: NetworkNode | null = null;
  let tooltipVisible = false;
  let tooltipX = 0;
  let tooltipY = 0;
  let tooltipNode: NetworkNode | null = null;

  const nodeRadius = 20;
  const linkDistance = 10;
  const arrowDistance = 10;

  let width: number = 1000;
  let height: number = 600;
  let windowHeight: number;

  $: graphHeight = windowHeight ? Math.max(windowHeight * 0.2, 400) : 400;

  $: if (container) {
    width = container.clientWidth || width;
    height = container.clientHeight || height;
  }

  function drawNetwork() {
    if (!svg || !events?.length) return;

    const { nodes, links } = generateGraph(events, $levelsToRender);
    if (!nodes.length) return;

    const svgElement = d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);
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
    }

    // Set up arrow marker
    svgElement.select("defs").remove();
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

    // Create simulation
    const simulation = createSimulation(nodes, links, nodeRadius, linkDistance);
    const dragHandler = setupDragHandlers(simulation);

    // Create links
    const link = g
      .selectAll("path")
      .data(links)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrowhead)")
            .attr("class", "network-link-leather"),
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

          // Drag circle
          nodeEnter
            .append("circle")
            .attr("r", nodeRadius * 2.5)
            .attr("fill", "transparent")
            .attr("stroke", "transparent")
            .style("cursor", "move");

          // Visual circle
          nodeEnter
            .append("circle")
            .attr("r", nodeRadius)
            .attr("class", (d: NetworkNode) =>
              !d.isContainer
                ? "network-node-leather network-node-content"
                : "network-node-leather",
            )
            .attr("stroke-width", 2);

          // Text labels
          nodeEnter
            .append("text")
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("fill", "black")
            .attr("font-size", "12px");

          return nodeEnter;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    // Update node colors
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

    // Handle tooltips and selection
    node
      .on("mouseover", function (event, d) {
        if (!selectedNode) {
          tooltipVisible = true;
          tooltipNode = d;
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        }
      })
      .on("mousemove", function (event, d) {
        if (!selectedNode) {
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        }
      })
      .on("mouseout", () => {
        if (!selectedNode) {
          tooltipVisible = false;
          tooltipNode = null;
        }
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        if (selectedNode === d) {
          selectedNode = null;
          tooltipVisible = false;
          tooltipNode = d;
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        } else {
          selectedNode = d;
          tooltipVisible = true;
          tooltipNode = d;
          tooltipX = event.pageX;
          tooltipY = event.pageY;
        }
      });

    // Handle simulation ticks
    simulation.on("tick", () => {
      nodes.forEach((node) => {
        applyGlobalLogGravity(node, width / 2, height / 2, simulation.alpha());
        applyConnectedGravity(node, links, simulation.alpha());
      });

      // Update link positions
      link.attr("d", (d) => {
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

      // Update node positions
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  }

  onMount(() => {
    isDarkMode = document.body.classList.contains("dark");
    
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
          }
        }
      });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = graphHeight;
      }
      d3.select(svg).selectAll("*").remove();
      drawNetwork();
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
    };
  });

  // Reactive redraw
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

  {#if tooltipVisible && tooltipNode}
    <NodeTooltip
      node={tooltipNode}
      selected={tooltipNode === selectedNode}
      x={tooltipX}
      y={tooltipY}
    />
  {/if}

  <Legend />
</div>