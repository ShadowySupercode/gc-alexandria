/**
 * Editor utilities for WYSIWYG and markup editing functionality
 */

import { defaultMarkupConverter } from './markup_converter';

export interface EditorUtilsConfig {
  editorRef: () => HTMLDivElement | undefined;
  content: () => string;
  setContent: (content: string) => void;
  showMarkup: () => boolean;
  markupText: () => string;
  setMarkupText: (markup: string) => void;
}

export function createEditorUtils(config: EditorUtilsConfig) {
  const { editorRef, content, setContent, showMarkup, markupText, setMarkupText } = config;

  let isEditorFocused = false;

  function getSelection() {
    const ref = editorRef();
    if (!ref) {
      console.log('getSelection - no editor ref');
      return null;
    }
    
    const selection = window.getSelection();
    console.log('getSelection - selection:', selection);
    if (!selection || selection.rangeCount === 0) {
      console.log('getSelection - no selection or rangeCount is 0');
      return null;
    }
    
    const range = selection.getRangeAt(0);
    const start = range.startOffset;
    const end = range.endOffset;
    
    console.log('getSelection - range:', range);
    console.log('getSelection - start:', start, 'end:', end);
    console.log('getSelection - startContainer:', range.startContainer);
    console.log('getSelection - endContainer:', range.endContainer);
    
    return { range, start, end };
  }

  function applyFormatting(tag: string, attributes: Record<string, string> = {}) {
    if (showMarkup()) {
      // In markup mode, apply markdown formatting
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        const selectedText = currentText.substring(start, end);
        
        if (selectedText) {
          let newText: string;
          const beforeCursor = currentText.substring(0, start);
          const afterCursor = currentText.substring(end);
          
          switch (tag) {
            case 'strong':
              newText = beforeCursor + `**${selectedText}**` + afterCursor;
              break;
            case 'em':
              newText = beforeCursor + `_${selectedText}_` + afterCursor;
              break;
            case 'del':
              newText = beforeCursor + `~~${selectedText}~~` + afterCursor;
              break;
            default:
              newText = beforeCursor + selectedText + afterCursor;
          }
          
          setMarkupText(newText);
          
          // Set cursor position to select the formatted text
          const newCursorPos = start + newText.length - currentText.length;
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start, newCursorPos);
          }, 10);
        }
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const selection = getSelection();
        if (!selection) return;

        const { range } = selection;
        const selectedText = range.toString();
        
        if (selectedText) {
          const element = document.createElement(tag);
          Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
          });
          element.textContent = selectedText;
          
          range.deleteContents();
          range.insertNode(element);
          
          updateContentFromEditor();
        }
      });
    }
  }

  function applyCodeFormatting() {
    if (showMarkup()) {
      // In markup mode, apply code formatting
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        const selectedText = currentText.substring(start, end);
        
        if (selectedText) {
          const beforeCursor = currentText.substring(0, start);
          const afterCursor = currentText.substring(end);
          const newText = beforeCursor + `\`${selectedText}\`` + afterCursor;
          
          setMarkupText(newText);
          
          // Set cursor position to select the formatted text
          const newCursorPos = start + newText.length - currentText.length;
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start, newCursorPos);
          }, 10);
        }
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const selection = getSelection();
        if (!selection) return;

        const { range } = selection;
        const selectedText = range.toString();
        
        if (selectedText) {
          const element = document.createElement('code');
          element.className = 'bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono';
          element.textContent = selectedText;
          
          range.deleteContents();
          range.insertNode(element);
          
          updateContentFromEditor();
        }
      });
    }
  }

  function insertLaTeX() {
    if (showMarkup()) {
      // In markup mode, insert LaTeX inline
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        const selectedText = currentText.substring(start, end);
        
        const beforeCursor = currentText.substring(0, start);
        const afterCursor = currentText.substring(end);
        
        let newText: string;
        if (selectedText) {
          newText = beforeCursor + `$${selectedText}$` + afterCursor;
        } else {
          newText = beforeCursor + `$...$` + afterCursor;
        }
        
        setMarkupText(newText);
        
        // Set cursor position
        const newCursorPos = selectedText ? start + newText.length - currentText.length : start + 4;
        const selectionStart = selectedText ? start : start + 1;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(selectionStart, newCursorPos);
        }, 10);
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const selection = getSelection();
        if (selection) {
          const { range } = selection;
          const selectedText = range.toString();
          
          if (selectedText) {
            const latexText = `$${selectedText}$`;
            range.deleteContents();
            range.insertNode(document.createTextNode(latexText));
          } else {
            const latexTemplate = `$...$`;
            range.insertNode(document.createTextNode(latexTemplate));
            range.setStart(range.startContainer, range.startOffset + 1);
            range.setEnd(range.endContainer, range.endOffset - 1);
          }
        } else {
          insertText('$...$');
        }
        updateContentFromEditor();
      });
    }
  }

  function insertDisplayLaTeX() {
    if (showMarkup()) {
      // In markup mode, insert LaTeX display
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        const selectedText = currentText.substring(start, end);
        
        const beforeCursor = currentText.substring(0, start);
        const afterCursor = currentText.substring(end);
        
        let newText: string;
        if (selectedText) {
          newText = beforeCursor + `$$${selectedText}$$` + afterCursor;
        } else {
          newText = beforeCursor + `$$...$$` + afterCursor;
        }
        
        setMarkupText(newText);
        
        // Set cursor position
        const newCursorPos = selectedText ? start + newText.length - currentText.length : start + 5;
        const selectionStart = selectedText ? start : start + 2;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(selectionStart, newCursorPos);
        }, 10);
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const selection = getSelection();
        if (selection) {
          const { range } = selection;
          const selectedText = range.toString();
          
          if (selectedText) {
            const latexText = `$$${selectedText}$$`;
            range.deleteContents();
            range.insertNode(document.createTextNode(latexText));
          } else {
            const latexTemplate = `$$...$$`;
            range.insertNode(document.createTextNode(latexTemplate));
            range.setStart(range.startContainer, range.startOffset + 2);
            range.setEnd(range.endContainer, range.endOffset - 2);
          }
        } else {
          insertText('$$...$$');
        }
        updateContentFromEditor();
      });
    }
  }

  function insertBlockquote() {
    if (showMarkup()) {
      // In markup mode, insert '> ' at cursor position in textarea
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        
        const beforeCursor = currentText.substring(0, start);
        const afterCursor = currentText.substring(end);
        const selectedText = currentText.substring(start, end);
        
        let newText: string;
        if (selectedText) {
          // If text is selected, wrap each line with '> '
          const lines = selectedText.split('\n');
          const quotedLines = lines.map(line => line ? `> ${line}` : '');
          newText = beforeCursor + quotedLines.join('\n') + afterCursor;
        } else {
          // If no text selected, just insert '> ' at cursor
          newText = beforeCursor + '> ' + afterCursor;
        }
        
        setMarkupText(newText);
        
        // Set cursor position after the inserted text
        const newCursorPos = selectedText ? start + newText.length - currentText.length : start + 2;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const selection = getSelection();
        if (selection) {
          const { range } = selection;
          const selectedText = range.toString();
          
          if (selectedText) {
            const blockquote = document.createElement('blockquote');
            blockquote.className = 'pl-4 border-l-4 border-gray-300 dark:border-gray-600 my-4';
            blockquote.textContent = selectedText;
            
            range.deleteContents();
            range.insertNode(blockquote);
          } else {
            insertText('> ');
          }
        } else {
          insertText('> ');
        }
        updateContentFromEditor();
      });
    }
  }

  function insertListItem(type: 'bullet' | 'numbered') {
    if (showMarkup()) {
      // In markup mode, insert list marker at cursor position in textarea
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        
        const beforeCursor = currentText.substring(0, start);
        const afterCursor = currentText.substring(end);
        const selectedText = currentText.substring(start, end);
        
        let newText: string;
        if (selectedText) {
          // If text is selected, wrap each line with list marker
          const lines = selectedText.split('\n');
          const prefix = type === 'bullet' ? '* ' : '1. ';
          const listLines = lines.map(line => line ? prefix + line : '');
          newText = beforeCursor + listLines.join('\n') + afterCursor;
        } else {
          // If no text selected, just insert list marker at cursor
          const prefix = type === 'bullet' ? '* ' : '1. ';
          newText = beforeCursor + prefix + afterCursor;
        }
        
        setMarkupText(newText);
        
        // Set cursor position after the inserted text
        const prefix = type === 'bullet' ? '* ' : '1. ';
        const newCursorPos = selectedText ? start + newText.length - currentText.length : start + prefix.length;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const selection = getSelection();
        if (selection) {
          const { range } = selection;
          const selectedText = range.toString();
          
          if (selectedText) {
            const listItem = document.createElement('li');
            listItem.className = 'list-disc ml-4';
            listItem.textContent = selectedText;
            
            const parentList = range.startContainer.parentElement?.closest('ul, ol');
            if (parentList) {
              parentList.appendChild(listItem);
            } else {
              const list = document.createElement(type === 'bullet' ? 'ul' : 'ol');
              list.className = type === 'bullet' ? 'list-disc ml-4' : 'list-decimal ml-4';
              list.appendChild(listItem);
              range.insertNode(list);
            }
          } else {
            const prefix = type === 'bullet' ? '* ' : '1. ';
            insertText(prefix);
          }
        } else {
          const prefix = type === 'bullet' ? '* ' : '1. ';
          insertText(prefix);
        }
        updateContentFromEditor();
      });
    }
  }

  /**
   * Waits for the editor to be available and then executes the provided function
   */
  function waitForEditorAndExecute(operation: () => void) {
    const ref = editorRef();
    if (ref) {
      operation();
    } else {
      // If editor is not available yet, wait a bit and try again
      console.log('Editor not available yet, retrying...');
      setTimeout(() => waitForEditorAndExecute(operation), 50);
    }
  }

  function insertText(text: string) {
    console.log('insertText called with:', text);
    
    if (showMarkup()) {
      // In markup mode, insert text at cursor position in textarea
      const textarea = document.querySelector('.markup-editor-container textarea') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = markupText();
        
        const beforeCursor = currentText.substring(0, start);
        const afterCursor = currentText.substring(end);
        
        const newText = beforeCursor + text + afterCursor;
        setMarkupText(newText);
        
        // Set cursor position after the inserted text
        const newCursorPos = start + text.length;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      }
    } else {
      // WYSIWYG mode - use existing logic
      waitForEditorAndExecute(() => {
        const ref = editorRef();
        console.log('insertText - editor ref:', ref);
        console.log('insertText - editor focused:', isEditorFocused);
        
        // Focus the editor first
        if (ref) {
          ref.focus();
          console.log('insertText - focused editor');
        }
        
        const selection = getSelection();
        if (!selection) {
          console.log('No selection, appending to content');
          setContent(content() + text);
          updateContentFromEditor();
          return;
        }

        console.log('Inserting at selection');
        const { range } = selection;
        console.log('insertText - range before insertion:', range.toString());
        range.deleteContents();
        
        // Check if we're in WYSIWYG mode and the text looks like markdown
        if (text.includes('![') || text.includes('[') || text.includes('**') || text.includes('_') || text.includes('`')) {
          // Convert markdown to HTML and insert as HTML
          const html = defaultMarkupConverter.convertMarkupToHtml(text);
          console.log('insertText - converted markdown to HTML:', html);
          
          // Create a temporary div to parse the HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          // Insert the HTML nodes
          while (tempDiv.firstChild) {
            range.insertNode(tempDiv.firstChild);
          }
        } else {
          // Insert as plain text
          range.insertNode(document.createTextNode(text));
        }
        
        console.log('insertText - range after insertion:', range.toString());
        
        updateContentFromEditor();
      });
    }
  }

  function updateContentFromEditor() {
    const ref = editorRef();
    if (ref) {
      const newContent = ref.innerHTML;
      console.log('updateContentFromEditor - newContent:', newContent);
      console.log('updateContentFromEditor - current content():', content());
      if (newContent !== content()) {
        console.log('updateContentFromEditor - updating content');
        setContent(newContent);
        setMarkupText(defaultMarkupConverter.convertHtmlToMarkup(newContent));
      } else {
        console.log('updateContentFromEditor - content unchanged');
      }
    } else {
      console.log('updateContentFromEditor - no editor ref');
    }
  }

  function setEditorFocused(focused: boolean) {
    isEditorFocused = focused;
  }

  function handleEditorKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'b':
          event.preventDefault();
          applyFormatting('strong');
          break;
        case 'i':
          event.preventDefault();
          applyFormatting('em');
          break;
        case 'u':
          event.preventDefault();
          applyFormatting('u');
          break;
      }
    } else if (event.key === 'Enter' && !showMarkup()) {
      // Auto-continuation for WYSIWYG mode
      const ref = editorRef();
      if (ref) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const currentNode = range.startContainer;
          
          // Check if we're at the end of a list item
          const listItem = currentNode.nodeType === Node.TEXT_NODE 
            ? currentNode.parentElement?.closest('li')
            : (currentNode as Element).closest('li');
          
          // Check if we're in a blockquote
          const blockquote = currentNode.nodeType === Node.TEXT_NODE 
            ? currentNode.parentElement?.closest('blockquote')
            : (currentNode as Element).closest('blockquote');
          
          if (listItem) {
            event.preventDefault();
            
            // Get the parent list
            const list = listItem.parentElement;
            if (list && (list.tagName === 'UL' || list.tagName === 'OL')) {
              // Create new list item
              const newListItem = document.createElement('li');
              newListItem.innerHTML = '<br>';
              
              // Insert after current item
              listItem.after(newListItem);
              
              // Set cursor to the new item
              const newRange = document.createRange();
              newRange.setStart(newListItem, 0);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
              
              updateContentFromEditor();
            }
          } else if (blockquote) {
            event.preventDefault();
            
            // Create new paragraph in blockquote
            const newP = document.createElement('p');
            newP.innerHTML = '<br>';
            
            // Insert after current paragraph
            const currentP = range.startContainer.nodeType === Node.TEXT_NODE 
              ? range.startContainer.parentElement
              : range.startContainer as Element;
            
            if (currentP && currentP.tagName === 'P') {
              currentP.after(newP);
            } else {
              blockquote.appendChild(newP);
            }
            
            // Set cursor to the new paragraph
            const newRange = document.createRange();
            newRange.setStart(newP, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            
            updateContentFromEditor();
          }
        }
      }
    }
  }

  function removeFormatting() {
    if (showMarkup()) {
      const newMarkup = markupText()
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/_(.*?)_/g, "$1")
        .replace(/~~(.*?)~~/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/\$([^$]+)\$/g, "$1")
        .replace(/\$\$([^$]+)\$\$/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/^>\s*/gm, "")
        .replace(/^•\s*/gm, "")
        .replace(/^\d+\.\s*/gm, "")
        .replace(/\[\[([^\]]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^---$/gm, "")
        .replace(/^\|.*\|$/gm, "")
        .replace(/\[\^([^\]]+)\]/g, "$1")
        .replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, "$2");
      setMarkupText(newMarkup);
      setContent(defaultMarkupConverter.convertMarkupToHtml(newMarkup));
    } else {
      waitForEditorAndExecute(() => {
        const ref = editorRef();
        if (ref) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = content();
          
          // Remove formatting elements but keep their text content
          const elementsToRemove = tempDiv.querySelectorAll('strong, em, u, del, code, a, blockquote, ul, ol, li, h1, h2, h3, h4, h5, h6, hr, table, thead, tbody, tr, th, td, sup');
          elementsToRemove.forEach(el => {
            const textNode = document.createTextNode(el.textContent || '');
            el.parentNode?.replaceChild(textNode, el);
          });
          
          // Clean up empty paragraphs and normalize whitespace
          let cleanedHtml = tempDiv.innerHTML
            .replace(/<p><\/p>/g, '')
            .replace(/<p>\s*<\/p>/g, '')
            .replace(/\n\s*\n/g, '\n')
            .trim();
          
          // If we have content, wrap it in paragraph tags
          if (cleanedHtml && !cleanedHtml.startsWith('<p>')) {
            cleanedHtml = `<p>${cleanedHtml}</p>`;
          }
          
          setContent(cleanedHtml);
          ref.innerHTML = cleanedHtml;
        }
      });
    }
  }

  function updateMarkupHighlighting() {
    // This function updates the markup highlighting with subtle gray highlighting
    const highlightDiv = document.getElementById('markup-highlight');
    
    if (!highlightDiv || !markupText()) {
      console.log('updateMarkupHighlighting: no highlightDiv or no markupText');
      return;
    }

    let highlightedText = markupText();
    console.log('updateMarkupHighlighting: original text:', highlightedText);

    // Define patterns for subtle highlighting of syntax elements
    const patterns = [
      // Headers
      { regex: /^(#{1,6})\s+(.+)$/gm, replacement: '<span class="markup-highlight">$1</span> $2' },
      
      // Bold and italic
      { regex: /\*\*(.*?)\*\*/g, replacement: '<span class="markup-highlight">**</span>$1<span class="markup-highlight">**</span>' },
      { regex: /_(.*?)_/g, replacement: '<span class="markup-highlight">_</span>$1<span class="markup-highlight">_</span>' },
      
      // Strikethrough
      { regex: /~~(.*?)~~/g, replacement: '<span class="markup-highlight">~~</span>$1<span class="markup-highlight">~~</span>' },
      
      // Code blocks
      { regex: /```([\s\S]*?)```/g, replacement: '<span class="markup-highlight">```</span>$1<span class="markup-highlight">```</span>' },
      { regex: /`([^`]+)`/g, replacement: '<span class="markup-highlight">`</span>$1<span class="markup-highlight">`</span>' },
      
      // Links
      { regex: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<span class="markup-highlight">[</span>$1<span class="markup-highlight">]($2)</span>' },
      
      // Images
      { regex: /!\[([^\]]*)\]\(([^)]+)\)/g, replacement: '<span class="markup-highlight">![</span>$1<span class="markup-highlight">]($2)</span>' },
      
      // Wikilinks
      { regex: /\[\[([^\]]+?)(?:\|([^\]]+?))?\]\]/g, replacement: '<span class="markup-highlight">[[</span>$1<span class="markup-highlight">]]</span>' },
      
      // Mentions
      { regex: /nostr:([a-zA-Z0-9]+)/g, replacement: '<span class="markup-highlight">nostr:</span>$1' },
      
      // LaTeX inline
      { regex: /\$([^$\n]+?)\$/g, replacement: '<span class="markup-highlight">$</span>$1<span class="markup-highlight">$</span>' },
      
      // LaTeX display
      { regex: /\$\$([^$]+?)\$\$/g, replacement: '<span class="markup-highlight">$$</span>$1<span class="markup-highlight">$$</span>' },
      
      // Blockquotes
      { regex: /^>\s+(.+)$/gm, replacement: '<span class="markup-highlight">> </span>$1' },
      
      // Lists
      { regex: /^(\s*)(\*)\s+(.+)$/gm, replacement: '$1<span class="markup-highlight">$2 </span>$3' },
      { regex: /^(\s*)(\d+\.\s+)(.+)$/gm, replacement: '$1<span class="markup-highlight">$2</span>$3' },
      { regex: /^(\s*)(\*)\s*$/gm, replacement: '$1<span class="markup-highlight">$2 </span>' },
      { regex: /^(\s*)(\d+\.\s*)$/gm, replacement: '$1<span class="markup-highlight">$2</span>' },
      
      // Horizontal rules
      { regex: /^---$/gm, replacement: '<span class="markup-highlight">---</span>' },
      
      // Tables
      { regex: /^\|(.+)\|$/gm, replacement: '<span class="markup-highlight">|</span>$1<span class="markup-highlight">|</span>' },
      
      // Footnotes
      { regex: /\[\^([^\]]+)\]/g, replacement: '<span class="markup-highlight">[^</span>$1<span class="markup-highlight">]</span>' },
      { regex: /^\[\^([^\]]+)\]:\s*(.+)$/gm, replacement: '<span class="markup-highlight">[^$1]: </span>$2' }
    ];

    // Apply all patterns
    patterns.forEach(pattern => {
      highlightedText = highlightedText.replace(pattern.regex, pattern.replacement);
    });

    console.log('updateMarkupHighlighting: highlighted text:', highlightedText);
    
    // Update the highlight div
    highlightDiv.innerHTML = highlightedText;
  }

  return {
    applyFormatting,
    applyCodeFormatting,
    insertLaTeX,
    insertDisplayLaTeX,
    insertBlockquote,
    insertListItem,
    insertText,
    updateContentFromEditor,
    setEditorFocused,
    handleEditorKeydown,
    removeFormatting,
    updateMarkupHighlighting,
    convertHtmlToMarkup: defaultMarkupConverter.convertHtmlToMarkup.bind(defaultMarkupConverter),
    convertMarkupToHtml: defaultMarkupConverter.convertMarkupToHtml.bind(defaultMarkupConverter),
  };
} 