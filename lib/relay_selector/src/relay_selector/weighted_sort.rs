use crate::relay_selector::selector::RelayWeights;

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
