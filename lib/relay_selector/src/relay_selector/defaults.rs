use crate::relay;

// This "starter pack" relay set is used if the user has no preferred relays.
pub const DEFAULT_GENERAL_RELAYS: &[&str] = &[
    "wss://theforest.nostr1.com",
    "wss://thecitadel.nostr1.com",
    "wss://nostr.land",
    "wss://nostr.wine",
    "wss://nostr.sovbit.host",
    "wss://nostr21.com",
];

pub const DEFAULT_INBOX_RELAYS: &[&str] = DEFAULT_GENERAL_RELAYS;

pub const DEFAULT_OUTBOX_RELAYS: &[&str] = DEFAULT_GENERAL_RELAYS;

pub const DEFAULT_WEIGHT: f32 = 1.0;

/// Load default relays from configuration.
/// Falls back to hardcoded defaults if config is unavailable.
/// TODO: Use this when performing first-time setup.
pub async fn load_default_relays_from_config() -> Vec<String> {
    crate::config::get_relay_allowlist().await
}

pub fn get_default_relays(variant: relay::Variant) -> &'static [&'static str] {
    match variant {
        relay::Variant::General => DEFAULT_GENERAL_RELAYS,
        relay::Variant::Inbox => DEFAULT_INBOX_RELAYS,
        relay::Variant::Outbox => DEFAULT_OUTBOX_RELAYS,
        _ => DEFAULT_GENERAL_RELAYS,
    }
}
