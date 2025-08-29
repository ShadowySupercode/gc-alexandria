use std::collections::HashMap;

use crate::relay::RelayVariant;
use crate::relay_selector::weights::{calculate_weights, weighted_sort};

pub type RelayWeights = HashMap<String, f32>;

const CONNECTION_WEIGHT: f32 = 0.1;

pub struct RelaySelector {
    initial_weights: RelayWeights,
    current_weights: RelayWeights,

    // Storage for success rate data
    requests: HashMap<String, u32>,
    successful_requests: HashMap<String, u32>,

    // Storage for response time data
    response_times: HashMap<String, Vec<u32>>,

    // Other weights
    trust_level_weights: HashMap<String, f32>,
    preferred_vendor_weights: HashMap<String, f32>,

    active_connections: HashMap<String, u8>,

    // Sorted relay lists by variant
    general: Vec<String>,
    inbox: Vec<String>,
    outbox: Vec<String>,
}

// Constructor and destructor
impl RelaySelector {
    pub fn new() -> Self {
        // TODO: Initialize with data from persistent storage.
        Self {
            initial_weights: HashMap::new(),
            current_weights: HashMap::new(),
            requests: HashMap::new(),
            successful_requests: HashMap::new(),
            active_connections: HashMap::new(),
            general: Vec::new(),
            inbox: Vec::new(),
            outbox: Vec::new(),
        }
    }
}

// Relay management methods
impl RelaySelector {
    pub fn contains(&self, relay: &str) -> bool {
        self.general.contains(&relay.to_string())
            || self.inbox.contains(&relay.to_string())
            || self.outbox.contains(&relay.to_string())
    }

    pub fn insert(&mut self, relay: &str, variant: RelayVariant) {
        match variant {
            RelayVariant::General => self.general.push(relay.to_string()),
            RelayVariant::Inbox => self.inbox.push(relay.to_string()),
            RelayVariant::Outbox => self.outbox.push(relay.to_string()),
            _ => self.general.push(relay.to_string()),
        }

        self.requests.insert(relay.to_string(), 0);
        self.successful_requests.insert(relay.to_string(), 0);
        self.active_connections.insert(relay.to_string(), 0);

        // TODO: Set initial weight and sort
    }
}

// Algorithmic ranking methods
impl RelaySelector {
    pub fn update_response_time(&mut self, relay: &str, response_time: Duration) {
        // Update response time
        let response_times = self
            .response_times
            .get_mut(relay)
            .unwrap_or(&mut Vec::new());

        response_times.push(response_time);

        // Update weights based on current state
        let successful_requests = self.successful_requests.get(relay).unwrap_or(&0);
        let total_requests = self.requests.get(relay).unwrap_or(&0);
        let trust_level = self.trust_level_weights.get(relay).unwrap_or(&0f32);
        let preferred_vendor = self.preferred_vendor_weights.get(relay).unwrap_or(&0f32);
        let active_connections = self.active_connections.get(relay).unwrap_or(&0);

        let (initial_weight, current_weight) = calculate_weights(
            self.response_times
                .get(relay)
                .unwrap_or(&Vec::new())
                .as_slice(),
            *successful_requests,
            *total_requests,
            *trust_level,
            *preferred_vendor,
            *active_connections,
        );

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);
    }

    pub fn update_success_rate(&mut self, relay: &str, success: bool) {
        // Update counts
        let total_count = self.requests.get_mut(relay);
        let success_count = self.successful_requests.get_mut(relay);

        match total_count {
            Some(total) => *total += 1,
            None => {
                self.requests.insert(relay.to_string(), 1);
                ()
            }
        }

        match success_count {
            Some(s) => {
                if success {
                    *s += 1
                }
            }
            None => {
                if success {
                    self.successful_requests.insert(relay.to_string(), 1);
                } else {
                    self.successful_requests.insert(relay.to_string(), 0);
                }
            }
        }

        // Update weights based on current state
        let successful_requests = self.successful_requests.get(relay).unwrap_or(&0);
        let total_requests = self.requests.get(relay).unwrap_or(&0);
        let trust_level = self.trust_level_weights.get(relay).unwrap_or(&0f32);
        let preferred_vendor = self.preferred_vendor_weights.get(relay).unwrap_or(&0f32);
        let active_connections = self.active_connections.get(relay).unwrap_or(&0);

        let (initial_weight, current_weight) = calculate_weights(
            self.response_times
                .get(relay)
                .unwrap_or(&Vec::new())
                .as_slice(),
            *successful_requests,
            *total_requests,
            *trust_level,
            *preferred_vendor,
            *active_connections,
        );

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);
    }
}

// Get and return methods
impl RelaySelector {
    pub fn get_relay_by_weighted_round_robin(
        &mut self,
        variant: RelayVariant,
        rank: usize,
    ) -> Result<String, String> {
        let ranked = match variant {
            RelayVariant::General => &self.general,
            RelayVariant::Inbox => &self.inbox,
            RelayVariant::Outbox => &self.outbox,
            _ => {
                return Err(format!(
                    "[RelaySelector] Unsupported variant: {:?}",
                    variant
                ));
            }
        };

        // Grab the relay of the requested rank
        // Assumes relays are sorted in descending order of rank
        let selected = ranked
            .get(rank)
            .ok_or(format!(
                "[RelaySelector] No {:?} relay found at rank {:?}",
                variant, rank
            ))?
            .clone();

        // Increment the number of active connections
        let count = self.active_connections.get_mut(&selected).ok_or(format!(
            "[RelaySelector] Relay {:?} not found in active connections",
            selected
        ))?;
        *count = count.checked_add(1).ok_or(format!(
            "[RelaySelector] Relay {:?} has reached maximum active connections",
            selected
        ))?;

        // Update the current weight based on the new number of active connections
        let initial_weight = self.initial_weights.get(&selected).ok_or(format!(
            "[RelaySelector] Relay {:?} not found in initial weights",
            selected
        ))?;
        let current_weight = self.current_weights.get_mut(&selected).ok_or(format!(
            "[RelaySelector] Relay {:?} not found in current weights",
            selected
        ))?;
        *current_weight = initial_weight + *count as f32 * CONNECTION_WEIGHT;

        match variant {
            RelayVariant::General => weighted_sort(&mut self.general, &self.current_weights),
            RelayVariant::Inbox => weighted_sort(&mut self.inbox, &self.current_weights),
            RelayVariant::Outbox => weighted_sort(&mut self.outbox, &self.current_weights),
            _ => (),
        }

        Ok(selected.clone())
    }

    pub fn return_relay(&mut self, relay: &str) -> Result<(), String> {
        // Decrement the number of active connections
        let count = self.active_connections.get_mut(relay).ok_or(format!(
            "[RelaySelector] Relay {:?} not found in active connections",
            relay
        ))?;
        *count = count.checked_sub(1).unwrap_or(0); // Quietly ignore lower bound violations

        // Update the current weight based on the new number of active connections
        let initial_weight = self.initial_weights.get(relay).ok_or(format!(
            "[RelaySelector] Relay {:?} not found in initial weights",
            relay
        ))?;
        let current_weight = self.current_weights.get_mut(relay).ok_or(format!(
            "[RelaySelector] Relay {:?} not found in current weights",
            relay
        ))?;
        *current_weight = initial_weight + *count as f32 * CONNECTION_WEIGHT;

        // TODO: Invoke sort on current weights.

        Ok(())
    }
}
