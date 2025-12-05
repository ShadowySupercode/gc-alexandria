# NKBIP-01 Hierarchical Parsing Technical Plan

## Overview

This document outlines the complete restart plan for implementing NKBIP-01
compliant hierarchical AsciiDoc parsing using proper Asciidoctor tree processor
extensions.

## Current State Analysis

### Problems Identified

1. **Dual Architecture Conflict**: Two competing parsing implementations exist:
   - `publication_tree_factory.ts` - AST-first approach (currently used)
   - `publication_tree_extension.ts` - Extension approach (incomplete)

2. **Missing Proper Extension Registration**: Current code doesn't follow the
   official Asciidoctor extension pattern you provided

3. **Incomplete NKBIP-01 Compliance**: Testing with `deep_hierarchy_test.adoc`
   may not produce the exact structures shown in `docreference.md`

## NKBIP-01 Specification Summary

From `test_data/AsciidocFiles/docreference.md`:

### Event Types

- **30040**: Index events (collections/hierarchical containers)
- **30041**: Content events (actual article sections)

### Parse Level Behaviors

- **Level 2**: Only `==` sections → 30041 events (subsections included in
  content)
- **Level 3**: `==` → 30040 indices, `===` → 30041 content events
- **Level 4+**: Full hierarchy with each level becoming separate events

### Key Rules

1. If a section has subsections at target level → becomes 30040 index
2. If no subsections at target level → becomes 30041 content event
3. Content inclusion: 30041 events include all content below parse level
4. Hierarchical references: Parent indices use `a` tags to reference children

## Proposed Architecture

### Core Pattern: Asciidoctor Tree Processor Extension

Following the pattern you provided:

```javascript
// Extension registration pattern
module.exports = function (registry) {
  registry.treeProcessor(function () {
    var self = this;
    self.process(function (doc) {
      // Process document and build PublicationTree
      return doc;
    });
  });
};
```

### Implementation Components

1. **PublicationTreeProcessor** (`src/lib/utils/publication_tree_processor.ts`)
   - Implements the tree processor extension
   - Registers with Asciidoctor during document processing
   - Builds PublicationTree with NDK events during AST traversal
   - Returns result via closure to avoid Ruby compatibility issues

2. **Unified Parser Interface** (`src/lib/utils/asciidoc_publication_parser.ts`)
   - Single entry point for all parsing operations
   - Manages extension registration and cleanup
   - Provides clean API for ZettelEditor integration

3. **Enhanced ZettelEditor Integration**
   - Replace `publication_tree_factory.ts` usage
   - Use proper extension-based parsing
   - Maintain current preview and publishing workflow

## Technical Implementation Plan

### Phase 1: Core Tree Processor (`publication_tree_processor.ts`)

```typescript
export function registerPublicationTreeProcessor(
  registry: Registry,
  ndk: NDK,
  parseLevel: number,
  options?: ProcessorOptions,
): { getResult: () => ProcessorResult | null };
```

**Key Features:**

- Follows Asciidoctor extension pattern exactly
- Builds events during AST traversal (not after)
- Preserves original AsciiDoc content in events
- Handles all parse levels (2-7) with proper NKBIP-01 compliance
- Uses closure pattern to return results safely

### Phase 2: Unified Parser Interface (`asciidoc_publication_parser.ts`)

```typescript
export async function parseAsciiDocWithTree(
  content: string,
  ndk: NDK,
  parseLevel: number = 2,
): Promise<PublicationTreeResult>;
```

**Responsibilities:**

- Create Asciidoctor instance
- Register tree processor extension
- Execute parsing with extension
- Return PublicationTree and events
- Clean up resources

### Phase 3: ZettelEditor Integration

**Changes to `ZettelEditor.svelte`:**

- Replace `createPublicationTreeFromContent()` calls
- Use new `parseAsciiDocWithTree()` function
- Maintain existing preview/publishing interface
- No changes to component props or UI

### Phase 4: Validation Testing

**Test Suite:**

1. Parse `deep_hierarchy_test.adoc` at levels 2-7
2. Verify event structures match `docreference.md` examples
3. Validate content preservation and tag inheritance
4. Test publish workflow end-to-end

## File Organization

### Files to Create

1. `src/lib/utils/publication_tree_processor.ts` - Core tree processor extension
2. `src/lib/utils/asciidoc_publication_parser.ts` - Unified parser interface
3. `tests/unit/publication_tree_processor.test.ts` - Comprehensive test suite

### Files to Modify

1. `src/lib/components/ZettelEditor.svelte` - Update parsing calls
2. `src/routes/new/compose/+page.svelte` - Verify integration works

### Files to Remove (After Validation)

1. `src/lib/utils/publication_tree_factory.ts` - Replace with processor
2. `src/lib/utils/publication_tree_extension.ts` - Merge concepts into processor

## Success Criteria

1. **NKBIP-01 Compliance**: All parse levels produce structures exactly matching
   `docreference.md`
2. **Content Preservation**: Original AsciiDoc content preserved in events (not
   converted to HTML)
3. **Proper Extension Pattern**: Uses official Asciidoctor tree processor
   registration
4. **Zero Regression**: Current ZettelEditor functionality unchanged
5. **Performance**: No degradation in parsing or preview speed
6. **Test Coverage**: Comprehensive validation with `deep_hierarchy_test.adoc`

## Development Sequence

1. **Study & Plan** ✓ (Current phase)
2. **Implement Core Processor** - Create `publication_tree_processor.ts`
3. **Build Unified Interface** - Create `asciidoc_publication_parser.ts`
4. **Integrate with ZettelEditor** - Update parsing calls
5. **Validate with Test Documents** - Verify NKBIP-01 compliance
6. **Clean Up Legacy Code** - Remove old implementations
7. **Documentation & Testing** - Comprehensive test suite

## Risk Mitigation

- **Incremental Integration**: Keep old code until new implementation validated
- **Extensive Testing**: Use both test documents for validation
- **Performance Monitoring**: Ensure no degradation in user experience
- **Rollback Plan**: Can revert to `publication_tree_factory.ts` if needed

## References

- NKBIP-01 Specification: `test_data/AsciidocFiles/docreference.md`
- Test Document: `test_data/AsciidocFiles/deep_hierarchy_test.adoc`
- Asciidoctor Extensions:
  [Official Documentation](https://docs.asciidoctor.org/asciidoctor.js/latest/extend/extensions/)
- Current Implementation: `src/lib/components/ZettelEditor.svelte:64`
