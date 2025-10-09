use serde_wasm_bindgen;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// A trait representing a configuration provider for relay settings.
///
/// This abstraction allows the relay_selector library to be decoupled from
/// specific configuration sources. Implementations can provide configuration
/// from files, remote queries, or any other source.
pub trait ConfigProvider {
    /// Gets a configuration value by key.
    ///
    /// # Arguments
    ///
    /// * `key` - The configuration key to retrieve. Expects the following keys to be supported:
    ///   - "serverAllowList": Returns Vec<String>
    ///   - "trustLevels": Returns HashMap<String, f64>
    ///   - "vendorScores": Returns HashMap<String, f64>
    ///
    /// # Returns
    ///
    /// A JsValue that can be deserialized to the appropriate type.
    fn get_config_value(&self, key: &str) -> js_sys::Promise;
}

/// JavaScript callback-based configuration provider.
///
/// This provider accepts a JavaScript function that will be called to retrieve
/// configuration values. The JS function should accept a string key and return
/// a Promise that resolves to the configuration value.
#[wasm_bindgen]
#[derive(Clone)]
pub struct JsConfigProvider {
    callback: js_sys::Function,
}

#[wasm_bindgen]
impl JsConfigProvider {
    #[wasm_bindgen(constructor)]
    pub fn new(callback: js_sys::Function) -> Self {
        Self { callback }
    }
}

impl ConfigProvider for JsConfigProvider {
    fn get_config_value(&self, key: &str) -> js_sys::Promise {
        let key_value = JsValue::from_str(key);
        let promise = self
            .callback
            .call1(&JsValue::NULL, &key_value)
            .unwrap_throw(); // Throw errors back to JS
        js_sys::Promise::resolve(&promise)
    }
}

/// Fetches trust levels for all relays from configuration.
///
/// # Arguments
///
/// * `provider` - The configuration provider to use. Is dynamically dispatched to allow the
/// provider to be specified by JS code at runtime.
///
/// # Returns
///
/// A HashMap mapping relay URLs to their trust level scores.
async fn fetch_trust_levels(
    provider: &dyn ConfigProvider,
) -> Result<HashMap<String, f64>, JsValue> {
    let promise = provider.get_config_value("trustLevels");
    let js_value = wasm_bindgen_futures::JsFuture::from(promise).await?;
    let levels: HashMap<String, f64> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize trust levels: {:?}", e)))?;
    Ok(levels)
}

/// Fetches vendor scores for all relays from configuration.
///
/// # Arguments
///
/// * `provider` - The configuration provider to use. Is dynamically dispatched to allow the
/// provider to be specified by JS code at runtime.
///
/// # Returns
///
/// A HashMap mapping relay URLs to their vendor scores.
async fn fetch_vendor_scores(
    provider: &dyn ConfigProvider,
) -> Result<HashMap<String, f64>, JsValue> {
    let promise = provider.get_config_value("vendorScores");
    let js_value = wasm_bindgen_futures::JsFuture::from(promise).await?;
    let scores: HashMap<String, f64> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize vendor scores: {:?}", e)))?;
    Ok(scores)
}

/// Fetches the relay allowlist from configuration.
///
/// # Arguments
///
/// * `provider` - The configuration provider to use. Is dynamically dispatched to allow the
/// provider to be specified by JS code at runtime.
///
/// # Returns
///
/// A Vec of the URLs of allowed relays.
pub async fn get_server_side_relay_allow_list(
    provider: &dyn ConfigProvider,
) -> Result<Vec<String>, String> {
    let promise = provider.get_config_value("serverAllowList");
    let js_value = wasm_bindgen_futures::JsFuture::from(promise)
        .await
        .map_err(|e| format!("Failed to fetch allowlist: {:?}", e))?;

    let allowlist = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| format!("Failed to deserialize allowlist: {:?}", e))?;
    Ok(allowlist)
}

/// Gets the trust level for a specific relay URL.
///
/// # Arguments
///
/// * `provider` - The configuration provider to use
/// * `relay_url` - The URL of the relay to get the trust level for
///
/// # Returns
///
/// The trust level of the relay, or 0.0 if the config cannot be loaded or the relay is not found.
pub async fn get_trust_level(provider: &dyn ConfigProvider, relay_url: &str) -> f64 {
    match fetch_trust_levels(provider).await {
        Ok(levels) => levels.get(relay_url).copied().unwrap_or(0.0),
        Err(_) => 0.0, // Fallback to default
    }
}

/// Gets the vendor score for a specific relay URL.
///
/// # Arguments
///
/// * `provider` - The configuration provider to use
/// * `relay_url` - The URL of the relay to get the vendor score for
///
/// # Returns
///
/// The vendor score of the relay, or 0.0 if the config cannot be loaded or the relay is not found.
pub async fn get_vendor_score(provider: &dyn ConfigProvider, relay_url: &str) -> f64 {
    match fetch_vendor_scores(provider).await {
        Ok(scores) => scores.get(relay_url).copied().unwrap_or(0.0),
        Err(_) => 0.0, // Fallback to default
    }
}
