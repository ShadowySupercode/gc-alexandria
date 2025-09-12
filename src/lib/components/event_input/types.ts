/**
 * Type definitions for the EventInput component system
 */

export interface EventData {
  kind: number;
  content: string;
  createdAt: number;
}

export interface TagData {
  key: string;
  values: string[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  warning?: string;
}

export interface PublishResult {
  success: boolean;
  eventId?: string;
  relays?: string[];
  error?: string;
}

export interface LoadEventResult {
  eventData: EventData;
  tags: TagData[];
}

export interface EventPreview {
  type: "standard_event" | "30040_index_event" | "error";
  event?: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
  message?: string;
}

export interface PresetTag {
  key: string;
  defaultValue: string;
  required: boolean;
  autoUpdate: boolean;
  description: string;
}

export interface KindConfig {
  kind: number;
  name: string;
  description: string;
  presetTags: PresetTag[];
  requiresContent: boolean;
  contentValidation?: (content: string) => ValidationResult;
}
