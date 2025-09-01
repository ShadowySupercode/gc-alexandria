mod database;
mod relay;
mod relay_selector;
mod weights;

use std::{cell::RefCell, rc::Rc, time::Duration};

use wasm_bindgen::prelude::*;

use relay_selector::RelaySelector;

thread_local! {
    /// Static lifetime, thread-local `RelaySelector` instance.
    ///
    /// The `RelaySelector` acts as an in-memory, mutable repository for relay ranking data. When
    /// initialized, it loads data from persistent storage, and when it is no longer needed, it
    /// saves the data back to persistent storage. The repository data may be mutated via the
    /// functions provided in the `relay_selector` crate's API.
    static RELAY_SELECTOR: Rc<RefCell<RelaySelector>> = Rc::new(RefCell::new(RelaySelector::new()));
}

#[wasm_bindgen]
pub fn init() {
    // TODO: Initialize a reference-counted relay selector.
}

#[wasm_bindgen]
pub fn record_response_time(
    relay_url: &str,
    response_time: Option<f32>,
    relay_type: Option<String>,
) {
    let variant = match relay_type {
        Some(t) => relay::Variant::from_str(&t).unwrap_throw(),
        None => relay::Variant::General,
    };
    let response_duration =
        Duration::try_from_secs_f32(response_time.unwrap_throw()).unwrap_throw();

    RELAY_SELECTOR.with(|selector| {
        selector.borrow_mut().update_weights_with_response_time(
            relay_url,
            variant,
            response_duration,
        );
    });
}

#[wasm_bindgen]
pub fn record_request(relay_url: &str, is_success: bool, relay_type: Option<String>) {
    let variant = match relay_type {
        Some(t) => relay::Variant::from_str(&t).unwrap_throw(),
        None => relay::Variant::General,
    };

    RELAY_SELECTOR.with(|selector| {
        selector
            .borrow_mut()
            .update_weights_with_request(relay_url, variant, is_success);
    });
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
pub fn get_relay(relay_type: &str, relay_rank: Option<u8>) -> Result<relay::RelayHandle, String> {
    let variant = relay::Variant::from_str(relay_type).unwrap_throw();
    let rank = match relay_rank {
        Some(rank) => rank,
        None => 0,
    } as usize;

    RELAY_SELECTOR.with(|selector| {
        let url = selector
            .borrow_mut()
            .get_relay_by_weighted_round_robin(variant, rank)
            .unwrap_throw();
        Ok(relay::RelayHandle::new(url, &selector))
    })
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
    // TODO: Determine variant, then return
    let variant: relay::Variant = relay::Variant::General;
    RELAY_SELECTOR.with(|selector| selector.borrow_mut().return_relay(relay_url, variant));
    Ok(())
}
