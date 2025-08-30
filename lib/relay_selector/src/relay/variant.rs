#[derive(Debug, Clone, Copy)]
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
}
