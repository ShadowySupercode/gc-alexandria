mod config;
mod database;
mod relay;
mod relay_selector;
mod weights;

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use console_error_panic_hook;
use futures::lock::Mutex;
use wasm_bindgen::prelude::*;
use web_sys::console;

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

    /// Static lifetime, thread-local configuration provider.
    ///
    /// This stores the configuration callback function that will be used by the RelaySelector
    /// to retrieve configuration values.
    static CONFIG_PROVIDER: RefCell<Option<config::JsConfigProvider>> = RefCell::new(None);

    /// Use this mutex to prevent race conditions during relay selector initialization.
    static INIT_MUTEX: Rc<Mutex<()>> = Rc::new(Mutex::new(()));
}

fn relay_selector_is_some() -> bool {
    RELAY_SELECTOR
        .try_with(|selector| selector.borrow().is_some())
        .unwrap_or(false)
}

/// Checks whether the relay selector is initialized, and performs the initialization if not.
///
/// This function uses a mutex to prevent race conditions. Callers "late" to the initialization
/// will await mutex release.
async fn ensure_relay_selector_initialized(store_name: &str) {
    // Fast path: check if already initialized (no lock needed)
    if relay_selector_is_some() {
        return;
    }

    // Slow path: clone the mutex Rc out of thread-local storage to acquire lock
    let mutex = INIT_MUTEX.with(|m| Rc::clone(m));
    let _guard = mutex.lock().await;

    // Double-check: another task might have initialized while we waited for the lock
    if relay_selector_is_some() {
        return;
    }

    // We hold the lock and selector is still None - safe to initialize

    console_error_panic_hook::set_once();

    // Get the config provider from thread-local storage
    let config_provider = CONFIG_PROVIDER
        .try_with(|provider| provider.borrow().as_ref().cloned())
        .unwrap_throw()
        .expect("Config provider must be set before initializing relay selector");

    let selector = RelaySelector::init(store_name, config_provider)
        .await
        .unwrap_throw();

    RELAY_SELECTOR
        .try_with(|rc_selector| {
            // Only replace if still None (extra safety check)
            let mut borrow = rc_selector.borrow_mut();
            if borrow.is_none() {
                *borrow = Some(selector);
            } else {
            }
        })
        .unwrap_throw();

    // TODO: Reference count for selector memory goes to 0 before lock is released, causing
    // premature drop.

    // Lock released when _guard is dropped
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

    ensure_relay_selector_initialized(STORE_NAME).await;

    let selector_rc = RELAY_SELECTOR.try_with(|rc| rc.clone()).unwrap_throw();
    let mut selector_ref = selector_rc.borrow_mut();
    let selector = selector_ref.as_mut().unwrap_throw();

    if !selector.contains(relay_url) {
        selector.insert(relay_url, variant).await;
    }

    selector.update_weights_with_response_time(relay_url, response_duration)
}

#[wasm_bindgen]
pub async fn record_request(relay_url: &str, is_success: bool, relay_type: Option<String>) {
    let variant = match relay_type {
        Some(t) => relay::Variant::from_str(&t).unwrap_throw(),
        None => relay::Variant::General,
    };

    ensure_relay_selector_initialized(STORE_NAME).await;

    let selector_rc = RELAY_SELECTOR.try_with(|rc| rc.clone()).unwrap_throw();
    let mut selector_ref = selector_rc.borrow_mut();
    let selector = selector_ref.as_mut().unwrap_throw();

    if !selector.contains(relay_url) {
        selector.insert(relay_url, variant).await;
    }

    selector.update_weights_with_request(relay_url, is_success)
}

/// Sets the configuration provider callback for the relay selector.
///
/// This function must be called before any other relay selector operations.
/// The config_callback should be a JavaScript function that accepts a string key
/// and returns a Promise resolving to the configuration value.
///
/// # Arguments
///
/// * `config_callback` - A JavaScript function that provides configuration values.
///   The function signature should be: `(key: string) => Promise<ConfigValue>`
///
/// # Example (JavaScript)
///
/// ```js
/// import { setConfigProvider } from './relay_selector';
/// import { getConfigValue } from './config-provider';
///
/// setConfigProvider(getConfigValue);
/// ```
#[wasm_bindgen]
pub fn set_config_provider(config_callback: js_sys::Function) {
    let provider = config::JsConfigProvider::new(config_callback);
    CONFIG_PROVIDER
        .try_with(|p| p.borrow_mut().replace(provider))
        .unwrap_throw();
}

/// Get a recommended relay URL based on current weights.
///
/// **Important**: You must call `set_config_provider` before calling this function.
///
/// # Arguments
///
/// * `relay_type` - The type of relay. May be `"general"`, `"inbox"`, or `"outbox"`.
/// * `relay_rank` - The relay rank based on current weights. Defaults to `0` to select the
/// highest-ranked relay.
/// * `is_server_side` - Whether this function is being invoked on a server environment, rather
/// than client-side on an end user device or in a browser. When true, only relays in the
/// server allowlist will be selected.
///
/// # Returns
///
/// A relay handle containing the relay URL, its variant, and a private pointer to the selector.
/// When this handle is dropped, it will notify the selector to indicate the relay is no longer in
/// use, and the selector will update the weights accordingly.
///
/// # Errors
///
/// Throws an error if the relay type is invalid, if the selected relay is not in the server
/// allowlist (when `is_server_side` is true), or if an error occurs while selecting the relay.
#[wasm_bindgen]
pub async fn get_relay(
    relay_type: &str,
    relay_rank: Option<u8>,
    is_server_side: Option<bool>,
) -> Result<relay::RelayHandle, String> {
    console::log_1(&"[get_relay] starting".into());

    let variant = relay::Variant::from_str(relay_type).unwrap_throw();
    console::log_2(
        &"[get_relay] relay type".into(),
        &variant.to_string().into(),
    );

    let rank = match relay_rank {
        Some(rank) => rank,
        None => 0,
    } as usize;
    console::log_2(
        &"[get_relay] requested rank".into(),
        &rank.to_string().into(),
    );

    ensure_relay_selector_initialized(STORE_NAME).await;

    // First, clone the reference counted variable (cloning increases the reference count) out of
    // the thread-local storage. This clone of the reference will go out of scope when the function
    // returns.
    let selector_rc = RELAY_SELECTOR.try_with(|rc| rc.clone()).unwrap_throw();
    console::log_1(&"[get_relay] got relay selector ref".into());

    // The clone is necessary because `get_relay_by_weighted_round_robin` is async, and we cannot
    // pass references to the data inside the thread-local storage across an `await` within the
    // thread-local storage's `try_with` callback.
    let url = selector_rc
        .borrow_mut()
        .as_mut()
        .unwrap_throw()
        .get_relay_by_weighted_round_robin(variant, rank, is_server_side.unwrap_or(false))
        .await
        .unwrap_throw();
    console::log_2(&"[get_relay] got relay url".into(), &url.clone().into());

    Ok(relay::RelayHandle::new(url, variant, &selector_rc))
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

    ensure_relay_selector_initialized(STORE_NAME).await;

    let selector_rc = RELAY_SELECTOR.try_with(|rc| rc.clone()).unwrap_throw();
    selector_rc
        .borrow_mut()
        .as_mut()
        .unwrap_throw()
        .insert(relay_url, variant)
        .await;
}
