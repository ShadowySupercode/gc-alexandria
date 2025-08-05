# Implementation Plan: LessWrong-Style Table of Contents for Alexandria

## Overview
This plan outlines the implementation of a LessWrong-inspired table of contents for Alexandria that provides an unobtrusive, timeline-style navigation experience.

## Design Goals
1. **Desktop Experience**: Vertical timeline to the left of content with dots for sections, expanding on hover
2. **Mobile Experience**: Hidden by default with a button to slide out a sidebar
3. **Dynamic Updates**: Adjusts as content loads progressively
4. **Visual Consistency**: Follows existing Alexandria styling patterns
5. **Performance**: Minimal impact on page performance

## Technical Approach

### 1. Component Architecture
- Create new `TimelineTableOfContents.svelte` component
- Maintain existing `TableOfContents.svelte` for backward compatibility
- Update `Publication.svelte` to conditionally use the new component

### 2. Key Features

#### Desktop Timeline View
- **Position**: Fixed position to the left of the publication content
- **Visual Design**: 
  - Vertical line with dots representing sections
  - Dot spacing proportional to section word count/length
  - Hover to reveal section titles
  - Current section highlighting
  - Scroll progress indicator

#### Mobile Sidebar View
- **Trigger**: Button in top-left corner
- **Behavior**: Slide-out sidebar from left
- **Dismiss**: Click outside to close
- **Content**: Full section listing with hierarchical structure

#### Progressive Enhancement
- **Dynamic Updates**: As new sections load, timeline updates
- **Scroll Tracking**: Active section highlighting based on viewport
- **Performance**: Intersection Observer for efficient scroll tracking

### 3. Data Integration
- Leverage existing `table_of_contents.svelte.ts` data structure
- Use existing `TocEntry` interface
- Maintain compatibility with current ToC functionality

### 4. Styling Strategy
- Extend existing CSS patterns (`leather`, `btn-leather`, etc.)
- Use Tailwind utilities for responsive design
- Add new CSS classes for timeline-specific styling
- Respect dark/light theme patterns

## Implementation Steps

### Phase 1: Core Timeline Component
1. Create `TimelineTableOfContents.svelte`
2. Implement basic timeline structure
3. Add hover interactions
4. Integrate with existing ToC data

### Phase 2: Mobile Experience  
1. Add mobile detection utilities
2. Implement sidebar behavior
3. Add toggle button
4. Handle outside-click dismissal

### Phase 3: Dynamic Features
1. Implement scroll progress tracking
2. Add dynamic section spacing
3. Handle progressive content loading
4. Optimize performance

### Phase 4: Integration
1. Update `Publication.svelte`
2. Add feature toggles
3. Maintain backward compatibility
4. Update related components

### Phase 5: Testing & Polish
1. Test across breakpoints
2. Verify performance
3. Code review
4. Documentation

## File Changes

### New Files
- `src/lib/components/publications/TimelineTableOfContents.svelte`

### Modified Files
- `src/lib/components/publications/Publication.svelte`
- `src/app.css` (new styles)
- `src/lib/stores.ts` (if needed for mobile state)

### Considerations
- Maintain existing ToC functionality for compatibility
- Preserve current visual styling patterns
- Ensure accessibility compliance
- Optimize for performance with large publications
- Handle edge cases (no sections, single section, etc.)

## Success Criteria
1. Desktop timeline matches LessWrong visual design
2. Mobile sidebar provides intuitive navigation
3. Smooth transitions and interactions
4. No performance degradation
5. Compatible with existing features
6. Responsive across all screen sizes