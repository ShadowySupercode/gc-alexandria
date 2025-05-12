import { processNostrIdentifiers } from './nostrUtils';

// Regular expressions for basic markdown elements
const BOLD_REGEX = /(\*\*|[*])((?:[^*\n]|\*(?!\*))+)\1/g;
const ITALIC_REGEX = /\b(_[^_\n]+_|\b__[^_\n]+__)\b/g;
const STRIKETHROUGH_REGEX = /~~([^~\n]+)~~|~([^~\n]+)~/g;
const HASHTAG_REGEX = /(?<![^\s])#([a-zA-Z0-9_]+)(?!\w)/g;
const BLOCKQUOTE_REGEX = /^([ \t]*>[ \t]?.*)(?:\n\1[ \t]*(?!>).*)*$/gm;

// List regex patterns
const UNORDERED_LIST_REGEX = /^(\s*[-*+]\s+)(.*?)$/gm;
const ORDERED_LIST_REGEX = /^(\s*\d+\.\s+)(.*?)$/gm;

// Markdown patterns
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;

// URL patterns
const WSS_URL = /wss:\/\/[^\s<>"]+/g;
const DIRECT_LINK = /(?<!["'=])(https?:\/\/[^\s<>"]+)(?!["'])/g;

// Media URL patterns
const IMAGE_URL_REGEX = /https?:\/\/[^\s<]+\.(?:jpg|jpeg|gif|png|webp)(?:[^\s<]*)?/i;
const VIDEO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp4|webm|mov|avi)(?:[^\s<]*)?/i;
const AUDIO_URL_REGEX = /https?:\/\/[^\s<]+\.(?:mp3|wav|ogg|m4a)(?:[^\s<]*)?/i;
const YOUTUBE_URL_REGEX = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/i;


function processBasicFormatting(content: string): string {
  if (!content) return '';
  
  let processedText = content;
  
  try {
    // Process Markdown images first
    processedText = processedText.replace(MARKDOWN_IMAGE, (match, alt, url) => {
      if (YOUTUBE_URL_REGEX.test(url)) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          return `<iframe class="w-full aspect-video rounded-lg shadow-lg my-4" src="https://www.youtube-nocookie.com/embed/${videoId}" title="${alt || 'YouTube video'}" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
        }
      }
      
      if (VIDEO_URL_REGEX.test(url)) {
        return `<video controls class="max-w-full rounded-lg shadow-lg my-4" preload="none" playsinline><source src="${url}">${alt || 'Video'}</video>`;
      }
      
      if (AUDIO_URL_REGEX.test(url)) {
        return `<audio controls class="w-full my-4" preload="none"><source src="${url}">${alt || 'Audio'}</audio>`;
      }
      
      return `<img src="${url}" alt="${alt}" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async">`;
    });

    // Process Markdown links
    processedText = processedText.replace(MARKDOWN_LINK, (match, text, url) => 
      `<a href="${url}" class="text-primary-600 dark:text-primary-500 hover:underline" target="_blank" rel="noopener noreferrer">${text}</a>`
    );

    // Process WebSocket URLs
    processedText = processedText.replace(WSS_URL, match => {
      // Remove 'wss://' from the start and any trailing slashes
      const cleanUrl = match.slice(6).replace(/\/+$/, '');
      return `<a href="https://nostrudel.ninja/#/r/wss%3A%2F%2F${cleanUrl}%2F" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-500 hover:underline">${match}</a>`;
    });

    // Process direct media URLs
    processedText = processedText.replace(DIRECT_LINK, match => {
      if (YOUTUBE_URL_REGEX.test(match)) {
        const videoId = extractYouTubeVideoId(match);
        if (videoId) {
          return `<iframe class="w-full aspect-video rounded-lg shadow-lg my-4" src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video" frameborder="0" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" class="text-primary-600 dark:text-primary-500 hover:underline"></iframe>`;
        }
      }
      
      if (VIDEO_URL_REGEX.test(match)) {
        return `<video controls class="max-w-full rounded-lg shadow-lg my-4" preload="none" playsinline><source src="${match}">Your browser does not support the video tag.</video>`;
      }
      
      if (AUDIO_URL_REGEX.test(match)) {
        return `<audio controls class="w-full my-4" preload="none"><source src="${match}">Your browser does not support the audio tag.</audio>`;
      }
      
      if (IMAGE_URL_REGEX.test(match)) {
        return `<img src="${match}" alt="Embedded media" class="max-w-full h-auto rounded-lg shadow-lg my-4" loading="lazy" decoding="async">`;
      }
      
      return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">${match}</a>`;
    });
    
    // Process text formatting
    processedText = processedText.replace(BOLD_REGEX, '<strong>$2</strong>');
    processedText = processedText.replace(ITALIC_REGEX, match => {
      const text = match.replace(/^_+|_+$/g, '');
      return `<em>${text}</em>`;
    });
    processedText = processedText.replace(STRIKETHROUGH_REGEX, (match, doubleText, singleText) => {
      const text = doubleText || singleText;
      return `<del class="line-through">${text}</del>`;
    });

    // Process hashtags
    processedText = processedText.replace(HASHTAG_REGEX, '<span class="text-gray-500 dark:text-gray-400">#$1</span>');
  } catch (error) {
    console.error('Error in processBasicFormatting:', error);
  }

  return processedText;
}

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function processBlockquotes(content: string): string {
  try {
    if (!content) return '';
    
    return content.replace(BLOCKQUOTE_REGEX, match => {
      const lines = match.split('\n').map(line => {
        return line.replace(/^[ \t]*>[ \t]?/, '').trim();
      });
      
      return `<blockquote class="pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4">${
        lines.join('\n')
      }</blockquote>`;
    });
  } catch (error) {
    console.error('Error in processBlockquotes:', error);
    return content;
  }
}

export async function parseBasicMarkdown(text: string): Promise<string> {
  if (!text) return '';
  
  try {
    // Process basic text formatting first
    let processedText = processBasicFormatting(text);

    // Process lists - handle ordered lists first
    processedText = processedText
      // Process ordered lists
      .replace(ORDERED_LIST_REGEX, (match, marker, content) => {
        // Count leading spaces to determine nesting level
        const indent = marker.match(/^\s*/)[0].length;
        const extraIndent = indent > 0 ? ` ml-${indent * 4}` : '';
        return `<li class="py-2${extraIndent}">${content}</li>`;
      })
      .replace(/<li.*?>.*?<\/li>\n?/gs, '<ol class="list-decimal my-4 ml-8">$&</ol>')
      
      // Process unordered lists
      .replace(UNORDERED_LIST_REGEX, (match, marker, content) => {
        // Count leading spaces to determine nesting level
        const indent = marker.match(/^\s*/)[0].length;
        const extraIndent = indent > 0 ? ` ml-${indent * 4}` : '';
        return `<li class="py-2${extraIndent}">${content}</li>`;
      })
      .replace(/<li.*?>.*?<\/li>\n?/gs, '<ul class="list-disc my-4 ml-8">$&</ul>');
      
    // Process blockquotes
    processedText = processBlockquotes(processedText);
    
    // Process paragraphs - split by double newlines and wrap in p tags
    processedText = processedText
      .split(/\n\n+/)
      .map(para => para.trim())
      .filter(para => para.length > 0)
      .map(para => `<p class="my-4">${para}</p>`)
      .join('\n');

    // Process Nostr identifiers last
    processedText = await processNostrIdentifiers(processedText);

    return processedText;
  } catch (error) {
    console.error('Error in parseBasicMarkdown:', error);
    return `<div class="text-red-500">Error processing markdown: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
  }
}