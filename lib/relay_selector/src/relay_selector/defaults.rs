use crate::config;

pub const DEFAULT_WEIGHT: f32 = 1.0;

/// Provides a default relay set for the application. Uses the relay allowlist specified in the
/// application config.
///
/// # Arguments
///
/// * `provider` - The configuration provider to use for fetching the allowlist
pub async fn get_default_relays(provider: &config::JsConfigProvider) -> Vec<String> {
    config::get_server_side_relay_allow_list(provider)
        .await
        .unwrap_or(vec![])
}
