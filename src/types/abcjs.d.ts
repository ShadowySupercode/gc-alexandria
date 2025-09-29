/**
 * TypeScript declarations for abcjs library
 * Based on abcjs v6.4.0
 *
 * AI-NOTE: These are minimal type definitions for the abcjs features we need.
 * Expand as needed when using additional abcjs functionality.
 */

declare module 'abcjs' {
  export interface RenderOptions {
    responsive?: 'resize' | string;
    scale?: number;
    staffwidth?: number;
    paddingtop?: number;
    paddingbottom?: number;
    paddingleft?: number;
    paddingright?: number;
    add_classes?: boolean;
    clickListener?: (abcElem: any, tuneNumber: number, classes: string, analysis: any, drag: any) => void;
    visualTranspose?: number;
    viewportHorizontal?: boolean;
    selectTypes?: string[];
    print?: boolean;
  }

  export interface ParseOptions {
    print?: boolean;
    header_only?: boolean;
    stop_on_warning?: boolean;
  }

  export interface SynthOptions {
    soundFontUrl?: string;
    sequenceCallback?: (visualObj: any, currentBeat: number, totalBeats: number) => void;
    callbackContext?: any;
    onEnded?: () => void;
  }

  export interface TimingCallbacks {
    beatCallback?: (beatNumber: number, totalBeats: number, lastMoment: number) => void;
    eventCallback?: (event: any) => void;
    lineEndCallback?: (info: any, event: any, lineEndTimings: any) => void;
  }

  export interface AudioBuffers {
    init(options: {
      soundFontUrl?: string;
      audioContext?: AudioContext;
      millisecondsPerMeasure?: number;
    }): Promise<void>;

    prime(): Promise<void>;

    load(midiBuffer: any): Promise<void>;
  }

  export interface SynthController {
    load(selector: string | HTMLElement, cursorControl: any | null, displayOptions: {
      displayPlay?: boolean;
      displayProgress?: boolean;
      displayWarp?: boolean;
      displayClock?: boolean;
      displayTempo?: boolean;
      displayLoop?: boolean;
      displayRestart?: boolean;
    }): void;

    play(): void;
    pause(): void;
    stop(): void;
    destroy(): void;

    setWarp(tempo: number): void;
    setTempo(bpm: number): void;
  }

  export interface CreateSynth {
    init(options: {
      visualObj: any;
      audioContext?: AudioContext;
      millisecondsPerMeasure?: number;
      options?: SynthOptions;
    }): Promise<void>;

    prime(): Promise<void>;

    audioBuffers: AudioBuffers;
  }

  export interface ParseResult {
    tune: any;
    warnings?: string[];
    errors?: string[];
  }

  export interface TuneObjectModel {
    lines: any[];
    metaText: {
      title?: string;
      composer?: string;
      tempo?: string;
      key?: string;
      meter?: string;
    };
  }

  // Main API functions
  export function renderAbc(
    output: string | HTMLElement,
    abc: string,
    params?: RenderOptions
  ): TuneObjectModel[];

  export function parseOnly(
    abc: string,
    params?: ParseOptions
  ): ParseResult[];

  export function startAnimation(
    outputElement: HTMLElement,
    tuneObject: TuneObjectModel,
    options?: {
      showCursor?: boolean;
      bpm?: number;
    }
  ): void;

  export function stopAnimation(): void;

  export function midi: {
    getMidiFile(abc: string, options?: any): string;
    download(abc: string, fileName?: string): void;
  };

  export namespace synth {
    export class CreateSynth implements CreateSynth {}
    export class SynthController implements SynthController {}
    export class AudioBuffers implements AudioBuffers {}

    export interface SynthSequence {
      addTrack(): void;
      setInstrument(track: number, instrument: number): void;
      appendNote(track: number, pitch: number, duration: number, volume?: number): void;
    }

    export function playEvent(
      pitch: number,
      durationInMeasures: number,
      volumeMultiplier?: number,
      audioBuffers?: AudioBuffers
    ): Promise<void>;

    export function activeAudioContext(): AudioContext | null;

    export function supportsAudio(): boolean;
  }

  export namespace animation {
    export function animate(
      paper: any,
      tuneObject: TuneObjectModel,
      options?: {
        showCursor?: boolean;
        bpm?: number;
        hideCurrentMeasure?: boolean;
        hideFinishedMeasures?: boolean;
      }
    ): void;
  }

  export namespace timing {
    export function setTiming(
      tuneObject: TuneObjectModel,
      options?: {
        qpm?: number;
        extraMeasuresAtBeginning?: number;
        beatCallback?: TimingCallbacks['beatCallback'];
        eventCallback?: TimingCallbacks['eventCallback'];
        lineEndCallback?: TimingCallbacks['lineEndCallback'];
      }
    ): void;
  }

  // Editor support
  export interface EditorParams {
    canvas_id?: string;
    warnings_id?: string;
    abcjsParams?: RenderOptions;
    midi_id?: string;
    midi_download_id?: string;
    generate_warnings?: boolean;
    gui?: boolean;
    indicate_changed?: boolean;
    onchange?: (editor: Editor) => void;
  }

  export class Editor {
    constructor(selector: string, options?: EditorParams);

    paramChanged(options: EditorParams): void;
    fireChanged(): void;
    setNotDirty(): void;
    isDirty(): boolean;
    render(): void;
    modelChanged(): void;
  }

  // Version info
  export const version: string;
}