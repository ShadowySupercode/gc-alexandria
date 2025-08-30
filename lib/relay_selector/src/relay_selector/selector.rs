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
    /// Returns `true` if the relay with the given URL is contained in the selector.
    pub fn contains(&self, relay: &str) -> bool {
        self.general.contains(&relay.to_string())
            || self.inbox.contains(&relay.to_string())
            || self.outbox.contains(&relay.to_string())
    }

    /// Inserts a relay into the selector, respecting its type (i.e., its intended usage category).
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
    /// Updates relay weights based on a new response time datum.
    ///
    /// # Arguments
    ///
    /// * `relay` - The relay URL.
    /// * `variant`
    /// * `response_time`
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

    /// Updates relay weights based on a new completed request.
    ///
    /// # Arguments
    ///
    /// * `relay` - The relay URL.
    /// * `variant` - The relay variant.
    /// * `success` - Whether the request was successful.
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
    /// Selects a relay based on weighted round-robin algorithm.
    ///
    /// Relays are sorted in descending order of rank. Typically, the caller should select the
    /// highest-ranked relay, i.e., the one at index 0. The method will return an error if the
    /// requested rank is out of bounds.
    ///
    /// When this method is invoked, the returned relay is "checked out" from the selector.
    /// Checked-out relays are deprioritized in subsequent selections. When the caller is no longer
    /// using the relay, it should return the relay via the [`RelaySelector::return_relay`] method.
    ///
    /// # Arguments
    ///
    /// * `variant` - The desired relay variant.
    /// * `rank` - The desired relay rank.
    ///
    /// # Returns
    ///
    /// * `Ok(String)` - The selected relay.
    /// * `Err(String)` - An error message.
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

    /// Returns a relay to the selector.
    ///
    /// Users of the [`RelaySelector`] are expected to call this method when they are done using a
    /// relay, i.e., all active connections to that relay have been closed. Returning a relay
    /// increases its weight, making it more likely to be selected in subsequent calls to
    /// [`RelaySelector::select_relay`].
    ///
    /// # Arguments
    ///
    /// * `relay` - The URL of the relay to be returned.
    /// * `variant` - The variant of the relay to be returned.
    pub fn return_relay(&mut self, relay: &str, variant: relay::Variant) {
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
    }
}
