import type { EventKindConfig } from '$lib/stores/visualizationConfig';

/**
 * Validates an event kind input value.
 * @param value - The input value to validate (string or number).
 * @param existingKinds - Array of existing event kind numbers to check for duplicates.
 * @returns The validated kind number, or null if validation fails.
 */
export function validateEventKind(
  value: string | number, 
  existingKinds: number[]
): { kind: number | null; error: string } {
  // Convert to string for consistent handling
  const strValue = String(value);
  if (strValue === null || strValue === undefined || strValue.trim() === '') {
    return { kind: null, error: '' };
  }
  
  const kind = parseInt(strValue.trim());
  if (isNaN(kind)) {
    return { kind: null, error: 'Must be a number' };
  }
  
  if (kind < 0) {
    return { kind: null, error: 'Must be non-negative' };
  }
  
  if (existingKinds.includes(kind)) {
    return { kind: null, error: 'Already added' };
  }
  
  return { kind, error: '' };
}

/**
 * Handles adding a new event kind with validation and state management.
 * @param newKind - The new kind value to add.
 * @param existingKinds - Array of existing event kind numbers.
 * @param addKindFunction - Function to call when adding the kind.
 * @param resetStateFunction - Function to call to reset the input state.
 * @returns Object with success status and any error message.
 */
export function handleAddEventKind(
  newKind: string,
  existingKinds: number[],
  addKindFunction: (kind: number) => void,
  resetStateFunction: () => void
): { success: boolean; error: string } {
  console.log('[handleAddEventKind] called with:', newKind);
  
  const validation = validateEventKind(newKind, existingKinds);
  console.log('[handleAddEventKind] Validation result:', validation);
  
  if (validation.kind !== null) {
    console.log('[handleAddEventKind] Adding event kind:', validation.kind);
    addKindFunction(validation.kind);
    resetStateFunction();
    return { success: true, error: '' };
  } else {
    console.log('[handleAddEventKind] Validation failed:', validation.error);
    return { success: false, error: validation.error };
  }
}

/**
 * Handles keyboard events for event kind input.
 * @param e - The keyboard event.
 * @param onEnter - Function to call when Enter is pressed.
 * @param onEscape - Function to call when Escape is pressed.
 */
export function handleEventKindKeydown(
  e: KeyboardEvent,
  onEnter: () => void,
  onEscape: () => void
): void {
  if (e.key === 'Enter') {
    onEnter();
  } else if (e.key === 'Escape') {
    onEscape();
  }
}

/**
 * Gets the display name for an event kind.
 * @param kind - The event kind number.
 * @returns The display name for the kind.
 */
export function getEventKindDisplayName(kind: number): string {
  switch (kind) {
    case 30040: return 'Publication Index';
    case 30041: return 'Publication Content';
    case 30818: return 'Wiki';
    case 1: return 'Text Note';
    case 0: return 'Metadata';
    case 3: return 'Follow List';
    default: return `Kind ${kind}`;
  }
} 