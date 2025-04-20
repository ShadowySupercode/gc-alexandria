/**
 * Process inline code
 */
function processInlineCode(text: string): string {
  return text.replace(INLINE_CODE_REGEX, (match, code) => {
    return `<code class="bg-gray-200 dark:bg-gray-800/80 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700">${code}</code>`;
  });
}

// Regular expressions for markdown elements
const BOLD_REGEX = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
const ITALIC_REGEX = /_([^_]+)_/g;
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;
const ALTERNATE_HEADING_REGEX = /^(.+)\n([=]{3,}|-{3,})$/gm;
const HORIZONTAL_RULE_REGEX = /^(?:---|\*\*\*|___)$/gm;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;
const HASHTAG_REGEX = /(?<!\S)#([a-zA-Z0-9_]+)(?!\S)/g;
const FOOTNOTE_REFERENCE_REGEX = /\[(\^[^\]]+)\]/g;
const FOOTNOTE_DEFINITION_REGEX = /^\[(\^[^\]]+)\]:\s*(.+?)(?:\n(?!\[)|\n\n|$)/gm;
const TABLE_REGEX = /^\|(.+)\|\r?\n\|([-|\s]+)\|\r?\n((?:\|.+\|\r?\n?)+)$/gm;
const TABLE_ROW_REGEX = /^\|(.+)\|$/gm;
const TABLE_DELIMITER_REGEX = /^[\s-]+$/;

// ... existing code ... 