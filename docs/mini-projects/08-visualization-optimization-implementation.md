# Visualization Optimization Implementation Guide

**Component**: `/src/lib/navigator/EventNetwork/index.svelte`  
**Author**: Claude Agent 3 (Master Coordinator)  
**Date**: January 6, 2025

## Implementation Details

### 1. Update Type System

The core of the optimization is a discriminated union type that categorizes parameter changes:

```typescript
type UpdateType = 
  | { kind: 'full'; reason: string }
  | { kind: 'structural'; reason: string; params: Set<string> }
  | { kind: 'visual'; params: Set<string> };
```

### 2. Parameter Tracking

Track current and previous parameter values to detect changes:

```typescript
let lastUpdateParams = $state<UpdateParams>({
  events: events,
  eventCount: events?.length || 0,
  levels: currentLevels,
  star: starVisualization,
  tags: showTagAnchors,
  tagType: selectedTagType,
  disabledCount: disabledTags.size,
  tagExpansion: tagExpansionDepth,
  theme: isDarkMode
});
```

### 3. Change Detection

The update detection has been extracted to a utility module:

```typescript
import { 
  type UpdateType, 
  type UpdateParams,
  detectChanges, 
  detectUpdateType as detectUpdateTypeUtil,
  logUpdateType 
} from "$lib/utils/updateDetection";
```

### 4. Visual Properties Update Function

The optimized update function that modifies existing elements:

```typescript
function updateVisualProperties() {
  const startTime = performance.now();
  debug("updateVisualProperties called");
  
  if (!svgGroup || !simulation || !nodes.length) {
    debug("Cannot update visual properties - missing required elements");
    return;
  }

  // Update simulation forces based on star mode
  if (starVisualization) {
    simulation
      .force("charge", d3.forceManyBody().strength(-300))
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(LINK_DISTANCE))
      .force("radial", d3.forceRadial(200, width / 2, height / 2))
      .force("center", null);
  } else {
    simulation
      .force("charge", d3.forceManyBody().strength(-500))
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(LINK_DISTANCE))
      .force("radial", null)
      .force("center", d3.forceCenter(width / 2, height / 2));
  }

  // Update node appearances in-place
  svgGroup.selectAll("g.node")
    .select("circle.visual-circle")
    .attr("class", (d: NetworkNode) => {
      // Class updates for star mode
    })
    .attr("r", (d: NetworkNode) => {
      // Radius updates
    })
    .attr("opacity", (d: NetworkNode) => {
      // Opacity for disabled tags
    })
    .attr("fill", (d: NetworkNode) => {
      // Color updates for theme changes
    });

  // Gentle restart
  simulation.alpha(0.3).restart();
  
  const updateTime = performance.now() - startTime;
  debug(`Visual properties updated in ${updateTime.toFixed(2)}ms`);
}
```

### 5. Update Routing

The main effect now routes updates based on type:

```typescript
$effect(() => {
  if (!svg || !events?.length) return;
  
  const currentParams: UpdateParams = {
    events, eventCount: events?.length || 0,
    levels: currentLevels, star: starVisualization,
    tags: showTagAnchors, tagType: selectedTagType,
    disabledCount: disabledTags.size,
    tagExpansion: tagExpansionDepth, theme: isDarkMode
  };
  
  // Detect changes
  changedParams = detectChanges(lastUpdateParams, currentParams);
  
  if (changedParams.size === 0) {
    debug("No parameter changes detected");
    return;
  }
  
  // Determine update type
  const updateType = detectUpdateType(changedParams);
  logUpdateType(updateType, changedParams); // Production logging
  
  // Update last parameters immediately
  lastUpdateParams = { ...currentParams };
  
  // Route to appropriate update
  if (updateType.kind === 'full') {
    performUpdate(updateType); // Immediate
  } else {
    debouncedPerformUpdate(updateType); // Debounced
  }
});
```

### 6. Debouncing

Intelligent debouncing prevents update storms:

```typescript
const debouncedPerformUpdate = debounce(performUpdate, 150);

function performUpdate(updateType: UpdateType) {
  try {
    switch (updateType.kind) {
      case 'full':
        updateGraph();
        break;
        
      case 'structural':
        updateGraph(); // TODO: updateGraphStructure()
        break;
        
      case 'visual':
        if (updateType.params.has('star') || 
            updateType.params.has('disabledCount') ||
            updateType.params.has('theme')) {
          updateVisualProperties();
        } else {
          updateGraph(); // Fallback
        }
        break;
    }
  } catch (error) {
    console.error("Error in performUpdate:", error);
    errorMessage = `Error updating graph: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

### 7. Theme Change Integration

Theme changes now use the optimized path:

```typescript
const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === "class") {
      const newIsDarkMode = document.body.classList.contains("dark");
      if (newIsDarkMode !== isDarkMode) {
        isDarkMode = newIsDarkMode;
        // The effect will detect this change and call updateVisualProperties()
      }
    }
  });
});
```

### 8. Component-Level State

Nodes and links are now persisted at component level:

```typescript
// Graph data - persisted between updates
let nodes = $state<NetworkNode[]>([]);
let links = $state<NetworkLink[]>([]);
```

## Performance Monitoring

Both update functions include timing:

```typescript
const startTime = performance.now();
// ... update logic ...
const updateTime = performance.now() - startTime;
debug(`Update completed in ${updateTime.toFixed(2)}ms`);
```

## Testing the Implementation

### Manual Testing

1. **Enable debug mode**: `const DEBUG = true;`
2. **Open browser console**
3. **Test scenarios**:
   - Toggle star mode rapidly
   - Click multiple tags in legend
   - Switch theme
   - Watch console for timing logs

### Expected Console Output

```
[EventNetwork] Update type detected: visual Changed params: star
[EventNetwork] Performing visual update for params: ["star"]
[EventNetwork] Visual properties updated in 15.23ms
```

### Performance Validation

- Visual updates should complete in <50ms
- No position jumps should occur
- Simulation should maintain momentum
- Rapid toggles should be batched

## Utility Module Structure

The change detection logic has been extracted to `/src/lib/utils/updateDetection.ts`:

```typescript
export interface UpdateParams {
  events: any;
  eventCount: number;
  levels: any;
  star: boolean;
  tags: boolean;
  tagType: string;
  disabledCount: number;
  tagExpansion: number;
  theme: boolean;
}

export function detectChanges(
  lastParams: UpdateParams, 
  currentParams: UpdateParams
): Set<string> {
  const changes = new Set<string>();
  for (const [key, value] of Object.entries(currentParams)) {
    if (value !== lastParams[key as keyof UpdateParams]) {
      changes.add(key);
    }
  }
  return changes;
}

export function detectUpdateType(changes: Set<string>): UpdateType {
  if (changes.has('events') || changes.has('eventCount') || changes.has('levels')) {
    return { kind: 'full', reason: 'Data or depth changed' };
  }
  
  if (changes.has('tags') || changes.has('tagType') || changes.has('tagExpansion')) {
    return { 
      kind: 'structural', 
      reason: 'Graph structure changed',
      params: changes
    };
  }
  
  return { kind: 'visual', params: changes };
}

export function logUpdateType(updateType: UpdateType, changedParams: Set<string>) {
  if (process.env.NODE_ENV === 'production') {
    console.log('[Visualization Update]', {
      type: updateType.kind,
      params: Array.from(changedParams),
      timestamp: new Date().toISOString()
    });
  }
}
```

## Migration Notes

For developers updating existing code:

1. **Import the utility module** for update detection
2. **Ensure nodes/links are at component level**
3. **Add theme to tracked parameters**
4. **Use the performUpdate function** for all updates
5. **Keep DEBUG = false in production**

## Troubleshooting

### Visual updates not working?
- Check that nodes/links are accessible
- Verify the parameter is in visual category
- Ensure simulation exists

### Updates seem delayed?
- Check debounce timing (150ms default)
- Data updates bypass debouncing

### Performance not improved?
- Verify DEBUG mode shows "visual update"
- Check browser console for errors
- Ensure not falling back to updateGraph()

---

*Implementation guide by Claude Agent 3*  
*Last updated: January 6, 2025*