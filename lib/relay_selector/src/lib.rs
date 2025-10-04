mod config;
mod database;
mod relay;
mod relay_selector;
mod weights;

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use console_error_panic_hook;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

use relay_selector::RelaySelector;

const STORE_NAME: &str = "relay_selector_store";

thread_local! {
    /// Static lifetime, thread-local `RelaySelector` instance.
    ///
    /// The `RelaySelector` acts as an in-memory, mutable repository for relay ranking data. When
    /// initialized, it loads data from persistent storage, and when it is no longer needed, it
    /// saves the data back to persistent storage. The repository data may be mutated via the
    /// functions provided in the `relay_selector` crate's API.
    static RELAY_SELECTOR: Rc<RefCell<Option<RelaySelector>>> = Rc::new(RefCell::new(None));
}

fn relay_selector_is_some() -> bool {
    RELAY_SELECTOR
        .try_with(|selector| selector.borrow().is_some())
        .unwrap_or(false)
}

async fn init_relay_selector(store_name: &str) {
    console_error_panic_hook::set_once();
    let selector = RelaySelector::init(store_name).await.unwrap_throw();
    RELAY_SELECTOR
        .try_with(|rc_selector| rc_selector.borrow_mut().replace(selector))
        .unwrap_throw();
}

fn init_relay_selector_if_none(store_name: &str) {
    let closure_store_name = store_name.to_string();
    if !relay_selector_is_some() {
        spawn_local(async move {
            init_relay_selector(&closure_store_name).await;
        });
    }
}

#[wasm_bindgen]
pub async fn record_response_time(
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

    init_relay_selector_if_none(STORE_NAME);
    RELAY_SELECTOR
        .try_with(|selector| {
            selector
                .borrow_mut()
                .as_mut()
                .unwrap_throw()
                .update_weights_with_response_time(relay_url, variant, response_duration)
        })
        .unwrap_throw()
}

#[wasm_bindgen]
pub fn record_request(relay_url: &str, is_success: bool, relay_type: Option<String>) {
    let variant = match relay_type {
        Some(t) => relay::Variant::from_str(&t).unwrap_throw(),
        None => relay::Variant::General,
    };

    init_relay_selector_if_none(STORE_NAME);
    RELAY_SELECTOR
        .try_with(|selector| {
            selector
                .borrow_mut()
                .as_mut()
                .unwrap_throw()
                .update_weights_with_request(relay_url, variant, is_success);
        })
        .unwrap_throw()
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
/// A relay handle containing the relay URL, its variant, and a private pointer to the selector.
/// When this handle is dropped, it will notify the selector to indicate the relay is no longer in
/// use, and the selector will update the weights accordingly.
///
/// # Errors
///
/// Throws an error if the relay type is invalid, or if an error occurs while selecting the relay.
#[wasm_bindgen]
pub fn get_relay(relay_type: &str, relay_rank: Option<u8>) -> Result<relay::RelayHandle, String> {
    let variant = relay::Variant::from_str(relay_type).unwrap_throw();
    let rank = match relay_rank {
        Some(rank) => rank,
        None => 0,
    } as usize;

    init_relay_selector_if_none(STORE_NAME);
    RELAY_SELECTOR
        .try_with(|selector| {
            let url = selector
                .borrow_mut()
                .as_mut()
                .unwrap_throw()
                .get_relay_by_weighted_round_robin(variant, rank)
                .unwrap_throw();
            Ok(relay::RelayHandle::new(url, variant, selector))
        })
        .unwrap_throw()
}

/// Adds a new relay to the selector.
///
/// The `relay_selector` crate contains hard-coded trust levels and vendor scores for relays. When
/// a new relay is added, if a trust level or vendor score is available, it will be used to set
/// initial weights.
///
/// # Arguments
///
/// * `relay_url` - The URL of the relay to add.
/// * `relay_type` - The type of relay. May be `"general"`, `"inbox"`, or `"outbox"`. Defaults to `"general"`.
///
/// # Errors
///
/// Throws an error if the relay type is invalid or if an error occurs while adding the relay.
#[wasm_bindgen]
pub async fn add_relay(relay_url: &str, relay_type: Option<String>) {
    let variant = match relay_type {
        Some(t) => relay::Variant::from_str(&t).unwrap_throw(),
        None => relay::Variant::General,
    };

    init_relay_selector_if_none(STORE_NAME);

    let trust_level = get_trust_level(relay_url).await;
    let vendor_score = get_vendor_score(relay_url).await;

    RELAY_SELECTOR
        .try_with(|selector| {
            let mut tmp_sel = selector.borrow_mut();
            let sel = tmp_sel.as_mut().unwrap_throw();

            sel.insert(relay_url, variant);

            sel.update_weights_with_trust_level(relay_url, variant, trust_level as f32);
            sel.update_weights_with_vendor_score(relay_url, variant, vendor_score as f32);
        })
        .unwrap_throw()
}


