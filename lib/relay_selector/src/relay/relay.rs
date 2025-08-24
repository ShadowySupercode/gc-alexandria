pub struct Relay {
    variant: RelayVariant,
    url: String,
}

impl Relay {
    pub fn new(variant: RelayVariant, url: String) -> Self {
        Relay { variant, url }
    }
}
