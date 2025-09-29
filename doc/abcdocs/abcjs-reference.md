# ABCJS Library Reference

**Version**: 6.5.2 (latest as of research date)
**Official Documentation**: https://www.abcjs.net/
**GitHub**: https://github.com/paulrosen/abcjs
**NPM Package**: `abcjs`

## Overview

abcjs is an open-source JavaScript library for rendering ABC music notation as sheet music (SVG) and generating audio playback in the browser. It provides a complete solution for displaying and playing musical scores using the ABC notation standard.

## Installation

```bash
npm install --save abcjs
```

```javascript
// Import the library
import abcjs from "abcjs";

// Import audio player styles (required for audio features)
import 'abcjs/abcjs-audio.css';
```

### CDN Usage

```html
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.5.2/dist/abcjs-basic-min.js"></script>
```

When loaded via CDN, the library is available at `window.ABCJS`.

## Core Features

### 1. Visual Rendering (Static)

The `renderAbc` function converts ABC notation strings to visual sheet music (SVG).

```javascript
// Basic rendering
abcjs.renderAbc("targetDivId", abcString);

// With options
const tuneObjects = abcjs.renderAbc("paper", abcString, {
  responsive: "resize",
  scale: 1.0,
  staffwidth: 500,
  add_classes: true,
  viewportHorizontal: false
});

// Returns array of TuneObjectModel for further processing
```

**Parameters:**
- `output`: String (element ID) or HTMLElement where music will be rendered
- `abc`: String containing ABC notation
- `params`: Optional RenderOptions object

**Return Value:**
- Array of `TuneObjectModel` objects containing rendering details
- NOT guaranteed to be backwards compatible between versions

**Key RenderOptions:**
- `responsive`: 'resize' to make music responsive to container width
- `scale`: Zoom level (default 1.0)
- `staffwidth`: Width of staff in pixels
- `add_classes`: Add CSS classes to elements for styling
- `clickListener`: Callback when notes are clicked
- `visualTranspose`: Transpose music by semitones

### 2. Interactive Editor

Creates a live editor where ABC notation updates music in real-time.

```javascript
const editor = new abcjs.Editor("textareaId", {
  canvas_id: "paper",           // Where to render music
  warnings_id: "warnings",      // Where to display parse errors
  onchange: (tuneObject) => {   // Callback on text change
    console.log("ABC updated", tuneObject);
  },
  synth: {                      // Optional audio configuration
    el: "#audio",
    options: {
      displayLoop: true,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true
    }
  }
});
```

**Editor Methods:**
- `setReadOnly(bool)`: Toggle textarea editing
- `fireChanged()`: Manually trigger re-rendering
- `isDirty()`: Check if content has changed since last save
- `pause(bool)`: Stop/resume automatic rendering
- `paramChanged(abcjsParams)`: Update rendering parameters dynamically

### 3. Audio Synthesis & Playback

abcjs can generate and play MIDI-quality audio in the browser.

#### Browser Requirements
- Firefox 40+
- Safari 9.1+
- Edge 13+
- Chrome 43+
- Requires internet connection for default sound fonts

#### Basic Audio Setup

```javascript
// 1. Create synth instance
const synth = new abcjs.synth.CreateSynth();

// 2. Initialize with audio context and rendered tune
await synth.init({
  audioContext: new AudioContext(),
  visualObj: tuneObjects[0],  // From renderAbc return value
  options: {
    soundFontUrl: "https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/",
    pan: [-0.3, 0.3],           // Stereo panning
    voicesOff: false,
    sequenceCallback: (visualObj, currentBeat, totalBeats) => {
      // Track playback progress
    },
    onEnded: () => {
      console.log("Playback finished");
    }
  }
});

// 3. Prime the audio buffer
await synth.prime();

// 4. Start playback
synth.start();
```

#### SynthController (User Interface)

For a complete audio player with UI controls:

```javascript
const synthController = new abcjs.synth.SynthController();

synthController.load("#audioControlsContainer", cursorControl, {
  displayPlay: true,
  displayProgress: true,
  displayWarp: true,
  displayClock: true,
  displayTempo: true,
  displayLoop: true,
  displayRestart: true
});

// Programmatic control
synthController.play();
synthController.pause();
synthController.stop();
synthController.setWarp(1.2);      // Adjust tempo (1.0 = normal)
synthController.setTempo(120);     // Set BPM
synthController.destroy();         // Clean up resources
```

#### CursorControl (Visual Feedback)

Highlights the current note being played:

```javascript
const cursorControl = {
  onStart: () => {
    // Called when playback starts
  },
  onFinished: () => {
    // Called when playback ends
  },
  onBeat: (beatNumber, totalBeats, lastMoment) => {
    // Called on each beat
  },
  onEvent: (event) => {
    // Called on each note event
    // Can be used to highlight current note
  }
};
```

### 4. Parsing & Validation

Parse ABC notation without rendering:

```javascript
const results = abcjs.parseOnly(abcString, {
  print: false,
  header_only: false,
  stop_on_warning: false
});

results.forEach(result => {
  console.log("Tune:", result.tune);
  console.log("Warnings:", result.warnings);
  console.log("Errors:", result.errors);
});
```

### 5. MIDI Export

```javascript
// Generate MIDI file
const midiFile = abcjs.midi.getMidiFile(abcString);

// Trigger browser download
abcjs.midi.download(abcString, "my-tune.midi");
```

## ABC Notation Basics

ABC notation is a text-based music notation format. Here's a minimal example:

```abc
X:1
T:Example Tune
M:4/4
L:1/4
K:C
C D E F | G A B c |
```

**Key Headers:**
- `X:` - Reference number (required)
- `T:` - Title
- `M:` - Meter (time signature)
- `L:` - Default note length
- `K:` - Key signature (required, starts music)

**Notes:**
- `C D E F G A B c` - Ascending scale (lowercase = higher octave)
- `|` - Bar line
- `||` - Double bar line (section end)

**Durations:**
- `C2` - Double length
- `C/2` - Half length
- `C3/2` - 1.5x length

**Resources:**
- ABC notation standard: http://abcnotation.com/
- ABC tutorial: https://abcnotation.com/learn

## Integration Patterns

### Pattern 1: Static Display

Simplest use case - just show sheet music:

```html
<div id="notation"></div>
<script>
  abcjs.renderAbc("notation", "X:1\nK:C\nCDEF|");
</script>
```

### Pattern 2: Display + Simple Playback

Show music with basic play button:

```javascript
// Render
const visualObj = abcjs.renderAbc("paper", abcString)[0];

// Add audio
const synth = new abcjs.synth.CreateSynth();
await synth.init({
  audioContext: new AudioContext(),
  visualObj
});
await synth.prime();

// Play on button click
button.onclick = () => synth.start();
```

### Pattern 3: Full Interactive Editor

Live editor with audio:

```html
<textarea id="abc-input"></textarea>
<div id="sheet-music"></div>
<div id="audio-controls"></div>
<div id="warnings"></div>

<script>
  const editor = new abcjs.Editor("abc-input", {
    canvas_id: "sheet-music",
    warnings_id: "warnings",
    synth: {
      el: "#audio-controls",
      options: {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true
      }
    }
  });
</script>
```

### Pattern 4: Svelte Component Integration

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import abcjs from 'abcjs';

  let { abc = $bindable("X:1\nK:C\nCDEF|") } = $props();

  let paperDiv: HTMLDivElement;
  let visualObj: any;

  onMount(async () => {
    visualObj = abcjs.renderAbc(paperDiv, abc)[0];
  });

  function handlePlay() {
    // Audio setup code here
  }
</script>

<div bind:this={paperDiv}></div>
<button onclick={handlePlay}>Play</button>
```

## Performance Considerations

1. **Lazy Loading**: Import abcjs dynamically for better initial load times
2. **Audio Context**: Create AudioContext only when needed (user interaction required)
3. **Resource Cleanup**: Call `destroy()` on synth controllers when components unmount
4. **Sound Fonts**: Default sound fonts require network access; consider hosting locally
5. **Rendering**: Use `responsive: "resize"` for responsive layouts

## Common Issues & Solutions

### Issue: Audio doesn't play
**Solution**: Browsers require user interaction before AudioContext can be created. Ensure audio initialization happens after a user gesture (click, tap).

### Issue: Sound fonts fail to load
**Solution**: Check network connectivity. Consider hosting sound fonts locally and specifying custom `soundFontUrl`.

### Issue: Music is too small/large
**Solution**: Use `scale` option in renderAbc or `responsive: "resize"` for automatic sizing.

### Issue: Editor not updating
**Solution**: Ensure textarea has correct ID and `canvas_id` points to valid element.

## TypeScript Support

Type definitions are available at `/src/types/abcjs.d.ts` in the Alexandria codebase. Import as:

```typescript
import abcjs, {
  RenderOptions,
  TuneObjectModel,
  Editor,
  EditorParams
} from 'abcjs';
```

## Additional Resources

- **Official Docs**: https://paulrosen.github.io/abcjs/
- **Interactive Configurator**: https://configurator.abcjs.net/interactive/
- **Live Editor Demo**: https://editor.drawthedots.com/
- **ABC Notation Reference**: http://abcnotation.com/
- **Example Tunes**: http://abcnotation.com/tunePage
- **GitHub Issues**: https://github.com/paulrosen/abcjs/issues

## Version Notes

This reference is based on abcjs v6.5.2. The API is relatively stable, but check the official documentation for the latest features and breaking changes when upgrading.

**Note**: Return values from `renderAbc` are "NOT guaranteed to be backwards compatible" per official docs. Always test after upgrades.