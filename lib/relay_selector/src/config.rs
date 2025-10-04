use serde_wasm_bindgen;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// Import the transpiled configuration_manager module
#[wasm_bindgen(module = "/../configuration_manager/dist/configuration_manager.js")]
extern "C" {
    #[wasm_bindgen(js_name = getRelayConfig, catch)]
    async fn js_get_relay_config(key: &str) -> Result<JsValue, JsValue>;
}

/// Fetches trust levels for all relays from configuration.
/// Returns a HashMap mapping relay URLs to their trust level scores.
async fn fetch_trust_levels() -> Result<HashMap<String, f64>, JsValue> {
    let js_value = js_get_relay_config("trustLevels").await?;
    let levels: HashMap<String, f64> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize trust levels: {:?}", e)))?;
    Ok(levels)
}

/// Fetches vendor scores for all relays from configuration.
/// Returns a HashMap mapping relay URLs to their vendor scores.
async fn fetch_vendor_scores() -> Result<HashMap<String, f64>, JsValue> {
    let js_value = js_get_relay_config("vendorScores").await?;
    let scores: HashMap<String, f64> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize vendor scores: {:?}", e)))?;
    Ok(scores)
}

/// Fetches the relay allowlist from configuration.
/// Returns a Vec of relay URLs that are allowed.
/// TODO: Use this when selecting relays in a server environment.
async fn fetch_relay_allowlist() -> Result<Vec<String>, JsValue> {
    let js_value = js_get_relay_config("serverAllowList").await?;
    let allowlist: Vec<String> = serde_wasm_bindgen::from_value(js_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize allowlist: {:?}", e)))?;
    Ok(allowlist)
}

/// Gets the trust level for a specific relay URL.
/// Falls back to 0.5 if the config cannot be loaded or the relay is not found.
pub async fn get_trust_level(relay_url: &str) -> f64 {
    match fetch_trust_levels().await {
        Ok(levels) => levels.get(relay_url).copied().unwrap_or(0.0),
        Err(_) => 0.5, // Fallback to default
    }
}

/// Gets the vendor score for a specific relay URL.
/// Falls back to 0.5 if the config cannot be loaded or the relay is not found.
pub async fn get_vendor_score(relay_url: &str) -> f64 {
    match fetch_vendor_scores().await {
        Ok(scores) => scores.get(relay_url).copied().unwrap_or(0.0),
        Err(_) => 0.5, // Fallback to default
    }
}

/// Gets the relay allowlist from configuration.
/// Falls back to an empty list if the config cannot be loaded.
pub async fn get_relay_allowlist() -> Vec<String> {
    match fetch_relay_allowlist().await {
        Ok(allowlist) => allowlist,
        Err(_) => Vec::new(), // Fallback to empty list
    }
}
