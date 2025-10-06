use futures::executor::LocalPool;
use futures::task::LocalSpawnExt;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::time::Duration;
use wasm_bindgen::UnwrapThrowExt;

use crate::config;
use crate::database;
use crate::relay;
use crate::weights;

use super::defaults;

pub struct RelaySelector {
    // Relay statistics
    statistics: HashMap<String, relay::Statistics>,

    // Weights
    pub initial_weights: weights::RelayWeights,
    current_weights: weights::RelayWeights,

    // Sorted relay lists by variant
    general: Vec<String>,
    inbox: Vec<String>,
    outbox: Vec<String>,

    store_name: String,
}

impl Drop for RelaySelector {
    fn drop(&mut self) {
        let relays: Vec<database::Relay> = self
            .general
            .iter()
            .map(|url| {
                database::Relay::from_repositories(
                    url,
                    relay::Variant::General,
                    &self.statistics[url],
                    self,
                )
            })
            .chain(self.inbox.iter().map(|url| {
                database::Relay::from_repositories(
                    url,
                    relay::Variant::Inbox,
                    &self.statistics[url],
                    self,
                )
            }))
            .chain(self.outbox.iter().map(|url| {
                database::Relay::from_repositories(
                    url,
                    relay::Variant::Outbox,
                    &self.statistics[url],
                    self,
                )
            }))
            .collect();

        let store_name = self.store_name.clone();
        LocalPool::new()
            .spawner()
            .spawn_local(async move {
                database::insert_or_update(&store_name, relays.as_slice())
                    .await
                    .unwrap_throw()
            })
            .unwrap_throw()
    }
}

impl RelaySelector {
    pub fn new() -> Self {
        Self {
            statistics: HashMap::new(),
            initial_weights: HashMap::new(),
            current_weights: HashMap::new(),
            general: Vec::new(),
            inbox: Vec::new(),
            outbox: Vec::new(),
            store_name: String::new(),
        }
    }

    /// Initializes the relay selector with data from the IndexedDB store with the given name.
    pub async fn init(store_name: &str) -> Result<Self, String> {
        let mut selector = Self::new();

        for relay in database::get_all_relays(store_name).await? {
            selector.insert(&relay.url, relay.variant).await;
            selector
                .statistics
                .insert(relay.url.clone(), relay.to_statistics());
            selector
                .initial_weights
                .insert(relay.url.clone(), relay.weight);
            selector
                .current_weights
                .insert(relay.url.clone(), relay.weight);
            selector.store_name = store_name.to_string();
        }

        // Add defaults if lists are empty
        if selector.general.is_empty() || selector.inbox.is_empty() || selector.outbox.is_empty() {
            selector.populate_defaults().await?;
        }

        Ok(selector)
    }

    /// Populates the selector with default relays for empty variant lists.
    async fn populate_defaults(&mut self) -> Result<(), String> {
        // Add default general relays if list is empty
        if self.general.is_empty() {
            for relay_url in defaults::get_default_relays().await.iter() {
                self.insert(relay_url.as_str(), relay::Variant::General)
                    .await;
            }
        }

        // Add default inbox relays if list is empty
        if self.inbox.is_empty() {
            for relay_url in defaults::get_default_relays().await.iter() {
                self.insert(relay_url.as_str(), relay::Variant::Inbox).await;
            }
        }

        // Add default outbox relays if list is empty
        if self.outbox.is_empty() {
            for relay_url in defaults::get_default_relays().await.iter() {
                self.insert(relay_url.as_str(), relay::Variant::Outbox)
                    .await;
            }
        }
        Ok(())
    }

    /// Returns `true` if the relay with the given URL is contained in the selector.
    pub fn contains(&self, relay: &str) -> bool {
        self.general.contains(&relay.to_string())
            || self.inbox.contains(&relay.to_string())
            || self.outbox.contains(&relay.to_string())
    }

    /// Inserts a relay into the selector, respecting its type (i.e., its intended usage category).
    pub async fn insert(&mut self, relay: &str, variant: relay::Variant) {
        // Add the relay to the appropriate collections based on its variant.
        match variant {
            relay::Variant::General => self.general.push(relay.to_string()),
            relay::Variant::Inbox => self.inbox.push(relay.to_string()),
            relay::Variant::Outbox => self.outbox.push(relay.to_string()),
            _ => self.general.push(relay.to_string()),
        }

        // Set up the relay's representation in the selector with initial defaults.
        self.statistics
            .insert(relay.to_string(), relay::Statistics::new());
        self.initial_weights
            .insert(relay.to_string(), defaults::DEFAULT_WEIGHT);
        self.current_weights
            .insert(relay.to_string(), defaults::DEFAULT_WEIGHT);

        // If any trust level or vendor score is configured, update the weights accordingly.
        let trust_level = config::get_trust_level(relay);
        let vendor_score = config::get_vendor_score(relay);
        self.update_weights_with_trust_level(relay, trust_level.await as f32);
        self.update_weights_with_vendor_score(relay, vendor_score.await as f32);

        // Sort the relay collections based on the weights.
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

    fn get_mut_statistics(&mut self, relay: &str) -> &mut relay::Statistics {
        self.statistics.get_mut(relay).unwrap()
    }

    /// Updates relay weights based on a new response time datum.
    ///
    /// # Arguments
    ///
    /// * `relay` - The relay URL.
    /// * `response_time`
    pub fn update_weights_with_response_time(&mut self, relay: &str, response_time: Duration) {
        let (initial_weight, current_weight) = self
            .get_mut_statistics(relay)
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
    /// * `success` - Whether the request was successful.
    pub fn update_weights_with_request(&mut self, relay: &str, success: bool) {
        let (initial_weight, current_weight) = self.get_mut_statistics(relay).add_request(success);

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);
    }

    /// Updates the trust level of a relay, then updates its weights accordingly.
    ///
    /// # Arguments
    ///
    /// * `relay` - The relay URL.
    /// * `trust_level` - The new trust level. Replaces the existing trust level.
    pub fn update_weights_with_trust_level(&mut self, relay: &str, trust_level: f32) {
        let (initial_weight, current_weight) = self
            .get_mut_statistics(relay)
            .update_trust_level(trust_level);

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);
    }

    /// Updates the vendor score of a relay, then updates its weights accordingly.
    ///
    /// # Arguments
    ///
    /// * `relay` - The relay URL.
    /// * `vendor_score` - The new vendor score. Replaces the existing score.
    pub fn update_weights_with_vendor_score(&mut self, relay: &str, vendor_score: f32) {
        let (initial_weight, current_weight) = self
            .get_mut_statistics(relay)
            .update_vendor_score(vendor_score);

        self.initial_weights
            .insert(relay.to_string(), initial_weight);
        self.current_weights
            .insert(relay.to_string(), current_weight);
    }

    /// Selects a relay based on weighted round-robin algorithm.
    ///
    /// Relays are sorted in descending order of rank. Typically, the caller should select the
    /// highest-ranked relay, i.e., the one at index 0. The method will return an error if the
    /// requested rank is out of bounds.
    ///
    /// When this method is invoked, the returned relay is "checked out" from the selector.
    /// Checked-out relays are deprioritized in subsequent selections.
    ///
    /// # Arguments
    ///
    /// * `variant` - The desired relay variant.
    /// * `rank` - The desired relay rank.
    /// * `is_server_side` - Whether the call is coming from server-side code.
    ///
    /// # Returns
    ///
    /// * `Ok(String)` - The selected relay.
    /// * `Err(String)` - An error message.
    pub async fn get_relay_by_weighted_round_robin(
        &mut self,
        variant: relay::Variant,
        rank: usize,
        is_server_side: bool,
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

        let is_allowed = config::get_server_side_relay_allow_list()
            .await
            .and_then(|allow_list| {
                Ok(allow_list
                    .iter()
                    .any(|relay| relay.cmp(&selected) == Ordering::Equal))
            })
            .unwrap_or(false);
        if is_server_side && !is_allowed {
            return Err(format!(
                "Network requests to relay {} are not allowed from this server.",
                selected
            ));
        }

        let selected_statistics = self.get_mut_statistics(&selected);
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
    /// Returning a relay increases its weight, making it more likely to be selected in subsequent
    /// calls to [`RelaySelector::select_relay`].
    ///
    /// Relay returns are performed automatically when a [`relay::Handle`] is dropped.
    ///
    /// # Arguments
    ///
    /// * `relay` - The URL of the relay to be returned.
    /// * `variant` - The variant of the relay to be returned.
    pub fn return_relay(&mut self, relay: &str, variant: relay::Variant) {
        let selected_statistics = self.get_mut_statistics(relay);
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
