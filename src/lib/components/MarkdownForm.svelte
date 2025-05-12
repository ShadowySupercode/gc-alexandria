<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import EasyMDE from 'easymde';
  import 'easymde/dist/easymde.min.css';
  import { createEventDispatcher } from 'svelte';
  import { parseMarkdown } from '../utils/markdown/markdownItParser';
  import EmoticonPicker from './EmoticonPicker.svelte';
  import { Popover } from 'flowbite-svelte';

  const dispatch = createEventDispatcher();

  export let labelSubject = 'Subject';
  export let labelContent = 'Content';
  export let initialSubject = '';
  export let initialContent = '';
  export let submitLabel = 'Submit';
  export let showSubject = true;

  let subject = initialSubject;
  let content = initialContent;
  let submissionError = '';
  let easyMDE: EasyMDE | null = null;
  let textareaEl: HTMLTextAreaElement;
  let showHelp = false;
  let showEmojiPicker = false;
  let emojiButtonEl: HTMLButtonElement;

  const markdownHelp = `# Markdown Guide

## Text Formatting
- **Bold**: \`*text*\` or \`**text**\`
- **Italic**: \`_text_\` or \`__text__\`
- **Strikethrough**: \`~text~\` or \`~~text~~\`
- **Inline Code**: \`\` \`code\` \`\`
- **Links**: \`[text](url)\`
- **Images**: \`![alt](url)\`

## Structure
- **Headings**: 
  - \`# Heading 1\` through \`###### Heading 6\`
  - Or:
    \`\`\`
    Heading 1
    ========
    
    Heading 2
    ---------
    \`\`\`
- **Lists**:
  - Unordered: \`- item\`, \`* item\`, or \`+ item\`
  - Ordered: \`1. item\`, \`2. item\`
- **Code Blocks**:
  \`\`\`javascript
  \`\`\`language
  const code = 'example';
  \`\`\`
  \`\`\`
- **Blockquotes**: \`> Quote text\`
- **Tables**:
  \`\`\`
  | Header 1 | Header 2 |
  |----------|----------|
  | Cell 1   | Cell 2   |
  \`\`\`

## Special Features
- **Footnotes**: \`[^1]\` and \`[^1]: definition\`
- **Emojis**: \`:smile:\`
- **Hashtags**: \`#tag\`
- **Nostr Identifiers**: 
  - Profiles: \`npub...\` or \`nprofile...\`
  - Notes: \`note...\`, \`nevent...\`, or \`naddr...\`

## Media Support
- **YouTube Videos**: Automatically embedded
- **Video Files**: mp4, webm, mov, avi
- **Audio Files**: mp3, wav, ogg, m4a
- **Images**: jpg, jpeg, gif, png, webp

All media URLs are automatically cleaned of tracking parameters for privacy.`;

  let helpContent = '';

  async function toggleHelp() {
    showHelp = !showHelp;
    if (showHelp) {
      helpContent = await parseMarkdown(markdownHelp);
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if ((showSubject && !subject) || !content) {
      submissionError = 'Please fill in all fields';
      return;
    }
    // Emit submit event with markdown content
    dispatch('submit', { subject, content });
  }

  function insertEmoji(shortcode: string) {
    if (easyMDE) {
      const cm = easyMDE.codemirror;
      const doc = cm.getDoc();
      const cursor = doc.getCursor();
      doc.replaceRange(shortcode, cursor);
      showEmojiPicker = false;
    }
  }

  onMount(() => {
    easyMDE = new EasyMDE({
      element: textareaEl,
      initialValue: content,
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', '|',
        {
          name: 'emoji',
          action: () => showEmojiPicker = !showEmojiPicker,
          className: 'fa fa-heart',
          title: 'Insert Emoji',
          icon: `<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor' class='w-5 h-5'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M11.995 21.003c-.512 0-1.023-.195-1.414-.586l-7.003-7.003a5.002 5.002 0 017.072-7.072l.345.345.345-.345a5.002 5.002 0 017.072 7.072l-7.003 7.003a1.997 1.997 0 01-1.414.586z'/></svg>`
        },
        '|',
        'preview', 'side-by-side', 'fullscreen', '|',
        'guide'
      ],
      status: false,
      spellChecker: false,
      previewRender: (text: string, previewElement: HTMLElement) => {
        parseMarkdown(text).then(html => {
          previewElement.innerHTML = html;
        });
        return null;
      }
    });

    if (easyMDE) {
      easyMDE.codemirror.on('change', () => {
        content = easyMDE!.value();
      });
    }
  });

  onDestroy(() => {
    if (easyMDE) {
      easyMDE.toTextArea();
    }
  });
</script>

<form class="contact-form" on:submit={handleSubmit}>
  <div class="flex justify-between items-center mb-4">
    <div class="flex-1">
      {#if showSubject}
        <div>
          <label for="subject" class="mb-2">{labelSubject}</label>
          <input id="subject" class="contact-form-input" bind:value={subject} required />
        </div>
      {/if}
    </div>
    <button 
      type="button" 
      class="btn-secondary btn-sm ml-4" 
      on:click={toggleHelp}
      title="Markdown Help"
    >
      ?
    </button>
  </div>
  <div class="relative">
    <label for="content" class="mb-2">{labelContent}</label>
    <textarea bind:this={textareaEl} class="hidden"></textarea>
    {#if showEmojiPicker}
      <Popover
        class="emoji-picker-popover"
        placement="bottom"
        trigger="click"
        open={showEmojiPicker}
        on:clickoutside={() => showEmojiPicker = false}
      >
        <EmoticonPicker on:select={({ detail }) => insertEmoji(detail.shortcode)} />
      </Popover>
    {/if}
  </div>
  {#if showHelp}
    <div class="mt-4 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 prose dark:prose-invert max-w-none">
      {@html helpContent}
    </div>
  {/if}
  <div class="contact-form-actions">
    <button type="button" on:click={() => { subject = ''; content = ''; submissionError = ''; }}>
      Clear Form
    </button>
    <button type="submit">{submitLabel}</button>
  </div>
  {#if submissionError}
    <div class="contact-form-error" role="alert">
      {submissionError}
    </div>
  {/if}
</form>

<style>
  :global(.EasyMDEContainer) {
    @apply border border-gray-300 dark:border-gray-600 rounded-lg;
  }
  
  :global(.EasyMDEContainer .CodeMirror) {
    @apply bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-300;
  }
  
  :global(.EasyMDEContainer .editor-toolbar) {
    @apply border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700;
  }
  
  :global(.EasyMDEContainer .editor-toolbar button) {
    @apply text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white;
  }
  
  :global(.EasyMDEContainer .editor-toolbar button.active) {
    @apply text-primary-600 dark:text-primary-400;
  }
  
  :global(.EasyMDEContainer .editor-preview) {
    @apply bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-300;
  }
  
  :global(.emoji-button) {
    @apply p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded;
  }
  
  :global(.emoji-picker-popover) {
    @apply z-50;
  }
</style>