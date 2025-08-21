# Hierarchy Visualization Integration Plan

## Current State: NKBIP-01 Tree Processor Complete ✅

We have successfully implemented a proper Asciidoctor tree processor extension that:
- Registers as a real Asciidoctor extension using `registry.treeProcessor()`
- Processes documents during AST parsing with full access to `doc.getSections()`
- Implements hierarchical NKBIP-01 structure with 30040/30041 events
- Supports parse levels 2-5 with different event granularities
- Passes comprehensive tests validating the hierarchical structure

## Next Phase: ZettelEditor Integration

### Overview
Integrate the new hierarchical parser into ZettelEditor with visual hierarchy hints that show users exactly which sections will become which types of events at different parse levels - like text editor indent guides but for Nostr event structure.

### Phase 1: Core Integration (Essential)

#### 1.1 Update ZettelEditor Parser
- **Current**: Uses old `publication_tree_factory.ts` with flattened AST parsing
- **Target**: Switch to new `asciidoc_publication_parser.ts` with tree processor
- **Impact**: Enables real hierarchical 30040/30041 event structure

```typescript
// Change from:
import { createPublicationTreeFromContent } from "$lib/utils/publication_tree_factory";

// To:
import { parseAsciiDocWithTree } from "$lib/utils/asciidoc_publication_parser";
```

#### 1.2 Fix Parse Level Configuration
- Update `MAX_PARSE_LEVEL` from 6 to 5 in ZettelEditor.svelte:43
- Update parse level options to reflect new hierarchical structure descriptions

#### 1.3 Update Preview Panel
- Leverage `publicationResult.metadata.eventStructure` for accurate hierarchy display
- Show 30040 vs 30041 event types with different visual indicators
- Display parent-child relationships between index and content events

### Phase 2: Visual Hierarchy Indicators (High Impact)

#### 2.1 Editor Gutter Visualization
Add visual hints in the editor showing which sections will become events:

**Event Type Indicators:**
- 🔵 **Blue circle**: Sections that become 30040 index events
- 🟢 **Green circle**: Sections that become 30041 content events  
- 📝 **Text label**: "Index" or "Content" next to each section

**Parse Level Boundaries:**
- **Colored left border**: Different colors for each hierarchy level
- **Indent guides**: Visual lines showing nested structure
- **Level badges**: Small "L2", "L3", etc. indicators

#### 2.2 Real-time Parse Level Feedback
As user changes parse level dropdown:
- **Highlight changes**: Animate sections that change event type
- **Event count updates**: Show before/after event counts
- **Structure preview**: Mini-tree view showing resulting hierarchy

#### 2.3 Interactive Section Mapping
- **Hover effects**: Hover over section → highlight corresponding event in preview
- **Click navigation**: Click section title → jump to event preview
- **Relationship lines**: Visual connections between 30040 and their 30041 children

### Phase 3: Advanced Hierarchy Features (Polish)

#### 3.1 Smart Parse Level Suggestions
- **Auto-detect optimal level**: Analyze document structure and suggest best parse level
- **Level comparison**: Side-by-side view of different parse levels
- **Performance hints**: Show trade-offs (fewer vs more events)

#### 3.2 Enhanced Editor Features
- **Section folding**: Collapse/expand based on hierarchy
- **Quick level promotion**: Buttons to promote/demote section levels
- **Hierarchy outline**: Collapsible tree view in sidebar

#### 3.3 Event Relationship Visualization
- **Tree diagram**: Visual representation of 30040 → 30041 relationships
- **Event flow**: Show how events will be published and linked
- **Validation**: Check for proper NKBIP-01 compliance

### Phase 4: Advanced Interactions (Future)

#### 4.1 Drag & Drop Hierarchy Editing
- Drag sections to change hierarchy
- Visual feedback for valid drop targets
- Auto-update AsciiDoc markup

#### 4.2 Multi-level Preview
- Split preview showing multiple parse levels simultaneously
- Compare different parsing strategies
- Export options for different levels

## Technical Implementation Notes

### Key Data Structures
```typescript
// eventStructure provides complete hierarchy information
interface EventStructureNode {
  title: string;
  level: number;
  eventType: "index" | "content";
  eventKind: 30040 | 30041;
  dTag: string;
  children: EventStructureNode[];
}
```

### Integration Points
1. **Parser integration**: `parseAsciiDocWithTree()` in reactive effect
2. **Event structure**: Use `result.metadata.eventStructure` for visualization
3. **Real-time updates**: Svelte reactivity for immediate visual feedback
4. **Preview sync**: Coordinate editor and preview panel highlights

### CSS Hierarchy Indicators
```css
.section-level-2 { border-left: 4px solid #3b82f6; }  /* Blue */
.section-level-3 { border-left: 4px solid #10b981; }  /* Green */
.section-level-4 { border-left: 4px solid #f59e0b; }  /* Amber */
.section-level-5 { border-left: 4px solid #8b5cf6; }  /* Purple */

.event-type-index { background: rgba(59, 130, 246, 0.1); }   /* Light blue */
.event-type-content { background: rgba(16, 185, 129, 0.1); } /* Light green */
```

## Success Metrics

### Phase 1 (Essential)
- [ ] ZettelEditor uses new tree processor
- [ ] All existing functionality preserved
- [ ] Hierarchical events display correctly

### Phase 2 (High Impact)  
- [ ] Visual hierarchy indicators in editor
- [ ] Real-time parse level feedback
- [ ] Clear 30040 vs 30041 distinction

### Phase 3 (Polish)
- [ ] Smart parse level suggestions
- [ ] Enhanced editor interactions
- [ ] Event relationship visualization

## Migration Strategy

1. **Gradual rollout**: Implement phases sequentially
2. **Fallback compatibility**: Keep old factory as backup during transition
3. **User testing**: Validate hierarchy visualization with real users
4. **Performance monitoring**: Ensure real-time updates remain smooth

## Dependencies

- ✅ **NKBIP-01 tree processor**: Complete and tested
- ✅ **Parse level validation**: Levels 2-5 supported
- ✅ **Event structure metadata**: Available in `eventStructure` field
- ⏳ **ZettelEditor integration**: Next phase
- ⏳ **Visual design system**: Colors, icons, animations

---

**Ready to proceed with Phase 1: Core Integration**
The foundation is solid - we have a working tree processor extension that generates proper hierarchical NKBIP-01 events. Now we need to integrate it into the editor interface and add the visual hierarchy indicators that will make the event structure clear to users.