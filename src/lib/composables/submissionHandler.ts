import { nip19 } from "nostr-tools";
import { get } from "svelte/store";
import { toNpub } from "$lib/utils/nostrUtils";
import type { NDKEvent } from "$lib/utils/nostrUtils";
import {
  extractRootEventInfo,
  extractParentEventInfo,
  buildReplyTags,
  createSignedEvent,
  publishEvent,
} from "$lib/utils/nostrEventService";
import { goto } from "$app/navigation";
import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
import { userPubkey } from "$lib/stores/authStore.Svelte";

export interface SubmissionHandlerConfig {
  content: () => string;
  event?: NDKEvent;
  kind?: number;
  tags?: string[][];
  onSubmit?: (content: string) => Promise<{ success: boolean; error?: string; eventId?: string }>;
  userRelayPreference?: boolean;
  onSuccess: (result: { relay: string; eventId: string }) => void;
  onError: (errorMessage: string) => void;
  onSubmitting: (isSubmitting: boolean) => void;
}

export function createSubmissionHandler(config: SubmissionHandlerConfig) {
  const {
    content,
    event,
    kind,
    tags,
    onSubmit,
    userRelayPreference,
    onSuccess,
    onError,
    onSubmitting,
  } = config;

  async function handleSubmit(useOtherRelays = false, useSecondaryRelays = false) {
    onSubmitting(true);
    onError("");

    try {
      if (onSubmit) {
        const result = await onSubmit(content());
        if (result.success) {
          onSuccess({
            relay: "Custom handler",
            eventId: result.eventId || "unknown"
          });
        } else {
          onError(result.error || "Unknown error occurred");
        }
        return;
      }

      const pk = get(userPubkey) || "";
      const npub = toNpub(pk);

      if (!npub) {
        throw new Error("Invalid public key: must be a 64-character hex string.");
      }

      if (event && (event.kind === undefined || event.kind === null)) {
        throw new Error("Invalid event: missing kind");
      }

      let eventKind = kind;
      let eventTags = tags || [];

      if (event) {
        const parent = event;
        eventKind = parent.kind === 1 ? 1 : 1111;
        const rootInfo = extractRootEventInfo(parent);
        const parentInfo = extractParentEventInfo(parent);
        eventTags = buildReplyTags(parent, rootInfo, parentInfo, eventKind);
      } else if (!eventKind) {
        eventKind = 1;
      }

      const { event: signedEvent } = await createSignedEvent(
        content(),
        pk,
        eventKind,
        eventTags,
      );

      let relays = get(activeOutboxRelays);
      
      if (useOtherRelays && !useSecondaryRelays) {
        relays = [...get(activeOutboxRelays), ...get(activeInboxRelays)];
      } else if (useSecondaryRelays) {
        relays = get(activeOutboxRelays).slice(0, 3);
      }

      const successfulRelays = await publishEvent(signedEvent, relays);

      onSuccess({
        relay: successfulRelays[0] || "Unknown relay",
        eventId: signedEvent.id,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unknown error occurred");
    } finally {
      onSubmitting(false);
    }
  }

  function handleViewComment(eventId: string) {
    if (eventId) {
      const nevent = nip19.neventEncode({ id: eventId });
      goto(`/events?id=${encodeURIComponent(nevent)}`);
    }
  }

  return {
    handleSubmit,
    handleViewComment,
  };
} 