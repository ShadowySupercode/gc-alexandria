#[derive(Debug)]
pub enum RelayVariant {
    General,
    Inbox,
    Outbox,
    Local,
}

// TODO: Define methods to convert from str to RelayType.
impl RelayVariant {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "general" => Some(RelayVariant::General),
            "inbox" => Some(RelayVariant::Inbox),
            "outbox" => Some(RelayVariant::Outbox),
            "local" => Some(RelayVariant::Local),
            _ => None,
        }
    }
}
