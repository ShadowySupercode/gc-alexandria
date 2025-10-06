use serde_wasm_bindgen;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// Imports from the @alexandria/configuration_manager module (which must be transpiled from TS to
// JS to be used by wasm_bindgen).
#[wasm_bindgen(module = "/../configuration_manager/dist/configuration_manager.bundle.js")]
extern "C" {
    // A JavaScript function that retrieves the relay configuration from a YAML file.
    //
    // # Arguments
    //
    // * `key`: Specifies the value(s) to retrieve from the configuration. Only certain keys are
    // allowed; they are defined in the configuration module.
    #[wasm_bindgen(js_name = getRelayConfig, catch)]
    async fn js_get_relay_config(key: &str) -> Result<JsValue, JsValue>;
}

/// Fetches trust levels for all relays from configuration.
///
/// # Returns
///
/// A HashMap mapping relay URLs to their trust level scores.
async fn fetch_trust_levels() -> Result<HashMap<String, f64>, JsValue> {
    let js_value = js_get_relay_config("trustLevels").await?;
    let levels: HashMap<String, f64> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize trust levels: {:?}", e)))?;
    Ok(levels)
}

/// Fetches vendor scores for all relays from configuration.
///
/// # Returns
///
/// A HashMap mapping relay URLs to their vendor scores.
async fn fetch_vendor_scores() -> Result<HashMap<String, f64>, JsValue> {
    let js_value = js_get_relay_config("vendorScores").await?;
    let scores: HashMap<String, f64> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize vendor scores: {:?}", e)))?;
    Ok(scores)
}

/// Fetches the relay allowlist from configuration.
///
/// # Returns
///
/// A Vec of the URLs of allowed relays.
pub async fn get_server_side_relay_allow_list() -> Result<Vec<String>, String> {
    let allowlist = serde_wasm_bindgen::from_value(
        js_get_relay_config("serverAllowList")
            .await
            .map_err(|e| format!("Failed to deserialize allowlist: {:?}", e))?,
    )
    .map_err(|e| format!("Failed to deserialize allowlist: {:?}", e))?;
    Ok(allowlist)
}

/// Gets the trust level for a specific relay URL.
///
/// # Arguments
///
/// * `relay_url` - The URL of the relay to get the trust level for.
///
/// # Returns
///
/// The trust level of the relay, or 0.0 if the config cannot be loaded or the relay is not found.
pub async fn get_trust_level(relay_url: &str) -> f64 {
    match fetch_trust_levels().await {
        Ok(levels) => levels.get(relay_url).copied().unwrap_or(0.0),
        Err(_) => 0.0, // Fallback to default
    }
}

/// Gets the vendor score for a specific relay URL.
///
/// # Arguments
///
/// * `relay_url` - The URL of the relay to get the trust level for.
///
/// # Returns
///
/// The vendor score of the relay, or 0.0 if the config cannot be loaded or the relay is not found.
pub async fn get_vendor_score(relay_url: &str) -> f64 {
    match fetch_vendor_scores().await {
        Ok(scores) => scores.get(relay_url).copied().unwrap_or(0.0),
        Err(_) => 0.0, // Fallback to default
    }
}
