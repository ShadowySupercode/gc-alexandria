use std::collections::HashMap;
use std::time::Duration;

pub const CONNECTION_WEIGHT: f32 = 0.1;

pub type RelayWeights = HashMap<String, f32>;

pub fn weighted_sort(relays: &mut Vec<String>, weights: &RelayWeights) {
    assert!(!relays.is_empty(), "[weighted_sort] Relay list is empty");
    assert!(
        !weights.is_empty(),
        "[weighted_sort] Relay weights are empty"
    );

    relays.sort_by(|a, b| {
        assert!(
            weights.contains_key(a),
            "[weighted_sort] Relay {} is missing weight",
            a
        );
        assert!(
            weights.contains_key(b),
            "[weighted_sort] Relay {} is missing weight",
            b
        );

        weights[a].total_cmp(&weights[b])
    });
}

pub fn calculate_weights(
    response_times: &[Duration],
    successful_requests: u32,
    total_requests: u32,
    trust_level_weight: f32,
    preferred_vendor_weight: f32,
    active_connections: u8,
) -> (f32, f32) {
    let median_time: f32 = 1.0; // TODO: Get median of response times.
    let response_time_weight = -1.0 * median_time.log10() + 1.0;
    let success_rate: i32 = successful_requests as i32 / total_requests as i32;

    let initial_weight =
        response_time_weight * success_rate as f32 + trust_level_weight + preferred_vendor_weight;
    let current_weight = initial_weight + active_connections as f32 * CONNECTION_WEIGHT;

    (initial_weight, current_weight)
}
