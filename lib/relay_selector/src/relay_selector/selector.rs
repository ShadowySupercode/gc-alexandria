use std::collections::HashMap;
use std::time::Duration;

use crate::relay;
use crate::weights;

pub struct RelaySelector {
    // Relay statistics
    pub statistics: HashMap<String, relay::Statistics>,

    // Weights
    initial_weights: weights::RelayWeights,
    current_weights: weights::RelayWeights,

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
            statistics: HashMap::new(),
            initial_weights: HashMap::new(),
            current_weights: HashMap::new(),
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

    pub fn insert(&mut self, relay: &str, variant: relay::Variant) {
        match variant {
            relay::Variant::General => self.general.push(relay.to_string()),
            relay::Variant::Inbox => self.inbox.push(relay.to_string()),
            relay::Variant::Outbox => self.outbox.push(relay.to_string()),
            _ => self.general.push(relay.to_string()),
        }

        self.statistics
            .insert(relay.to_string(), relay::Statistics::new());

        // TODO: Set initial weight and sort
    }

    pub fn get_statistics(&mut self, relay: &str, variant: relay::Variant) -> &relay::Statistics {
        if !self.contains(relay) {
            self.insert(relay, variant);
        }
        self.statistics.get(relay).unwrap()
    }

    fn get_mut_statistics(
        &mut self,
        relay: &str,
        variant: relay::Variant,
    ) -> &mut relay::Statistics {
        if !self.contains(relay) {
            self.insert(relay, variant);
        }
        self.statistics.get_mut(relay).unwrap()
    }
}

// Algorithmic ranking methods
impl RelaySelector {
    pub fn update_weights_with_response_time(
        &mut self,
        relay: &str,
        variant: relay::Variant,
        response_time: Duration,
    ) {
        let (initial_weight, current_weight) = self
            .get_mut_statistics(relay, variant)
            .add_response_time(response_time);

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);
    }

    pub fn update_weights_with_request(
        &mut self,
        relay: &str,
        variant: relay::Variant,
        success: bool,
    ) {
        let (initial_weight, current_weight) =
            self.get_mut_statistics(relay, variant).add_request(success);

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
        variant: relay::Variant,
        rank: usize,
    ) -> Result<String, String> {
        let ranked = match variant {
            relay::Variant::General => &self.general,
            relay::Variant::Inbox => &self.inbox,
            relay::Variant::Outbox => &self.outbox,
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
        let selected_statistics = self.get_mut_statistics(&selected, variant);

        let (initial_weight, current_weight) = selected_statistics.add_active_connection();

        self.initial_weights
            .insert(selected.clone(), initial_weight);
        self.current_weights
            .insert(selected.clone(), current_weight);

        match variant {
            relay::Variant::General => {
                weights::weighted_sort(&mut self.general, &self.current_weights)
            }
            relay::Variant::Inbox => weights::weighted_sort(&mut self.inbox, &self.current_weights),
            relay::Variant::Outbox => {
                weights::weighted_sort(&mut self.outbox, &self.current_weights)
            }
            _ => (),
        }

        Ok(selected.clone())
    }

    pub fn return_relay(&mut self, relay: &str, variant: relay::Variant) -> Result<(), String> {
        let selected_statistics = self.get_mut_statistics(relay, variant);
        let (initial_weight, current_weight) = selected_statistics.remove_active_connection();

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);

        match variant {
            relay::Variant::General => {
                weights::weighted_sort(&mut self.general, &self.current_weights)
            }
            relay::Variant::Inbox => weights::weighted_sort(&mut self.inbox, &self.current_weights),
            relay::Variant::Outbox => {
                weights::weighted_sort(&mut self.outbox, &self.current_weights)
            }
            _ => (),
        }

        Ok(())
    }
}
