use crate::config;

pub const DEFAULT_WEIGHT: f32 = 1.0;

/// Provides a default relay set for the application. Uses the relay allowlist specified in the
/// application config.
/// TODO: Use this when performing first-time setup.
pub async fn get_default_relays() -> Vec<String> {
    config::get_server_side_relay_allow_list()
        .await
        .unwrap_or(vec![])
}
