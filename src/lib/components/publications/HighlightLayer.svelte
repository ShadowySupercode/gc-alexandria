<script lang="ts">
  import {
    getNdkContext,
    activeInboxRelays,
    activeOutboxRelays,
  } from "$lib/ndk";
  import { pubkeyToHue } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { generateMockHighlightsForSections } from "$lib/utils/mockHighlightData";
  import {
    groupHighlightsByAuthor,
    truncateHighlight,
    encodeHighlightNaddr,
    getRelaysFromHighlight,
    getAuthorDisplayName,
    sortHighlightsByTime,
  } from "$lib/utils/highlightUtils";
  import { unifiedProfileCache } from "$lib/utils/npubCache";
  import { nip19 } from "nostr-tools";
  import {
    highlightByOffset,
    getPlainText,
  } from "$lib/utils/highlightPositioning";

  let {
    eventId,
    eventAddress,
    eventIds = [],
    eventAddresses = [],
    visible = $bindable(false),
    useMockHighlights = false,
    currentViewAddress,
    rootAddress,
    publicationType,
  }: {
    eventId?: string;
    eventAddress?: string;
    eventIds?: string[];
    eventAddresses?: string[];
    visible?: boolean;
    useMockHighlights?: boolean;
    currentViewAddress?: string;
    rootAddress?: string;
    publicationType?: string;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let highlights: NDKEvent[] = $state([]);
  let loading = $state(false);
  let containerRef: HTMLElement | null = $state(null);
  let expandedAuthors = $state(new Set<string>());
  let authorProfiles = $state(new Map<string, any>());
  let copyFeedback = $state<string | null>(null);

  // Derived state for color mapping
  // AI-NOTE: Increased opacity from 0.3 to 0.5 for better visibility
  let colorMap = $derived.by(() => {
    const map = new Map<string, string>();
    highlights.forEach((highlight) => {
      if (!map.has(highlight.pubkey)) {
        const hue = pubkeyToHue(highlight.pubkey);
        map.set(highlight.pubkey, `hsla(${hue}, 70%, 60%, 0.5)`);
      }
    });
    return map;
  });

  // Filter highlights to only show those for the current view
  // AI-NOTE: 
  // - If viewing a blog index (30040), don't show any highlights - highlights scoped to the blog
  //   contain text from individual articles (30041) which aren't loaded on the index
  // - If viewing a blog entry (30041), show highlights scoped to that entry OR to the parent blog (30040)
  // - If viewing a publication index, show all highlights scoped to the publication
  let filteredHighlights = $derived.by(() => {
    if (!currentViewAddress) {
      // No current view specified - viewing publication/blog index
      // For blogs, don't show highlights on the index - the text is in the articles, not the index
      if (publicationType === "blog") {
        return [];
      }
      // For regular publications, show all highlights
      return highlights;
    }
    
    // Check if currentViewAddress is a blog entry (30041) or section
    const isBlogEntry = currentViewAddress.startsWith('30041:');
    
    // Filter highlights to only those scoped to the current view
    // OR to the root publication if viewing a blog entry
    return highlights.filter((highlight) => {
      const aTag = highlight.tags.find((tag) => tag[0] === "a");
      if (!aTag) return false;
      
      const highlightAddress = aTag[1];
      
      // Match if highlight is scoped to current view
      if (highlightAddress === currentViewAddress) {
        return true;
      }
      
      // If viewing a blog entry (30041), also show highlights scoped to the parent publication (30040)
      if (isBlogEntry && rootAddress && highlightAddress === rootAddress) {
        return true;
      }
      
      return false;
    });
  });

  // Derived state for grouped highlights (using filtered highlights)
  let groupedHighlights = $derived.by(() => {
    return groupHighlightsByAuthor(filteredHighlights);
  });

  /**
   * Fetch highlight events (kind 9802) for the current publication using NDK
   * Or generate mock highlights if useMockHighlights is enabled
   */
  async function fetchHighlights() {
    // Prevent concurrent fetches
    if (loading) {
      return;
    }

    // Collect all event IDs and addresses
    const allEventIds = [...(eventId ? [eventId] : []), ...eventIds].filter(
      Boolean,
    );
    const allAddresses = [
      ...(eventAddress ? [eventAddress] : []),
      ...eventAddresses,
    ].filter(Boolean);

    if (allEventIds.length === 0 && allAddresses.length === 0) {
      console.warn("[HighlightLayer] No event IDs or addresses provided");
      return;
    }

    loading = true;
    highlights = [];

    // AI-NOTE: Mock mode allows testing highlight UI without publishing to relays
    // This is useful for development and demonstrating the highlight system
    if (useMockHighlights) {
      try {
        // Generate mock highlight data
        const mockHighlights = generateMockHighlightsForSections(allAddresses);

        // Convert to NDKEvent instances (same as real events)
        highlights = mockHighlights.map(
          (rawEvent) => new NDKEventClass(ndk, rawEvent),
        );

        loading = false;
        return;
      } catch (err) {
        console.error(
          `[HighlightLayer] Error generating mock highlights:`,
          err,
        );
        loading = false;
        return;
      }
    }

    try {
      // Build filter for kind 9802 highlight events
      // IMPORTANT: Use only #a tags because filters are AND, not OR
      // If we include both #e and #a, relays will only return highlights that have BOTH
      const filter: any = {
        kinds: [9802],
        limit: 500,
      };

      // Prefer #a (addressable events) since they're more specific and persistent
      if (allAddresses.length > 0) {
        filter["#a"] = allAddresses;
      } else if (allEventIds.length > 0) {
        // Fallback to #e if no addresses available
        filter["#e"] = allEventIds;
      }

      // Build explicit relay set (same pattern as HighlightSelectionHandler and CommentButton)
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));

      /**
       * Use WebSocketPool with nostr-tools protocol instead of NDK
       *
       * Reasons for not using NDK:
       * 1. NDK subscriptions mysteriously returned 0 events even when websocat confirmed events existed
       * 2. Consistency - CommentButton and HighlightSelectionHandler both use WebSocketPool pattern
       * 3. Better debugging - direct access to WebSocket messages for troubleshooting
       * 4. Proven reliability - battle-tested in the codebase for similar use cases
       * 5. Performance control - explicit 5s timeout per relay, tunable as needed
       *
       * This matches the pattern in:
       * - src/lib/components/publications/CommentButton.svelte:156-220
       * - src/lib/components/publications/HighlightSelectionHandler.svelte:217-280
       */
      const subscriptionId = `highlights-${Date.now()}`;
      const receivedEventIds = new Set<string>();
      let eoseCount = 0;

      const fetchPromises = uniqueRelays.map(async (relayUrl) => {
        try {
          const ws = await WebSocketPool.instance.acquire(relayUrl);

          return new Promise<void>((resolve) => {
            let released = false;
            let resolved = false;
            
            const releaseConnection = () => {
              if (released) {
                return;
              }
              released = true;
              try {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                  ws.send(JSON.stringify(["CLOSE", subscriptionId]));
                }
                ws.removeEventListener("message", messageHandler);
                WebSocketPool.instance.release(ws);
              } catch (err) {
                console.error(`[HighlightLayer] Error releasing connection to ${relayUrl}:`, err);
              }
            };
            
            const safeResolve = () => {
              if (!resolved) {
                resolved = true;
                resolve();
              }
            };
            
            const messageHandler = (event: MessageEvent) => {
              try {
                const message = JSON.parse(event.data);

                if (message[0] === "EVENT" && message[1] === subscriptionId) {
                  const rawEvent = message[2];

                  // Avoid duplicates
                  if (!receivedEventIds.has(rawEvent.id)) {
                    receivedEventIds.add(rawEvent.id);

                    // Convert to NDKEvent
                    const ndkEvent = new NDKEventClass(ndk, rawEvent);
                    highlights = [...highlights, ndkEvent];
                  }
                } else if (
                  message[0] === "EOSE" &&
                  message[1] === subscriptionId
                ) {
                  eoseCount++;

                  // Close subscription and release connection
                  releaseConnection();
                  safeResolve();
                }
              } catch (err) {
                console.error(
                  `[HighlightLayer] Error processing message from ${relayUrl}:`,
                  err,
                );
              }
            };

            ws.addEventListener("message", messageHandler);

            // Send REQ
            const req = ["REQ", subscriptionId, filter];
            ws.send(JSON.stringify(req));

            // Timeout per relay (5 seconds)
            setTimeout(() => {
              releaseConnection();
              safeResolve();
            }, 5000);
          });
        } catch (err) {
          console.error(
            `[HighlightLayer] Error connecting to ${relayUrl}:`,
            err,
          );
        }
      });

      // Wait for all relays to respond or timeout
      await Promise.all(fetchPromises);

      loading = false;

      // Rendering is handled by the visibility/highlights effect
    } catch (err) {
      console.error(`[HighlightLayer] Error fetching highlights:`, err);
      loading = false;
    }
  }

  /**
   * Apply highlight using position offsets
   * @param offsetStart - Start character position
   * @param offsetEnd - End character position
   * @param color - The color to use for highlighting
   * @param targetAddress - Optional address to limit search to specific section
   */
  function highlightByPosition(
    offsetStart: number,
    offsetEnd: number,
    color: string,
    targetAddress?: string,
  ): boolean {
    if (!containerRef) {
      return false;
    }

    // If we have a target address, search only in that section
    let searchRoot: HTMLElement = containerRef;
    if (targetAddress) {
      const sectionElement = document.getElementById(targetAddress);
      if (sectionElement) {
        searchRoot = sectionElement;
        console.debug(`[HighlightLayer] Found section element for ${targetAddress}, using it as search root`);
      } else {
        console.warn(`[HighlightLayer] Section element not found for ${targetAddress}, falling back to containerRef`);
      }
    }

    const result = highlightByOffset(searchRoot, offsetStart, offsetEnd, color);
    if (!result) {
      console.warn(`[HighlightLayer] highlightByOffset returned false for offsets ${offsetStart}-${offsetEnd} in ${targetAddress || 'container'}`);
    }
    return result;
  }

  // Track retry attempts for text highlighting
  const textHighlightRetries = new Map<string, number>();
  const MAX_TEXT_HIGHLIGHT_RETRIES = 10;
  const TEXT_HIGHLIGHT_RETRY_DELAYS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]; // ms

  /**
   * Find text in the DOM and highlight it (fallback method)
   * @param text - The text to highlight
   * @param color - The color to use for highlighting
   * @param targetAddress - Optional address to limit search to specific section
   * @param retryCount - Internal parameter for retry attempts
   */
  function findAndHighlightText(
    text: string,
    color: string,
    targetAddress?: string,
    retryCount: number = 0,
  ): void {
    console.log(`[HighlightLayer] findAndHighlightText called: text="${text}", color="${color}", targetAddress="${targetAddress}", retryCount=${retryCount}`);
    
    if (!text || text.trim().length === 0) {
      console.warn(`[HighlightLayer] Empty text provided, returning`);
      return;
    }

    // If we have a target address, search only in that section
    // AI-NOTE: When viewing a section directly (leaf), the section element might be outside containerRef
    // So we search the entire document for the section element
    let searchRoot: HTMLElement | Document | null = null;
    let sectionElement: HTMLElement | null = null;
    
    if (targetAddress) {
      // Check if this is a publication address (30040) or section address (30041)
      const isPublicationAddress = targetAddress.startsWith('30040:');
      
      if (isPublicationAddress) {
        // For publication-scoped highlights, search in all sections of that publication
        // Find all section elements that belong to this publication
        const allSections = document.querySelectorAll('section[id^="30041:"], section[id^="30040:"]');
        const matchingSections: HTMLElement[] = [];
        
        // Extract publication identifier from target address (pubkey:d-tag)
        const pubParts = targetAddress.split(':');
        if (pubParts.length >= 3) {
          const pubKey = pubParts[1];
          const pubDtag = pubParts[2];
          
          // Find sections that belong to this publication
          for (const section of allSections) {
            const sectionId = section.id;
            const sectionParts = sectionId.split(':');
            if (sectionParts.length >= 3 && sectionParts[1] === pubKey) {
              // This section belongs to the same publication
              matchingSections.push(section as HTMLElement);
            }
          }
        }
        
        if (matchingSections.length > 0) {
          // Create a container to search across all matching sections
          // We'll search each section individually
          console.debug(`[HighlightLayer] Found ${matchingSections.length} sections for publication ${targetAddress}, searching for text: "${text.substring(0, 50)}"`);
          
          // Search in each matching section
          for (const section of matchingSections) {
            const contentSection = section.querySelector('section.publication-leather');
            const searchTarget = (contentSection || section.querySelector('.section-content') || section) as HTMLElement;
            
            if (searchTarget) {
              // Use TreeWalker to find text in this section
              const walker = document.createTreeWalker(
                searchTarget,
                NodeFilter.SHOW_TEXT,
                null,
              );
              
              const textNodes: Node[] = [];
              let node: Node | null;
              while ((node = walker.nextNode())) {
                textNodes.push(node);
              }
              
              // Search for the text in this section's text nodes
              const normalizedSearchText = text.trim().replace(/\s+/g, ' ').toLowerCase();
              
              for (const textNode of textNodes) {
                const nodeText = textNode.textContent || "";
                if (!nodeText || nodeText.trim().length === 0) continue;
                
                const normalizedNodeText = nodeText.replace(/\s+/g, ' ').toLowerCase();
                
                if (normalizedNodeText.includes(normalizedSearchText)) {
                  // Found match - highlight it
                  let index = normalizedNodeText.indexOf(normalizedSearchText);
                  if (index !== -1) {
                    const searchPattern = text.trim();
                    let actualIndex = nodeText.toLowerCase().indexOf(searchPattern.toLowerCase());
                    
                    if (actualIndex === -1) {
                      // Try flexible whitespace matching
                      const escapedText = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const flexiblePattern = escapedText.split(/\s+/).join('\\s+');
                      const regex = new RegExp(flexiblePattern, 'i');
                      const regexMatch = nodeText.match(regex);
                      if (regexMatch && regexMatch.index !== undefined) {
                        actualIndex = regexMatch.index;
                        const actualMatchText = regexMatch[0];
                        
                        const parent = textNode.parentNode;
                        if (!parent) continue;
                        
                        if (
                          parent.nodeName === "MARK" ||
                          (parent instanceof Element && parent.classList?.contains("highlight"))
                        ) {
                          continue;
                        }
                        
                        const before = nodeText.substring(0, actualIndex);
                        const after = nodeText.substring(actualIndex + actualMatchText.length);
                        
                        const highlightSpan = document.createElement("mark");
                        highlightSpan.className = "highlight";
                        highlightSpan.style.backgroundColor = color;
                        highlightSpan.style.borderRadius = "2px";
                        highlightSpan.style.padding = "2px 0";
                        highlightSpan.style.color = "inherit";
                        highlightSpan.style.fontWeight = "inherit";
                        highlightSpan.textContent = actualMatchText;
                        
                        const fragment = document.createDocumentFragment();
                        if (before) fragment.appendChild(document.createTextNode(before));
                        fragment.appendChild(highlightSpan);
                        if (after) fragment.appendChild(document.createTextNode(after));
                        
                        parent.replaceChild(fragment, textNode);
                        
                        console.debug(`[HighlightLayer] Successfully highlighted text in publication-scoped highlight`);
                        
                        if (targetAddress) {
                          const retryKey = `${targetAddress}:${text}`;
                          textHighlightRetries.delete(retryKey);
                        }
                        
                        return; // Found and highlighted, done
                      }
                    } else {
                      // Found exact match
                      const parent = textNode.parentNode;
                      if (!parent) continue;
                      
                      if (
                        parent.nodeName === "MARK" ||
                        (parent instanceof Element && parent.classList?.contains("highlight"))
                      ) {
                        continue;
                      }
                      
                      const matchLength = text.length;
                      const before = nodeText.substring(0, actualIndex);
                      const match = nodeText.substring(actualIndex, actualIndex + matchLength);
                      const after = nodeText.substring(actualIndex + matchLength);
                      
                      const highlightSpan = document.createElement("mark");
                      highlightSpan.className = "highlight";
                      highlightSpan.style.backgroundColor = color;
                      highlightSpan.style.borderRadius = "2px";
                      highlightSpan.style.padding = "2px 0";
                      highlightSpan.style.color = "inherit";
                      highlightSpan.style.fontWeight = "inherit";
                      highlightSpan.textContent = match;
                      
                      const fragment = document.createDocumentFragment();
                      if (before) fragment.appendChild(document.createTextNode(before));
                      fragment.appendChild(highlightSpan);
                      if (after) fragment.appendChild(document.createTextNode(after));
                      
                      parent.replaceChild(fragment, textNode);
                      
                      console.debug(`[HighlightLayer] Successfully highlighted text in publication-scoped highlight`);
                      
                      if (targetAddress) {
                        const retryKey = `${targetAddress}:${text}`;
                        textHighlightRetries.delete(retryKey);
                      }
                      
                      return; // Found and highlighted, done
                    }
                  }
                }
              }
            }
          }
          
          // If we get here, we searched all sections but didn't find the text
          // This might mean the content isn't loaded yet, so we'll retry
          const retryKey = `${targetAddress}:${text}`;
          const currentRetries = textHighlightRetries.get(retryKey) || 0;
          if (currentRetries < MAX_TEXT_HIGHLIGHT_RETRIES) {
            textHighlightRetries.set(retryKey, currentRetries + 1);
            const delay = TEXT_HIGHLIGHT_RETRY_DELAYS[Math.min(currentRetries, TEXT_HIGHLIGHT_RETRY_DELAYS.length - 1)];
            console.debug(`[HighlightLayer] Text not found in publication sections yet, retrying in ${delay}ms (attempt ${currentRetries + 1}/${MAX_TEXT_HIGHLIGHT_RETRIES})`);
            setTimeout(() => {
              findAndHighlightText(text, color, targetAddress, retryCount + 1);
            }, delay);
            return;
          } else {
            // Only warn if we truly couldn't find it after all retries
            // Check if highlight was actually rendered before warning
            const queryRoot = containerRef || document;
            const existingHighlights = queryRoot.querySelectorAll("mark.highlight");
            const highlightFound = Array.from(existingHighlights).some(mark => 
              mark.textContent?.toLowerCase().includes(text.toLowerCase())
            );
            if (!highlightFound) {
              console.debug(`[HighlightLayer] Text "${text}" not found in publication sections after ${MAX_TEXT_HIGHLIGHT_RETRIES} retries (content may not be loaded yet)`);
            }
            return;
          }
        } else {
          // No sections found for this publication - might not be loaded yet
          const retryKey = `${targetAddress}:${text}`;
          const currentRetries = textHighlightRetries.get(retryKey) || 0;
          if (currentRetries < MAX_TEXT_HIGHLIGHT_RETRIES) {
            textHighlightRetries.set(retryKey, currentRetries + 1);
            const delay = TEXT_HIGHLIGHT_RETRY_DELAYS[Math.min(currentRetries, TEXT_HIGHLIGHT_RETRY_DELAYS.length - 1)];
            console.debug(`[HighlightLayer] No sections found for publication ${targetAddress}, retrying in ${delay}ms (attempt ${currentRetries + 1}/${MAX_TEXT_HIGHLIGHT_RETRIES})`);
            setTimeout(() => {
              findAndHighlightText(text, color, targetAddress, retryCount + 1);
            }, delay);
            return;
          } else {
            // Only warn if we truly couldn't find sections after all retries
            console.debug(`[HighlightLayer] No sections found for publication ${targetAddress} after ${MAX_TEXT_HIGHLIGHT_RETRIES} retries (sections may not be loaded yet)`);
            return;
          }
        }
      } else {
        // Section-scoped highlight - search in specific section element
        sectionElement = document.getElementById(targetAddress);
        if (sectionElement) {
          // AI-NOTE: The actual content is in a nested <section class="whitespace-normal publication-leather">
          // created by contentParagraph snippet. Look for that nested section first.
          const contentSection = sectionElement.querySelector('section.publication-leather');
          if (contentSection) {
            searchRoot = contentSection as HTMLElement;
            console.debug(`[HighlightLayer] Found nested content section for ${targetAddress}, searching for text: "${text.substring(0, 50)}"`);
          } else {
            // Fallback to .section-content div if nested section not found
            const contentDiv = sectionElement.querySelector(".section-content");
            if (contentDiv) {
              searchRoot = contentDiv as HTMLElement;
              console.debug(`[HighlightLayer] Found section-content div for ${targetAddress}, searching for text: "${text.substring(0, 50)}"`);
            } else {
              // Last resort: search entire section
              searchRoot = sectionElement;
              console.debug(`[HighlightLayer] Found section element for ${targetAddress} (no nested content found), searching for text: "${text.substring(0, 50)}"`);
            }
          }
        } else {
          // Section not found - might not be loaded yet, retry if we haven't exceeded max retries
          const retryKey = `${targetAddress}:${text}`;
          const currentRetries = textHighlightRetries.get(retryKey) || 0;
          if (currentRetries < MAX_TEXT_HIGHLIGHT_RETRIES) {
            textHighlightRetries.set(retryKey, currentRetries + 1);
            const delay = TEXT_HIGHLIGHT_RETRY_DELAYS[Math.min(currentRetries, TEXT_HIGHLIGHT_RETRY_DELAYS.length - 1)];
            console.debug(`[HighlightLayer] Section element not found for ${targetAddress}, retrying in ${delay}ms (attempt ${currentRetries + 1}/${MAX_TEXT_HIGHLIGHT_RETRIES})`);
            setTimeout(() => {
              findAndHighlightText(text, color, targetAddress, retryCount + 1);
            }, delay);
            return;
          } else {
            // Only warn if we truly couldn't find the section after all retries
            console.debug(`[HighlightLayer] Section element not found for ${targetAddress} after ${MAX_TEXT_HIGHLIGHT_RETRIES} retries (section may not be loaded yet)`);
            return;
          }
        }
      }
    }
    
    // If no target address, use containerRef if available, otherwise document
    if (!targetAddress) {
      if (containerRef) {
        searchRoot = containerRef;
        console.debug(`[HighlightLayer] No target address, searching in containerRef for text: "${text.substring(0, 50)}"`);
      } else {
        searchRoot = document;
        console.debug(`[HighlightLayer] No target address and no containerRef, searching in document for text: "${text.substring(0, 50)}"`);
      }
    }

    if (!searchRoot) {
      return;
    }

    // Use TreeWalker to find all text nodes
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null,
    );

    // AI-NOTE: First, check if the text exists in the full content
    // This helps us know if we should continue searching
    // Normalize whitespace for matching - highlights may have different whitespace than DOM
    const fullText = searchRoot instanceof HTMLElement 
      ? searchRoot.textContent || searchRoot.innerText || ""
      : "";
    const normalizedSearchText = text.trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedFullText = fullText.replace(/\s+/g, ' ').toLowerCase();
    
    // AI-NOTE: If content is empty or very short, the section might still be loading
    // Check if we have meaningful content (more than just whitespace/formatting)
    const hasContent = fullText.trim().length > 5; // At least 5 characters of actual content
    
    if (!hasContent && sectionElement && retryCount < MAX_TEXT_HIGHLIGHT_RETRIES) {
      // Content not loaded yet, retry
      const retryKey = `${targetAddress || 'no-address'}:${text}`;
      const currentRetries = textHighlightRetries.get(retryKey) || 0;
      if (currentRetries < MAX_TEXT_HIGHLIGHT_RETRIES) {
        textHighlightRetries.set(retryKey, currentRetries + 1);
        const delay = TEXT_HIGHLIGHT_RETRY_DELAYS[Math.min(currentRetries, TEXT_HIGHLIGHT_RETRY_DELAYS.length - 1)];
        console.debug(`[HighlightLayer] Section content not loaded yet for ${targetAddress}, retrying in ${delay}ms (attempt ${currentRetries + 1}/${MAX_TEXT_HIGHLIGHT_RETRIES})`);
        setTimeout(() => {
          findAndHighlightText(text, color, targetAddress, retryCount + 1);
        }, delay);
        return;
      }
    }
    
    if (!normalizedFullText.includes(normalizedSearchText)) {
      // Text not found - retry if section exists and we haven't exceeded max retries
      if (sectionElement && retryCount < MAX_TEXT_HIGHLIGHT_RETRIES) {
        const retryKey = `${targetAddress || 'no-address'}:${text}`;
        const currentRetries = textHighlightRetries.get(retryKey) || 0;
        if (currentRetries < MAX_TEXT_HIGHLIGHT_RETRIES) {
          textHighlightRetries.set(retryKey, currentRetries + 1);
          const delay = TEXT_HIGHLIGHT_RETRY_DELAYS[Math.min(currentRetries, TEXT_HIGHLIGHT_RETRY_DELAYS.length - 1)];
          console.debug(`[HighlightLayer] Text "${text}" not found in content yet, retrying in ${delay}ms (attempt ${currentRetries + 1}/${MAX_TEXT_HIGHLIGHT_RETRIES}). Full text (first 200 chars): "${fullText.substring(0, 200)}"`);
          setTimeout(() => {
            findAndHighlightText(text, color, targetAddress, retryCount + 1);
          }, delay);
          return;
        }
      }
      // Only warn if we truly couldn't find the text after checking
      // This might be a false negative if content is still loading
      console.debug(
        `[HighlightLayer] Text "${text}" not found in full content. Full text (first 200 chars): "${fullText.substring(0, 200)}"`,
      );
      return;
    }

    console.debug(
      `[HighlightLayer] Text "${text}" found in full content. Searching text nodes...`,
    );

    // Collect all text nodes
    const textNodes: Node[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    console.debug(`[HighlightLayer] Found ${textNodes.length} text nodes to search`);
    
    // Log first few text nodes for debugging
    const sampleNodes = textNodes.slice(0, 20).filter(n => n.textContent && n.textContent.trim().length > 0);
    console.log(`[HighlightLayer] Sample text nodes (first 20 non-empty):`, sampleNodes.map(n => `"${n.textContent?.substring(0, 50)}${(n.textContent?.length || 0) > 50 ? '...' : ''}"`));

    // Search for the highlight text in text nodes
    // normalizedSearchText is already defined above with whitespace normalization
    for (let i = 0; i < textNodes.length; i++) {
      const textNode = textNodes[i];
      const nodeText = textNode.textContent || "";
      if (!nodeText || nodeText.trim().length === 0) {
        continue; // Skip empty text nodes
      }
      
      // Normalize node text for comparison (collapse whitespace)
      const normalizedNodeText = nodeText.replace(/\s+/g, ' ').toLowerCase();
      
      // Log every text node that contains the search text (for debugging)
      if (normalizedNodeText.includes(normalizedSearchText)) {
        console.log(`[HighlightLayer] Text node ${i} contains search text: "${nodeText.substring(0, 100)}${nodeText.length > 100 ? '...' : ''}"`);
      }
      
      // Try normalized match first (case-insensitive, whitespace-normalized)
      let index = normalizedNodeText.indexOf(normalizedSearchText);
      
      // If normalized match found, find the actual position in the original text
      // by searching for the normalized pattern in the original text
      if (index !== -1) {
        // Find the actual start position in the original text
        // We need to account for whitespace differences
        const searchPattern = text.trim();
        let actualIndex = nodeText.toLowerCase().indexOf(searchPattern.toLowerCase());
        
        // If that doesn't work, try finding by character position accounting for whitespace
        if (actualIndex === -1) {
          // Build a regex that matches the text with flexible whitespace
          const escapedText = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const flexiblePattern = escapedText.split(/\s+/).join('\\s+');
          const regex = new RegExp(flexiblePattern, 'i');
          const regexMatch = nodeText.match(regex);
          if (regexMatch && regexMatch.index !== undefined) {
            actualIndex = regexMatch.index;
            // Update the search text to the actual matched text for highlighting
            const actualMatchText = regexMatch[0];
            
            // Use the actual matched text length for highlighting
            const before = nodeText.substring(0, actualIndex);
            const matchedText = actualMatchText;
            const after = nodeText.substring(actualIndex + actualMatchText.length);
            
            const parent = textNode.parentNode;
            if (!parent) {
              console.warn(`[HighlightLayer] Text node has no parent, skipping`);
              continue;
            }

            // Skip if already highlighted
            if (
              parent.nodeName === "MARK" ||
              (parent instanceof Element && parent.classList?.contains("highlight"))
            ) {
              console.debug(`[HighlightLayer] Text node already highlighted, skipping`);
              continue;
            }

            console.debug(`[HighlightLayer] Found match at index ${actualIndex}: "${matchedText}" in node: "${nodeText.substring(0, 100)}${nodeText.length > 100 ? '...' : ''}"`);

            // Create highlight span with visible styling
            const highlightSpan = document.createElement("mark");
            highlightSpan.className = "highlight";
            highlightSpan.style.backgroundColor = color;
            highlightSpan.style.borderRadius = "2px";
            highlightSpan.style.padding = "2px 0";
            highlightSpan.style.color = "inherit";
            highlightSpan.style.fontWeight = "inherit";
            highlightSpan.textContent = matchedText;

            // Replace the text node with the highlighted version
            const fragment = document.createDocumentFragment();
            if (before) fragment.appendChild(document.createTextNode(before));
            fragment.appendChild(highlightSpan);
            if (after) fragment.appendChild(document.createTextNode(after));

            parent.replaceChild(fragment, textNode);

            console.debug(
              `[HighlightLayer] Successfully highlighted text "${matchedText}" at index ${actualIndex} in node with text: "${nodeText.substring(0, 50)}${nodeText.length > 50 ? "..." : ""}"`,
            );

            // Clear retry count on success
            if (targetAddress) {
              const retryKey = `${targetAddress}:${text}`;
              textHighlightRetries.delete(retryKey);
            }

            return; // Only highlight first occurrence to avoid multiple highlights
          }
        } else {
          // Found exact match (case-insensitive) - use it directly
          index = actualIndex;
        }
      }
      
      // Fallback: try exact match (case-sensitive) if normalized match failed
      if (index === -1) {
        index = nodeText.indexOf(text);
      }
      
      // Fallback: try case-insensitive exact match
      if (index === -1) {
        const lowerNodeText = nodeText.toLowerCase();
        const lowerSearchText = text.toLowerCase();
        index = lowerNodeText.indexOf(lowerSearchText);
      }

      if (index !== -1) {
        const parent = textNode.parentNode;
        if (!parent) {
          console.warn(`[HighlightLayer] Text node has no parent, skipping`);
          continue;
        }

        // Skip if already highlighted
        if (
          parent.nodeName === "MARK" ||
          (parent instanceof Element && parent.classList?.contains("highlight"))
        ) {
          console.debug(`[HighlightLayer] Text node already highlighted, skipping`);
          continue;
        }

        // Find the actual match - use the original text length
        const matchLength = text.length;
        const before = nodeText.substring(0, index);
        const match = nodeText.substring(index, index + matchLength);
        const after = nodeText.substring(index + matchLength);

        console.debug(`[HighlightLayer] Found match at index ${index}: "${match}" in node: "${nodeText.substring(0, 100)}${nodeText.length > 100 ? '...' : ''}"`);

        // Create highlight span with visible styling
        const highlightSpan = document.createElement("mark");
        highlightSpan.className = "highlight";
        highlightSpan.style.backgroundColor = color;
        highlightSpan.style.borderRadius = "2px";
        highlightSpan.style.padding = "2px 0";
        highlightSpan.style.color = "inherit"; // Ensure text color is visible
        highlightSpan.style.fontWeight = "inherit"; // Preserve font weight
        highlightSpan.textContent = match;

        // Replace the text node with the highlighted version
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(highlightSpan);
        if (after) fragment.appendChild(document.createTextNode(after));

        parent.replaceChild(fragment, textNode);

        console.debug(
          `[HighlightLayer] Successfully highlighted text "${match}" at index ${index} in node with text: "${nodeText.substring(0, 50)}${nodeText.length > 50 ? "..." : ""}"`,
        );

        // Clear retry count on success
        if (targetAddress) {
          const retryKey = `${targetAddress}:${text}`;
          textHighlightRetries.delete(retryKey);
        }

        return; // Only highlight first occurrence to avoid multiple highlights
      }
    }

    // AI-NOTE: If no match found, log for debugging
    console.warn(
      `[HighlightLayer] Could not find highlight text "${text}" in section. Searched ${textNodes.length} text nodes.`,
    );
    if (textNodes.length > 0) {
      // Log more text nodes and their full content to help debug
      const sampleNodes = textNodes.slice(0, 10);
      console.debug(
        `[HighlightLayer] Sample text nodes (first 10):`,
        sampleNodes.map((n, i) => ({
          index: i,
          text: n.textContent?.substring(0, 100) || "",
          fullLength: n.textContent?.length || 0,
          parentTag: n.parentElement?.tagName || "unknown",
        })),
      );
      // Also log the full text content of the search root to see what's actually there
      if (searchRoot instanceof HTMLElement) {
        const fullText = searchRoot.textContent || "";
        console.debug(
          `[HighlightLayer] Full text content of search root (first 500 chars): "${fullText.substring(0, 500)}"`,
        );
        console.debug(
          `[HighlightLayer] Full text contains "${text}": ${fullText.toLowerCase().includes(text.toLowerCase())}`,
        );
      }
    }
  }

  /**
   * Render all highlights on the page
   */
  function renderHighlights() {
    if (!visible) {
      return;
    }

    if (filteredHighlights.length === 0) {
      return;
    }

    // AI-NOTE: When viewing a section directly (leaf), containerRef might not be set
    // But we can still highlight by searching the document for section elements
    // Only clear highlights if containerRef exists, otherwise clear from document
    if (containerRef) {
      clearHighlights();
    } else {
      // Clear highlights from entire document
      const highlightElements = document.querySelectorAll("mark.highlight");
      highlightElements.forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          const textNode = document.createTextNode(el.textContent || "");
          parent.replaceChild(textNode, el);
          parent.normalize();
        }
      });
    }

    // Apply each highlight (only filtered highlights for current view)
    for (const highlight of filteredHighlights) {
      const content = highlight.content;
      const color = colorMap.get(highlight.pubkey) || "hsla(60, 70%, 60%, 0.5)";

      console.log(`[HighlightLayer] Processing highlight: content="${content}", color="${color}"`);

      // Extract the target address from the highlight's "a" tag
      const aTag = highlight.tags.find((tag) => tag[0] === "a");
      const targetAddress = aTag ? aTag[1] : undefined;
      
      console.log(`[HighlightLayer] Highlight targetAddress: "${targetAddress}"`);

      // Check for offset tags (position-based highlighting)
      const offsetTag = highlight.tags.find((tag) => tag[0] === "offset");
      const hasOffset =
        offsetTag && offsetTag[1] !== undefined && offsetTag[2] !== undefined;

      if (hasOffset) {
        // Use position-based highlighting
        const offsetStart = parseInt(offsetTag[1], 10);
        const offsetEnd = parseInt(offsetTag[2], 10);

        if (!isNaN(offsetStart) && !isNaN(offsetEnd)) {
          highlightByPosition(offsetStart, offsetEnd, color, targetAddress);
        } else if (content && content.trim().length > 0) {
          findAndHighlightText(content, color, targetAddress);
        }
      } else if (content && content.trim().length > 0) {
        // Fall back to text-based highlighting
        findAndHighlightText(content, color, targetAddress);
      }
    }

    // Check if any highlights were actually rendered
    const renderedHighlights = containerRef 
      ? containerRef.querySelectorAll("mark.highlight")
      : document.querySelectorAll("mark.highlight");
    console.log(
      `[HighlightLayer] Rendered ${renderedHighlights.length} highlight marks in DOM`,
    );
    
    // AI-NOTE: Debug logging to help diagnose highlight visibility issues
    if (renderedHighlights.length === 0 && filteredHighlights.length > 0) {
      console.warn(`[HighlightLayer] No highlights rendered despite ${filteredHighlights.length} filtered highlights available. Container:`, containerRef, "Visible:", visible, "CurrentView:", currentViewAddress);
      // Log highlight details for debugging
      filteredHighlights.forEach((h, i) => {
        const aTag = h.tags.find((tag) => tag[0] === "a");
        const offsetTag = h.tags.find((tag) => tag[0] === "offset");
        console.debug(`[HighlightLayer] Highlight ${i}: content="${h.content.substring(0, 50)}", targetAddress="${aTag?.[1]}", hasOffset=${!!offsetTag}`);
      });
    }
  }

  /**
   * Clear all highlights from the page
   * AI-NOTE: If containerRef is not set (e.g., blog entries), clear from document
   */
  function clearHighlights() {
    const queryRoot = containerRef || document;
    const highlightElements = queryRoot.querySelectorAll("mark.highlight");
    highlightElements.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        // Replace highlight with plain text
        const textNode = document.createTextNode(el.textContent || "");
        parent.replaceChild(textNode, el);

        // Normalize the parent to merge adjacent text nodes
        parent.normalize();
      }
    });
  }

  // Track the last fetched event count to know when to refetch
  let lastFetchedCount = $state(0);
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Watch for changes to event data - debounce and fetch when data stabilizes
  $effect(() => {
    const currentCount = eventIds.length + eventAddresses.length;
    const hasEventData = currentCount > 0;

    // Only fetch if:
    // 1. We have event data
    // 2. The count has changed since last fetch
    // 3. We're not already loading
    if (hasEventData && currentCount !== lastFetchedCount && !loading) {
      // Clear any existing timeout
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }

      // Debounce: wait 500ms for more events to arrive before fetching
      fetchTimeout = setTimeout(() => {
        lastFetchedCount = currentCount;
        fetchHighlights();
      }, 500);
    }

    // Cleanup timeout on effect cleanup
    return () => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
    };
  });

  // Watch for visibility AND highlights changes - render when both are ready
  // AI-NOTE: Also watch containerRef to ensure it's set before rendering
  // AI-NOTE: For blog entries viewed directly, containerRef might not be set, so we render without it
  $effect(() => {
    // This effect runs when either visible, highlights.length, or containerRef changes
    const highlightCount = filteredHighlights.length;

    if (visible && highlightCount > 0) {
      // AI-NOTE: Retry rendering with increasing delays to handle async content loading
      // This is especially important when viewing sections directly
      let retryCount = 0;
      const maxRetries = 5;
      const retryDelays = [100, 300, 500, 1000, 2000];
      
      const tryRender = () => {
        renderHighlights();
        const renderedCount = containerRef?.querySelectorAll("mark.highlight").length || 0;
        
        if (renderedCount === 0 && retryCount < maxRetries) {
          console.debug(`[HighlightLayer] No highlights rendered, retrying (attempt ${retryCount + 1}/${maxRetries})...`);
          setTimeout(tryRender, retryDelays[retryCount]);
          retryCount++;
        } else if (renderedCount > 0) {
          console.debug(`[HighlightLayer] Successfully rendered ${renderedCount} highlights after ${retryCount} retries`);
        }
      };
      
      tryRender();
    } else if (!visible) {
      clearHighlights();
    }
  });

  // Fetch profiles when highlights change
  $effect(() => {
    const highlightCount = highlights.length;
    if (highlightCount > 0) {
      fetchAuthorProfiles();
    }
  });

  /**
   * Fetch author profiles for all unique pubkeys in highlights
   */
  async function fetchAuthorProfiles() {
    const uniquePubkeys = Array.from(groupedHighlights.keys());

    for (const pubkey of uniquePubkeys) {
      try {
        // Convert hex pubkey to npub for the profile cache
        const npub = nip19.npubEncode(pubkey);
        const profile = await unifiedProfileCache.getProfile(npub, ndk);
        if (profile) {
          authorProfiles.set(pubkey, profile);
          // Trigger reactivity
          authorProfiles = new Map(authorProfiles);
        }
      } catch (err) {
        console.error(
          `[HighlightLayer] Error fetching profile for ${pubkey}:`,
          err,
        );
      }
    }
  }

  /**
   * Toggle expansion state for an author's highlights
   */
  function toggleAuthor(pubkey: string) {
    if (expandedAuthors.has(pubkey)) {
      expandedAuthors.delete(pubkey);
    } else {
      expandedAuthors.add(pubkey);
    }
    // Trigger reactivity
    expandedAuthors = new Set(expandedAuthors);
  }

  /**
   * Scroll to a specific highlight in the document
   */
  function scrollToHighlight(highlight: NDKEvent) {
    if (!containerRef) {
      return;
    }

    const content = highlight.content;
    if (!content || content.trim().length === 0) {
      return;
    }

    // Find the highlight mark element
    const highlightMarks = containerRef.querySelectorAll("mark.highlight");

    // Try exact match first
    for (const mark of highlightMarks) {
      const markText = mark.textContent?.toLowerCase() || "";
      const searchText = content.toLowerCase();

      if (markText === searchText) {
        // Scroll to this element
        mark.scrollIntoView({ behavior: "smooth", block: "center" });

        // Add a temporary flash effect
        mark.classList.add("highlight-flash");
        setTimeout(() => {
          mark.classList.remove("highlight-flash");
        }, 1500);
        return;
      }
    }

    // Try partial match (for position-based highlights that might be split)
    for (const mark of highlightMarks) {
      const markText = mark.textContent?.toLowerCase() || "";
      const searchText = content.toLowerCase();

      if (markText.includes(searchText) || searchText.includes(markText)) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.classList.add("highlight-flash");
        setTimeout(() => {
          mark.classList.remove("highlight-flash");
        }, 1500);
        return;
      }
    }
  }

  /**
   * Copy highlight naddr to clipboard
   */
  async function copyHighlightNaddr(highlight: NDKEvent) {
    const relays = getRelaysFromHighlight(highlight);
    const naddr = encodeHighlightNaddr(highlight, relays);

    try {
      await navigator.clipboard.writeText(naddr);
      copyFeedback = highlight.id;

      // Clear feedback after 2 seconds
      setTimeout(() => {
        copyFeedback = null;
      }, 2000);
    } catch (err) {
      console.error(`[HighlightLayer] Error copying to clipboard:`, err);
    }
  }

  /**
   * Bind to parent container element
   */
  export function setContainer(element: HTMLElement | null) {
    containerRef = element;
  }

  /**
   * Public method to refresh highlights (e.g., after creating a new one)
   */
  export function refresh() {
    // Clear existing highlights
    highlights = [];
    clearHighlights();

    // Reset fetch count to force re-fetch
    lastFetchedCount = 0;
    fetchHighlights();
  }
</script>

{#if loading && visible}
  <div
    class="fixed top-40 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3"
  >
    <p class="text-sm text-gray-600 dark:text-gray-300">
      Loading highlights...
    </p>
  </div>
{/if}

{#if visible && filteredHighlights.length > 0}
  <div
    class="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm w-80"
  >
    <h4 class="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
      Highlights
    </h4>
    <div class="space-y-2 max-h-96 overflow-y-auto">
      {#each Array.from(groupedHighlights.entries()) as [pubkey, authorHighlights]}
        {@const isExpanded = expandedAuthors.has(pubkey)}
        {@const profile = authorProfiles.get(pubkey)}
        {@const displayName = getAuthorDisplayName(profile, pubkey)}
        {@const color = colorMap.get(pubkey) || "hsla(60, 70%, 60%, 0.5)"}
        {@const sortedHighlights = sortHighlightsByTime(authorHighlights)}

        <div class="border-b border-gray-200 dark:border-gray-700 pb-2">
          <!-- Author header -->
          <button
            class="w-full flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors"
            onclick={() => toggleAuthor(pubkey)}
          >
            <div
              class="w-3 h-3 rounded flex-shrink-0"
              style="background-color: {color};"
            ></div>
            <span
              class="font-medium text-gray-900 dark:text-gray-100 flex-1 text-left truncate"
            >
              {displayName}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              ({authorHighlights.length})
            </span>
            <svg
              class="w-4 h-4 text-gray-500 transition-transform {isExpanded
                ? 'rotate-90'
                : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <!-- Expanded highlight list -->
          {#if isExpanded}
            <div class="mt-2 ml-5 space-y-2">
              {#each sortedHighlights as highlight}
                {@const truncated = useMockHighlights
                  ? "test data"
                  : truncateHighlight(highlight.content)}
                {@const showCopied = copyFeedback === highlight.id}

                <div class="flex items-start gap-2 group">
                  <button
                    class="flex-1 text-left text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    onclick={() => scrollToHighlight(highlight)}
                    title={useMockHighlights
                      ? "Mock highlight"
                      : highlight.content}
                  >
                    {truncated}
                  </button>
                  <button
                    class="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onclick={() => copyHighlightNaddr(highlight)}
                    title="Copy naddr"
                  >
                    {#if showCopied}
                      <svg
                        class="w-3 h-3 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    {:else}
                      <svg
                        class="w-3 h-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  :global(mark.highlight) {
    transition: background-color 0.2s ease;
  }

  :global(mark.highlight:hover) {
    filter: brightness(1.1);
  }

  :global(mark.highlight.highlight-flash) {
    animation: flash 1.5s ease-in-out;
  }

  @keyframes -global-flash {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(0.4);
      box-shadow: 0 0 12px rgba(0, 0, 0, 0.5);
    }
  }
</style>
