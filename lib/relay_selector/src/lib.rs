mod relay;
mod relay_selector;

use std::cell::RefCell;

use wasm_bindgen::prelude::*;

use relay::RelayVariant;
use relay_selector::RelaySelector;

thread_local! {
    /// Static lifetime, thread-local `RelaySelector` instance.
    ///
    /// The `RelaySelector` acts as an in-memory, mutable repository for relay ranking data. When
    /// initialized, it loads data from persistent storage, and when it is no longer needed, it
    /// saves the data back to persistent storage. The repository data may be mutated via the
    /// functions provided in the `relay_selector` crate's API.
    static RELAY_SELECTOR: RefCell<RelaySelector> = RefCell::new(RelaySelector::new());
}

#[wasm_bindgen]
pub fn init() {
    // TODO: Initialize a reference-counted relay selector.
}

#[wasm_bindgen]
pub fn add_response_time(relay_url: &str, response_time: Option<f32>) {
    // TODO: Implement.
    // May delegate to other modules.
}

#[wasm_bindgen]
pub fn add_success(relay_url: &str, success: bool, relay_type: Option<String>) {
    let variant = match relay_type {
        Some(t) => RelayVariant::from_str(&t).unwrap_throw(),
        None => RelayVariant::General,
    };

    if !RELAY_SELECTOR.with(|selector| selector.borrow().contains(relay_url)) {
        RELAY_SELECTOR.with(|selector| selector.borrow_mut().insert(relay_url, variant));
    }

    RELAY_SELECTOR.with(|selector| {
        selector
            .borrow_mut()
            .update_success_rate(relay_url, success)
    });

    // TODO: Get success rate and sort
}

/// Get a recommended relay URL based on current weights.
///
/// # Arguments
///
/// * `relay_type` - The type of relay. May be `"general"`, `"inbox"`, or `"outbox"`.
/// * `relay_rank` - The relay rank based on current weights. Defaults to `0` to select the
/// highest-ranked relay.
///
/// # Returns
///
/// A relay URL.
///
/// # Errors
///
/// Throws an error if the relay type is invalid, or if an error occurs while selecting the relay.
///
/// # Remarks
///
/// When the relay indicated by the returned URL is no longer in use, it should be returned with
/// [`return_relay`] to prevent memory leaks.
#[wasm_bindgen]
pub fn get_relay(relay_type: &str, relay_rank: Option<u8>) -> Result<String, String> {
    let variant = RelayVariant::from_str(relay_type).unwrap_throw();
    let rank = match relay_rank {
        Some(rank) => rank,
        None => 0,
    } as usize;

    RELAY_SELECTOR
        .with_borrow_mut(|selector| selector.get_relay_by_weighted_round_robin(variant, rank))
}

/// Return a relay URL to indicate it that relay is no longer in use.
///
/// # Arguments
///
/// * `relay_url` - The URL of the relay to return.
///
/// # Errors
///
/// Throws an error if the caller attempts to return a relay URL that is not currently in use.
#[wasm_bindgen]
pub fn return_relay(relay_url: &str) -> Result<(), String> {
    RELAY_SELECTOR.with_borrow_mut(|selector| selector.return_relay(relay_url))
}
