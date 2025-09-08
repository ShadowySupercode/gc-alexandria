use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub enum Variant {
    General,
    Inbox,
    Outbox,
    Local,
}

impl Variant {
    /// Generates a new `Variant` from a string.
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "general" => Some(Variant::General),
            "inbox" => Some(Variant::Inbox),
            "outbox" => Some(Variant::Outbox),
            "local" => Some(Variant::Local),
            _ => None,
        }
    }

    /// Converts a `Variant` to a string.
    pub fn to_string(&self) -> String {
        match self {
            Variant::General => "general".to_string(),
            Variant::Inbox => "inbox".to_string(),
            Variant::Outbox => "outbox".to_string(),
            Variant::Local => "local".to_string(),
        }
    }
}
