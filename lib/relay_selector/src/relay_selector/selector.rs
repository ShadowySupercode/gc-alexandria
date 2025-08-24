use std::collections::HashMap;

use crate::relay::RelayVariant;
use crate::relay_selector::weighted_sort::weighted_sort;

pub type RelayWeights = HashMap<String, f32>;

const CONNECTION_WEIGHT: f32 = 0.1;

pub struct RelaySelector {
    initial_weights: RelayWeights,
    current_weights: RelayWeights,

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
            active_connections: HashMap::new(),
            general: Vec::new(),
            inbox: Vec::new(),
            outbox: Vec::new(),
        }
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
