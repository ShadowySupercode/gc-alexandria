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
    response_times: &mut [Duration],
    successful_requests: u32,
    total_requests: u32,
    trust_level_weight: f32,
    preferred_vendor_weight: f32,
    active_connections: u8,
) -> (f32, f32) {
    // Get the median response time in milliseconds
    response_times.sort();
    let response_times_len = response_times.len();
    let is_odd_len = response_times_len % 2 == 1;
    let median_time = if is_odd_len {
        response_times[response_times_len / 2].as_millis() as f32
    } else {
        (response_times[response_times_len / 2].as_millis() as f32
            + response_times[response_times_len / 2 - 1].as_millis() as f32)
            / 2f32
    };

    let response_time_weight = -1.0 * median_time.log10() + 1.0;
    let success_rate: i32 = successful_requests as i32 / total_requests as i32;

    let initial_weight =
        response_time_weight * success_rate as f32 + trust_level_weight + preferred_vendor_weight;
    let current_weight = initial_weight + active_connections as f32 * CONNECTION_WEIGHT;

    (initial_weight, current_weight)
}
