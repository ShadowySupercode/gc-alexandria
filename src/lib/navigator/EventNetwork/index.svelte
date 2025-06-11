<!-- 
  EventNetwork Component
  
  A force-directed graph visualization of Nostr events, showing the relationships
  between index events and their content. This component handles the D3 force
  simulation, SVG rendering, and user interactions.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { levelsToRender } from "$lib/state";
  import { generateGraph, getEventColor } from "./utils/networkBuilder";
  import {
    generateStarGraph,
    applyStarLayout,
  } from "./utils/starNetworkBuilder";
  import {
    createStarSimulation,
    applyInitialStarPositions,
    createStarDragHandler,
  } from "./utils/starForceSimulation";
  import {
    createSimulation,
    setupDragHandlers,
    applyGlobalLogGravity,
    applyConnectedGravity,
    type Simulation,
  } from "./utils/forceSimulation";
  import Legend from "./Legend.svelte";
  import NodeTooltip from "./NodeTooltip.svelte";
  import type { NetworkNode, NetworkLink } from "./types";
  import Settings from "./Settings.svelte";
  import {
    enhanceGraphWithTags,
    getTagAnchorColor,
  } from "./utils/tagNetworkBuilder";
  import { Button } from "flowbite-svelte";

  // Type alias for D3 selections
  type Selection = any;

  // Configuration
  const DEBUG = false; // Set to true to enable debug logging
  const NODE_RADIUS = 20;
  const LINK_DISTANCE = 10;
  const ARROW_DISTANCE = 10;
  const CONTENT_COLOR_LIGHT = "#d6c1a8";
  const CONTENT_COLOR_DARK = "#FFFFFF";

  /**
   * Debug logging function that only logs when DEBUG is true
   */
  function debug(...args: any[]) {
    if (DEBUG) {
      console.log("[EventNetwork]", ...args);
    }
  }

  // Component props
  let { 
    events = [], 
    totalCount = 0,
    onupdate, 
    onTagExpansionChange,
    onFetchMissing = () => {} 
  } = $props<{
    events?: NDKEvent[];
    totalCount?: number;
    onupdate: () => void;
    onTagExpansionChange?: (depth: number, tags: string[]) => void;
    onFetchMissing?: (ids: string[]) => void;
  }>();

  // Error state
  let errorMessage = $state<string | null>(null);
  let hasError = $derived(!!errorMessage);

  // DOM references
  let svg: SVGSVGElement;
  let container: HTMLDivElement;

  // Theme state
  let isDarkMode = $state(false);

  // Tooltip state
  let selectedNodeId = $state<string | null>(null);
  let tooltipVisible = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipNode = $state<NetworkNode | null>(null);

  // Dimensions
  let width = $state(1000);
  let height = $state(600);
  let windowHeight = $state<number | undefined>(undefined);
  let graphHeight = $derived(
    windowHeight ? Math.max(windowHeight * 0.2, 400) : 400,
  );

  // D3 objects
  let simulation: Simulation<NetworkNode, NetworkLink> | null = null;
  let svgGroup: Selection;
  let zoomBehavior: any;
  let svgElement: Selection;
  
  // Position cache to preserve node positions across updates
  let nodePositions = new Map<string, { x: number; y: number; vx?: number; vy?: number }>();

  // Track current render level
  let currentLevels = $derived(levelsToRender);

  // Star visualization state (default to true)
  let starVisualization = $state(true);

  // Tag anchors state
  let showTagAnchors = $state(false);
  let selectedTagType = $state("t"); // Default to hashtags
  let tagAnchorInfo = $state<any[]>([]);
  let tagExpansionDepth = $state(0); // Default to no expansion
  
  // Store initial state to detect if component is being recreated
  let componentId = Math.random();
  debug("Component created with ID:", componentId);
  
  // Event counts by kind
  let eventCounts = $state<{ [kind: number]: number }>({});
  
  // Disabled tags state for interactive legend
  let disabledTags = $state(new Set<string>());

  // Debug function - call from browser console: window.debugTagAnchors()
  if (typeof window !== "undefined") {
    window.debugTagAnchors = () => {
      console.log("=== TAG ANCHOR DEBUG INFO ===");
      console.log("Tag Anchor Info:", tagAnchorInfo);
      console.log("Show Tag Anchors:", showTagAnchors);
      console.log("Selected Tag Type:", selectedTagType);
      const tagNodes = nodes.filter((n) => n.isTagAnchor);
      console.log("Tag Anchor Nodes:", tagNodes);
      console.log("Tag Types Found:", [
        ...new Set(tagNodes.map((n) => n.tagType)),
      ]);
      return tagAnchorInfo;
    };
  }

  // Update dimensions when container changes
  $effect(() => {
    if (container) {
      width = container.clientWidth || width;
      height = container.clientHeight || height;
    }
  });

  /**
   * Initializes the SVG graph structure
   * Sets up the SVG element, zoom behavior, and arrow marker
   */
  function initializeGraph() {
    debug("Initializing graph");
    if (!svg) {
      debug("SVG element not found");
      return;
    }

    debug("SVG dimensions", { width, height });
    const svgElement = d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);

    // Clear existing content
    svgElement.selectAll("*").remove();
    debug("Cleared SVG content");

    // Create main group for zoom
    svgGroup = svgElement.append("g");
    debug("Created SVG group");

    // Set up zoom behavior
    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.1, 9]) // Min/max zoom levels
      .on("zoom", (event: any) => {
        svgGroup.attr("transform", event.transform);
      });

    svgElement.call(zoomBehavior);

    // Set up arrow marker for links
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

  /**
   * Updates the graph with new data
   * Generates the graph from events, creates the simulation, and renders nodes and links
   */
  function updateGraph() {
    debug("updateGraph called", {
      eventCount: events?.length,
      starVisualization,
      showTagAnchors,
      selectedTagType,
      disabledTagsCount: disabledTags.size
    });
    errorMessage = null;

    // Create variables to hold our selections
    let link: any;
    let node: any;
    let dragHandler: any;
    let nodes: NetworkNode[] = [];
    let links: NetworkLink[] = [];

    try {
      // Validate required elements
      if (!svg) {
        throw new Error("SVG element not found");
      }

      if (!events?.length) {
        throw new Error("No events to render");
      }

      if (!svgGroup) {
        throw new Error("SVG group not found");
      }

      // Generate graph data from events
      debug("Generating graph with events", {
        eventCount: events.length,
        currentLevels,
        starVisualization,
        showTagAnchors,
      });

      let graphData = starVisualization
        ? generateStarGraph(events, Number(currentLevels))
        : generateGraph(events, Number(currentLevels));

      // Enhance with tag anchors if enabled
      if (showTagAnchors) {
        debug("Enhancing graph with tags", {
          selectedTagType,
          eventCount: events.length,
          width,
          height
        });
        
        graphData = enhanceGraphWithTags(
          graphData,
          events,
          selectedTagType,
          width,
          height,
        );

        // Extract tag anchor info for legend
        const tagAnchors = graphData.nodes.filter((n) => n.isTagAnchor);
        
        debug("Tag anchors created", {
          count: tagAnchors.length,
          anchors: tagAnchors
        });
        
        tagAnchorInfo = tagAnchors.map((n) => ({
            type: n.tagType,
            label: n.title,
            count: n.connectedNodes?.length || 0,
            color: getTagAnchorColor(n.tagType || ""),
          }));
      } else {
        tagAnchorInfo = [];
      }

      // Save current node positions before updating
      if (simulation && nodes.length > 0) {
        nodes.forEach(node => {
          if (node.x != null && node.y != null) {
            nodePositions.set(node.id, { 
              x: node.x, 
              y: node.y,
              vx: node.vx,
              vy: node.vy
            });
          }
        });
        debug("Saved positions for", nodePositions.size, "nodes");
      }

      nodes = graphData.nodes;
      links = graphData.links;
      
      // Filter out links to disabled tag anchors
      if (showTagAnchors && disabledTags.size > 0) {
        links = links.filter((link: NetworkLink) => {
          const source = link.source as NetworkNode;
          const target = link.target as NetworkNode;
          
          // Check if either node is a disabled tag anchor
          if (source.isTagAnchor) {
            const tagId = `${source.tagType}-${source.title}`;
            if (disabledTags.has(tagId)) return false;
          }
          if (target.isTagAnchor) {
            const tagId = `${target.tagType}-${target.title}`;
            if (disabledTags.has(tagId)) return false;
          }
          
          return true;
        });
        
        debug("Filtered links for disabled tags", {
          originalCount: graphData.links.length,
          filteredCount: links.length,
          disabledTags: Array.from(disabledTags)
        });
      }
      
      // Count events by kind
      const counts: { [kind: number]: number } = {};
      events.forEach((event: NDKEvent) => {
        if (event.kind !== undefined) {
          counts[event.kind] = (counts[event.kind] || 0) + 1;
        }
      });
      eventCounts = counts;
      
      // Restore positions for existing nodes
      let restoredCount = 0;
      nodes.forEach(node => {
        const savedPos = nodePositions.get(node.id);
        if (savedPos && !node.isTagAnchor) { // Don't restore tag anchor positions as they're fixed
          node.x = savedPos.x;
          node.y = savedPos.y;
          node.vx = savedPos.vx || 0;
          node.vy = savedPos.vy || 0;
          restoredCount++;
        }
      });

      debug("Generated graph data", {
        nodeCount: nodes.length,
        linkCount: links.length,
        restoredPositions: restoredCount
      });

      if (!nodes.length) {
        throw new Error("No nodes to render");
      }

      // Stop any existing simulation
      if (simulation) {
        debug("Stopping existing simulation");
        simulation.stop();
      }

      // Create new simulation
      debug("Creating new simulation");
      const hasRestoredPositions = restoredCount > 0;
      
      if (starVisualization) {
        // Use star-specific simulation
        simulation = createStarSimulation(nodes, links, width, height);
        // Apply initial star positioning only if we don't have restored positions
        if (!hasRestoredPositions) {
          applyInitialStarPositions(nodes, links, width, height);
        }
      } else {
        // Use regular simulation
        simulation = createSimulation(nodes, links, NODE_RADIUS, LINK_DISTANCE);
      }
      
      // Use gentler alpha for updates with restored positions
      if (hasRestoredPositions) {
        simulation.alpha(0.3); // Gentler restart
      }

      // Center the nodes when the simulation is done
      if (simulation) {
        simulation.on("end", () => {
          if (!starVisualization) {
            centerGraph();
          }
        });
      }

      // Create drag handler
      if (simulation) {
        dragHandler = starVisualization
          ? createStarDragHandler(simulation)
          : setupDragHandlers(simulation);
      }

      // Update links
      debug("Updating links");
      link = svgGroup
        .selectAll("path.link")
        .data(links, (d: NetworkLink) => `${d.source.id}-${d.target.id}`)
        .join(
          (enter: any) =>
            enter
              .append("path")
              .attr("class", "link network-link-leather")
              .attr("stroke-width", 2)
              .attr("marker-end", "url(#arrowhead)"),
          (update: any) => update,
          (exit: any) => exit.remove(),
        );

      // Update nodes
      debug("Updating nodes");
      node = svgGroup
        .selectAll("g.node")
        .data(nodes, (d: NetworkNode) => d.id)
        .join(
          (enter: any) => {
            const nodeEnter = enter
              .append("g")
              .attr("class", "node network-node-leather")
              .call(dragHandler);

            // Larger transparent circle for better drag handling
            nodeEnter
              .append("circle")
              .attr("class", "drag-circle")
              .attr("r", NODE_RADIUS * 2.5)
              .attr("fill", "transparent")
              .attr("stroke", "transparent")
              .style("cursor", "move");

            // Visible circle
            nodeEnter
              .append("circle")
              .attr("class", "visual-circle")
              .attr("r", NODE_RADIUS)
              .attr("stroke-width", 2);

            // Node label
            nodeEnter
              .append("text")
              .attr("dy", "0.35em")
              .attr("text-anchor", "middle")
              .attr("fill", "black")
              .attr("font-size", "12px")
              .attr("stroke", "none")
              .attr("font-weight", "bold")
              .style("pointer-events", "none");

            return nodeEnter;
          },
          (update: any) => update,
          (exit: any) => exit.remove(),
        );

      // Update node appearances
      debug("Updating node appearances");
      node
        .select("circle.visual-circle")
        .attr("class", (d: NetworkNode) => {
          const baseClasses = "visual-circle network-node-leather";
          if (d.isTagAnchor) {
            return `${baseClasses} tag-anchor-node`;
          }
          if (!d.isContainer) {
            return `${baseClasses} network-node-content`;
          }
          if (starVisualization && d.kind === 30040) {
            return `${baseClasses} star-center-node`;
          }
          return baseClasses;
        })
        .attr("fill", (d: NetworkNode) => {
          // Tag anchors get their specific colors
          if (d.isTagAnchor) {
            return getTagAnchorColor(d.tagType || "");
          }
          // Use consistent colors for both modes
          if (!d.isContainer) {
            return isDarkMode ? CONTENT_COLOR_DARK : CONTENT_COLOR_LIGHT;
          }
          // Index nodes get unique pastel colors in both modes
          return getEventColor(d.id);
        })
        .attr("opacity", (d: NetworkNode) => {
          // Dim disabled tag anchors
          if (d.isTagAnchor) {
            const tagId = `${d.tagType}-${d.title}`;
            return disabledTags.has(tagId) ? 0.3 : 1;
          }
          return 1;
        })
        .attr("r", (d: NetworkNode) => {
          // Tag anchors are smaller
          if (d.isTagAnchor) {
            return NODE_RADIUS * 0.75;
          }
          // Make star center nodes larger
          if (starVisualization && d.isContainer && d.kind === 30040) {
            return NODE_RADIUS * 1.5;
          }
          return NODE_RADIUS;
        })
        .attr("stroke-width", (d: NetworkNode) => {
          // Tag anchors have thicker stroke
          if (d.isTagAnchor) {
            return 3;
          }
          return 2;
        });

      node
        .select("text")
        .text((d: NetworkNode) => {
          // Tag anchors show abbreviated type
          if (d.isTagAnchor) {
            return d.tagType === "t" ? "#" : "T";
          }
          // Always use I for index and C for content
          return d.isContainer ? "I" : "C";
        })
        .attr("font-size", (d: NetworkNode) => {
          if (d.isTagAnchor) {
            return "10px";
          }
          if (starVisualization && d.isContainer && d.kind === 30040) {
            return "14px";
          }
          return "12px";
        })
        .attr("fill", (d: NetworkNode) => {
          // White text on tag anchors
          if (d.isTagAnchor) {
            return "white";
          }
          return "black";
        })
        .style("fill", (d: NetworkNode) => {
          // Force fill style for tag anchors
          if (d.isTagAnchor) {
            return "white";
          }
          return null;
        })
        .attr("stroke", "none")
        .style("stroke", "none");

      // Set up node interactions
      debug("Setting up node interactions");
      node
        .on("mouseover", (event: any, d: NetworkNode) => {
          if (!selectedNodeId) {
            tooltipVisible = true;
            tooltipNode = d;
            tooltipX = event.pageX;
            tooltipY = event.pageY;
          }
        })
        .on("mousemove", (event: any) => {
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
        .on("click", (event: any, d: NetworkNode) => {
          event.stopPropagation();
          if (selectedNodeId === d.id) {
            // Clicking the selected node again deselects it
            selectedNodeId = null;
            tooltipVisible = false;
          } else {
            // Select the node and show its tooltip
            selectedNodeId = d.id;
            tooltipVisible = true;
            tooltipNode = d;
            tooltipX = event.pageX;
            tooltipY = event.pageY;
          }
        });

      // Set up simulation tick handler
      debug("Setting up simulation tick handler");
      if (simulation) {
        simulation.on("tick", () => {
          // Apply custom forces to each node
          if (!starVisualization) {
            nodes.forEach((node) => {
              // Pull nodes toward the center
              applyGlobalLogGravity(
                node,
                width / 2,
                height / 2,
                simulation!.alpha(),
              );
              // Pull connected nodes toward each other
              applyConnectedGravity(node, links, simulation!.alpha());
            });
          }

          // Update link positions
          link.attr("d", (d: NetworkLink) => {
            // Calculate angle between source and target
            const dx = d.target.x! - d.source.x!;
            const dy = d.target.y! - d.source.y!;
            const angle = Math.atan2(dy, dx);

            // Calculate start and end points with offsets for node radius
            const sourceRadius =
              starVisualization &&
              d.source.isContainer &&
              d.source.kind === 30040
                ? NODE_RADIUS * 1.5
                : NODE_RADIUS;
            const targetRadius =
              starVisualization &&
              d.target.isContainer &&
              d.target.kind === 30040
                ? NODE_RADIUS * 1.5
                : NODE_RADIUS;

            const sourceGap = sourceRadius;
            const targetGap = targetRadius + ARROW_DISTANCE;

            const startX = d.source.x! + sourceGap * Math.cos(angle);
            const startY = d.source.y! + sourceGap * Math.sin(angle);
            const endX = d.target.x! - targetGap * Math.cos(angle);
            const endY = d.target.y! - targetGap * Math.sin(angle);

            return `M${startX},${startY}L${endX},${endY}`;
          });

          // Update node positions
          node.attr(
            "transform",
            (d: NetworkNode) => `translate(${d.x},${d.y})`,
          );
        });
      }
    } catch (error) {
      console.error("Error in updateGraph:", error);
      errorMessage = `Error updating graph: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Component lifecycle setup
   */
  onMount(() => {
    debug("Component mounted");
    try {
      // Detect initial theme
      isDarkMode = document.body.classList.contains("dark");

      // Initialize the graph structure
      initializeGraph();
    } catch (error) {
      console.error("Error in onMount:", error);
      errorMessage = `Error initializing graph: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Set up window resize handler
    const handleResize = () => {
      windowHeight = window.innerHeight;
    };
    windowHeight = window.innerHeight;
    window.addEventListener("resize", handleResize);

    // Set up theme change observer
    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const newIsDarkMode = document.body.classList.contains("dark");
          if (newIsDarkMode !== isDarkMode) {
            isDarkMode = newIsDarkMode;
            // Update node colors when theme changes
            if (svgGroup) {
              svgGroup
                .selectAll("g.node")
                .select("circle.visual-circle")
                .attr("fill", (d: NetworkNode) =>
                  !d.isContainer
                    ? newIsDarkMode
                      ? CONTENT_COLOR_DARK
                      : CONTENT_COLOR_LIGHT
                    : getEventColor(d.id),
                );
            }
          }
        }
      });
    });

    // Set up container resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width;
        height = graphHeight;
      }
      if (svg) {
        d3.select(svg).attr("viewBox", `0 0 ${width} ${height}`);
        // Restart simulation with new dimensions
        if (simulation) {
          simulation.alpha(0.3).restart();
        }
      }
    });

    // Start observers
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    resizeObserver.observe(container);

    // Clean up on component destruction
    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (simulation) simulation.stop();
    };
  });

  /**
   * Watch for changes that should trigger a graph update
   */
  $effect(() => {
    debug("Effect triggered", {
      hasSvg: !!svg,
      eventCount: events?.length,
      currentLevels,
    });

    try {
      if (svg && events?.length) {
        // Include all relevant state in the effect dependencies
        const _ = currentLevels;
        const __ = starVisualization;
        const ___ = showTagAnchors;
        const ____ = selectedTagType;
        const _____ = disabledTags.size;
        updateGraph();
      }
    } catch (error) {
      console.error("Error in effect:", error);
      errorMessage = `Error updating graph: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // Track previous values to avoid unnecessary calls
  let previousDepth = $state(0);
  let previousTagType = $state(selectedTagType);
  let isInitialized = $state(false);
  
  // Mark as initialized after first render
  $effect(() => {
    if (!isInitialized && svg) {
      isInitialized = true;
    }
  });
  
  /**
   * Watch for tag expansion depth changes
   */
  $effect(() => {
    // Skip if not initialized or no callback
    if (!isInitialized || !onTagExpansionChange) return;
    
    // Check if we need to trigger expansion
    const depthChanged = tagExpansionDepth !== previousDepth;
    const tagTypeChanged = selectedTagType !== previousTagType;
    const shouldExpand = showTagAnchors && (depthChanged || tagTypeChanged);
    
    if (shouldExpand) {
      previousDepth = tagExpansionDepth;
      previousTagType = selectedTagType;
      
      // Extract unique tags from current events
      const tags = new Set<string>();
      events.forEach(event => {
        const eventTags = event.getMatchingTags(selectedTagType);
        eventTags.forEach(tag => {
          if (tag[1]) tags.add(tag[1]);
        });
      });
      
      debug("Tag expansion requested", {
        depth: tagExpansionDepth,
        tagType: selectedTagType,
        tags: Array.from(tags),
        depthChanged,
        tagTypeChanged
      });
      
      onTagExpansionChange(tagExpansionDepth, Array.from(tags));
    }
  });

  /**
   * Handles tooltip close event
   */
  function handleTooltipClose() {
    tooltipVisible = false;
    selectedNodeId = null;
  }

  /**
   * Centers the graph in the viewport
   */
  function centerGraph() {
    if (svg && svgGroup && zoomBehavior) {
      const svgWidth = svg.clientWidth || width;
      const svgHeight = svg.clientHeight || height;

      // Reset zoom and center
      d3.select(svg)
        .transition()
        .duration(750)
        .call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(svgWidth / 2, svgHeight / 2).scale(0.8),
        );
    }
  }

  /**
   * Zooms in the graph
   */
  function zoomIn() {
    if (svg && zoomBehavior) {
      d3.select(svg).transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
    }
  }

  /**
   * Zooms out the graph
   */
  function zoomOut() {
    if (svg && zoomBehavior) {
      d3.select(svg).transition().duration(300).call(zoomBehavior.scaleBy, 0.7);
    }
  }

  /**
   * Legend interactions
   */
  let graphInteracted = $state(false);

  function handleGraphClick() {
    if (!graphInteracted) {
      graphInteracted = true;
    }
  }
  
  /**
   * Handles toggling tag visibility in the legend
   */
  function handleTagToggle(tagId: string) {
    const newDisabledTags = new Set(disabledTags);
    if (newDisabledTags.has(tagId)) {
      newDisabledTags.delete(tagId);
    } else {
      newDisabledTags.add(tagId);
    }
    disabledTags = newDisabledTags;
    
    // Trigger graph update to apply visibility changes
    updateGraph();
  }
</script>

<div class="network-container">
  {#if hasError}
    <div class="network-error">
      <h3 class="network-error-title">Error</h3>
      <p>{errorMessage}</p>
      <button
        class="network-error-retry"
        onclick={() => {
          errorMessage = null;
          updateGraph();
        }}
      >
        Retry
      </button>
    </div>
  {/if}

  <div class="network-svg-container" bind:this={container} role="figure">
    <Legend
      collapsedOnInteraction={graphInteracted}
      className=""
      starMode={starVisualization}
      showTags={showTagAnchors}
      tagAnchors={tagAnchorInfo}
      eventCounts={eventCounts}
      {disabledTags}
      onTagToggle={handleTagToggle}
    />

    <!-- Settings Panel (shown when settings button is clicked) -->
    <Settings
      count={events.length}
      {totalCount}
      {onupdate}
      {onFetchMissing}
      bind:starVisualization
      bind:showTagAnchors
      bind:selectedTagType
      bind:tagExpansionDepth
    />

    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg bind:this={svg} class="network-svg" onclick={handleGraphClick} />

    <!-- Zoom controls -->
    <div class="network-controls">
      <Button
        outline
        size="lg"
        class="network-control-button btn-leather rounded-lg p-2"
        onclick={zoomIn}
        aria-label="Zoom in"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </Button>
      <Button
        outline
        size="lg"
        class="network-control-button btn-leather rounded-lg p-2"
        onclick={zoomOut}
        aria-label="Zoom out"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </svg>
      </Button>
      <Button
        outline
        size="lg"
        class="network-control-button btn-leather rounded-lg p-2"
        onclick={centerGraph}
        aria-label="Center graph"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </Button>
    </div>
  </div>

  {#if tooltipVisible && tooltipNode}
    <NodeTooltip
      node={tooltipNode}
      selected={tooltipNode.id === selectedNodeId}
      x={tooltipX}
      y={tooltipY}
      onclose={handleTooltipClose}
      starMode={starVisualization}
    />
  {/if}
</div>
