# ABC Music Notation Integration

**Status**: Phase 2 Complete ✅ | Phase 3 Ready
**Owner**: Alexandria Development Team
**Last Updated**: 2025-09-29

## Overview

This directory contains documentation for integrating ABC music notation rendering and playback into Alexandria's document reader and editor. ABC notation is a text-based music notation system that can be rendered as sheet music and played as audio in web browsers.

## Documentation

### 1. [ABCJS Reference](./abcjs-reference.md)

Comprehensive reference for the abcjs library (v6.5.2), covering:
- Installation and setup
- Visual rendering API
- Interactive editor creation
- Audio synthesis and playback
- Integration patterns for Svelte
- Performance considerations
- Common issues and solutions

**Target Audience**: Developers implementing ABC features
**Status**: Complete ✅

### 2. [ABC Integration Design](./abc-integration-design.md)

Detailed design document for ABC notation integration into Alexandria, including:
- Architecture and data flow
- Implementation phases (MVP → Advanced features)
- Technical specifications
- Security and performance considerations
- Testing strategy
- Error handling
- Accessibility

**Target Audience**: Technical leads, implementers
**Status**: Complete ✅ (pending review)

## Quick Start

### What is ABC Notation?

ABC notation is a text-based music notation format. Example:

```abc
X:1
T:Example Tune
M:4/4
L:1/4
K:C
C D E F | G A B c |
```

This renders as standard sheet music and can be played as audio.

### Goals (Priority Order)

1. **Phase 1**: ✅ **COMPLETE** - Render ABC notation as sheet music in publications
2. **Phase 2**: ✅ **COMPLETE** - Add play/pause button for audio playback
3. **Phase 3**: 📋 **READY** - Advanced audio controls (loop, tempo, progress)
4. **Phase 4** (Future): Editor integration with live preview

### Implementation Roadmap

```
Phase 1: Visual Rendering (MVP) ✅ COMPLETE
    ↓
Phase 2: Basic Playback ✅ COMPLETE
    ↓
Phase 3: Advanced Audio 📋 READY
    ↓
Phase 4: Editor Integration
```

## Key Files

### Documentation
- `abcjs-reference.md` - Library reference ✅
- `abc-integration-design.md` - Integration design ✅
- `README.md` - This file ✅

### Implementation (Phase 1 - Complete)
- `src/lib/utils/markup/asciidoctorExtensions.ts` - ABC block registration ✅
- `src/lib/components/markup/ABCNotation.svelte` - Rendering component ✅
- `src/lib/utils/markup/advancedAsciidoctorPostProcessor.ts` - Post-processing ✅
- `src/lib/components/publications/PublicationSection.svelte` - Production rendering ✅
- `src/lib/components/ZettelEditor.svelte` - Editor preview support ✅
- `src/types/abcjs.d.ts` - TypeScript definitions ✅
- `src/routes/testabc/` - Test route with examples ✅
- `test_data/AsciidocFiles/testabc.adoc` - Test document ✅

### Tests (Future)
- `tests/unit/abc-notation.test.ts` - Component tests
- `tests/integration/abc-integration.test.ts` - Integration tests
- `tests/e2e/abc-playback.spec.ts` - E2E tests

## Usage

### For Authors

Add ABC notation to your publications using AsciiDoc:

```asciidoc
[source,abc]
----
X:1
T:My Tune
M:4/4
K:D
D2 A2 | B2 A2 | F2 E2 | D4 |
----
```

Or shorter syntax:

```asciidoc
[abc]
----
X:1
T:My Tune
M:4/4
K:D
D2 A2 | B2 A2 | F2 E2 | D4 |
----
```

### For Readers

- Sheet music renders automatically
- Click "Play" button to hear the tune (Phase 2 ✅)
- Click "Pause" to stop playback
- Audio loads on first play (brief delay for sound font download)
- Advanced controls (loop, tempo, progress) coming in Phase 3

## Technical Architecture

### Rendering Pipeline

```
AsciiDoc [abc] Block
    ↓
Extension Detection (asciidoctorExtensions.ts)
    ↓
HTML Generation with data-abc attribute
    ↓
Post-Processing (mount Svelte components)
    ↓
ABCNotation.svelte
    ↓
abcjs Library (lazy-loaded)
    ↓
Sheet Music SVG + Audio Playback
```

### Key Components

1. **Extension Layer**: Detects and marks ABC blocks
2. **Post-Processor**: Mounts Svelte components
3. **ABCNotation Component**: Renders music and handles playback
4. **abcjs Library**: Does the heavy lifting (render + audio)

## Dependencies

- **abcjs**: ^6.5.2 (to be installed)
- **Svelte 5**: For component framework
- **Asciidoctor**: For AsciiDoc parsing

## Resources

### Learning ABC Notation
- [ABC Notation Home](http://abcnotation.com/)
- [ABC Tutorial](https://abcnotation.com/learn)
- [Example Tunes](http://abcnotation.com/tunePage)

### ABCJS Library
- [Official Documentation](https://www.abcjs.net/)
- [GitHub Repository](https://github.com/paulrosen/abcjs)
- [Interactive Configurator](https://configurator.abcjs.net/interactive/)
- [Live Editor Demo](https://editor.drawthedots.com/)

### Alexandria Architecture
- `CLAUDE.md` - Project conventions
- `doc/architecture/` - Architecture documentation
- `src/lib/utils/markup/asciidoctorExtensions.ts` - Extension patterns

## Development Workflow

### Before Implementation

1. Review design document
2. Approve architecture
3. Address open questions
4. Create feature branch

### Implementation (Phase 1)

1. Install abcjs: `npm install --save abcjs`
2. Register ABC block in extensions
3. Create ABCNotation.svelte component
4. Add post-processing step
5. Write unit tests
6. Test with sample content
7. Create PR for review

### Testing

```bash
# Unit tests
npm test

# Type checking
npm run check

# E2E tests
npm run test:e2e

# Dev server with test content
npm run dev
```

## Security Considerations

- **Input Sanitization**: HTML escape ABC content
- **XSS Prevention**: Validate rendering output
- **Resource Loading**: Use trusted sound font sources
- **CSP Headers**: Configure for external audio resources

## Performance Notes

- **Lazy Loading**: abcjs loaded only when needed
- **Code Splitting**: ABCNotation component split from main bundle
- **Audio Optimization**: Reuse AudioContext, clean up resources
- **Responsive Rendering**: Music scales to container width

## Known Limitations

1. **Audio Context**: Requires user interaction to initialize (browser security) - ✅ Implemented
2. **Pause Functionality**: abcjs CreateSynth has basic pause/start support - ✅ Working in Phase 2
3. **Sound Fonts**: Requires network access for default fonts (brief delay on first play)
4. **Browser Support**: Audio requires modern browsers (Chrome 43+, Firefox 40+, Safari 9.1+)
5. **Playback End Detection**: No native "ended" event from abcjs (manual timing needed for auto-reset)

## Open Questions

See [Design Document - Open Questions](./abc-integration-design.md#open-questions) for current decisions and outstanding questions.

## Contributing

### Adding Features

1. Update design document with proposal
2. Get approval from team
3. Implement following Alexandria conventions
4. Write tests (unit + integration + e2e)
5. Update documentation
6. Create PR with clear description

### Reporting Issues

- Use GitHub issues with `[ABC]` prefix
- Include ABC notation sample
- Describe expected vs actual behavior
- Provide browser/OS information

## Changelog

### 2025-09-29 - Phase 1 Complete ✅
- ✅ Created documentation structure
- ✅ Completed abcjs reference document
- ✅ Completed integration design document
- ✅ Installed abcjs v6.5.2 dependency
- ✅ Implemented ABC block registration and tree processor
- ✅ Created ABCNotation.svelte component with lazy loading
- ✅ Added post-processing for client-side component mounting
- ✅ Integrated into PublicationSection.svelte (production)
- ✅ Integrated into ZettelEditor.svelte (editor preview)
- ✅ Created test route /testabc with 7 example tunes
- ✅ Supports both [abc] and [source,abc] block formats
- ✅ Works with multiple ABC blocks per section
- ✅ Proper title positioning and responsive rendering

### 2025-09-29 - Phase 2 Complete ✅
- ✅ Added play/pause button to ABCNotation.svelte
- ✅ Implemented audio synthesis using abcjs CreateSynth
- ✅ Implemented AudioContext initialization on user interaction
- ✅ Added loading states during audio initialization
- ✅ Tested audio playback in browser (Chromium)
- ✅ Updated post-processor to enable showControls prop
- ✅ Proper audio resource cleanup on component destroy
- ✅ Audio state management (playing, paused, loading)
- ✅ Updated documentation

---

**Status**: Phase 2 Complete ✅ | Phase 3 Ready 📋

**Phase 1 Accomplishments**:
- ABC notation renders as interactive SVG sheet music
- Works in editor preview, production publications, and test route
- Supports all standard ABC notation features
- Lazy loading and error handling implemented
- Comprehensive TypeScript definitions

**Phase 2 Accomplishments**:
- Play/pause audio playback for all ABC notation blocks
- Audio synthesis with abcjs CreateSynth API
- Browser-compliant AudioContext initialization (user gesture required)
- Loading spinner during audio initialization (sound font download)
- Clean audio resource management
- Independent playback for each ABC block
- Smooth state transitions (Play → Loading → Pause → Play)

**Next Steps (Phase 3)**:
1. Add loop/repeat toggle button
2. Add tempo/speed control slider
3. Add playback progress indicator
4. Add seek/scrub functionality
5. Visual cursor to highlight currently playing notes
6. Improved end-of-playback detection and auto-reset