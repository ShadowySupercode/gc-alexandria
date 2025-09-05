use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::relay;
use crate::relay_selector;

#[derive(Debug, Deserialize, Serialize)]
pub struct Relay {
    pub url: String,
    pub variant: relay::Variant,
    requests: u32,
    successful_requests: u32,
    response_times: Vec<Duration>,
    trust_level: f32,
    vendor_score: f32,
    pub weight: f32,
}

impl Relay {
    pub fn from_repositories(
        url: &str,
        variant: relay::Variant,
        statistics: &relay::Statistics,
        selector: &relay_selector::RelaySelector,
    ) -> Self {
        // Precondition: The selector must know about the relay.
        assert!(selector.initial_weights.contains_key(url));

        Relay {
            url: url.to_string(),
            variant,
            requests: statistics.requests,
            successful_requests: statistics.successful_requests,
            response_times: statistics.response_times.clone(),
            trust_level: statistics.trust_level,
            vendor_score: statistics.vendor_score,
            weight: selector.initial_weights[url],
        }
    }

    pub fn to_statistics(&self) -> relay::Statistics {
        let mut statistics = relay::Statistics::new();
        statistics.requests = self.requests;
        statistics.successful_requests = self.successful_requests;
        statistics.response_times = self.response_times.clone();
        statistics.trust_level = self.trust_level;
        statistics.vendor_score = self.vendor_score;
        statistics
    }
}
