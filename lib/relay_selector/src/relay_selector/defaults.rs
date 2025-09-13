use crate::relay;

pub const DEFAULT_GENERAL_RELAYS: &[&str] = &[
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.snort.social",
];

pub const DEFAULT_INBOX_RELAYS: &[&str] = &["wss://relay.damus.io", "wss://inbox.nostr.wine"];

pub const DEFAULT_OUTBOX_RELAYS: &[&str] = &["wss://relay.damus.io", "wss://relay.snort.social"];

pub const DEFAULT_WEIGHT: f32 = 1.0;

pub fn get_default_relays(variant: relay::Variant) -> &'static [&'static str] {
    match variant {
        relay::Variant::General => DEFAULT_GENERAL_RELAYS,
        relay::Variant::Inbox => DEFAULT_INBOX_RELAYS,
        relay::Variant::Outbox => DEFAULT_OUTBOX_RELAYS,
        _ => DEFAULT_GENERAL_RELAYS,
    }
}
