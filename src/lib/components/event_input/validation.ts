/**
 * Event validation utilities
 */

import { get } from "svelte/store";
import { userStore } from "$lib/stores/userStore";
import type { EventData, TagData, ValidationResult } from "./types";
import {
  validateNotAsciidoc,
  validateAsciiDoc,
  validate30040EventSet,
} from "$lib/utils/event_input_utils";

/**
 * Validates an event and its tags
 */
export function validateEvent(
  eventData: EventData,
  tags: TagData[],
): ValidationResult {
  const userState = get(userStore);

  const pubkey = userState.pubkey;
  if (!pubkey) {
    return { valid: false, reason: "Not logged in." };
  }

  // Content validation - 30040 events don't require content
  if (eventData.kind !== 30040 && !eventData.content.trim()) {
    return { valid: false, reason: "Content required." };
  }

  // Kind-specific validation
  if (eventData.kind === 30023) {
    const v = validateNotAsciidoc(eventData.content);
    if (!v.valid) return v;
  }

  if (eventData.kind === 30040) {
    // Check for required tags
    const versionTag = tags.find((t) => t.key === "version");
    const dTag = tags.find((t) => t.key === "d");
    const titleTag = tags.find((t) => t.key === "title");

    if (
      !versionTag ||
      !versionTag.values[0] ||
      versionTag.values[0].trim() === ""
    ) {
      return { valid: false, reason: "30040 events require a 'version' tag." };
    }

    if (!dTag || !dTag.values[0] || dTag.values[0].trim() === "") {
      return { valid: false, reason: "30040 events require a 'd' tag." };
    }

    if (!titleTag || !titleTag.values[0] || titleTag.values[0].trim() === "") {
      return { valid: false, reason: "30040 events require a 'title' tag." };
    }

    // Validate content format if present
    if (eventData.content.trim()) {
      const v = validate30040EventSet(eventData.content);
      if (!v.valid) return v;
      if (v.warning) return { valid: true, warning: v.warning };
    }
  }

  if (eventData.kind === 30041 || eventData.kind === 30818) {
    const v = validateAsciiDoc(eventData.content);
    if (!v.valid) return v;
  }

  return { valid: true };
}

/**
 * Validates that a kind is within valid range
 */
export function isValidKind(kind: number | string): boolean {
  const n = Number(kind);
  return Number.isInteger(n) && n >= 0 && n <= 65535;
}

/**
 * Validates that a tag has a valid key
 */
export function isValidTagKey(key: string): boolean {
  return key.trim().length > 0;
}

/**
 * Validates that a tag has at least one value
 */
export function isValidTag(tag: TagData): boolean {
  return isValidTagKey(tag.key) && tag.values.some((v) => v.trim().length > 0);
}
