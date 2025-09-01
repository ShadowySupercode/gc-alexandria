use std::time::Duration;

use crate::weights;

pub struct Statistics {
    pub requests: u32,
    pub successful_requests: u32,
    pub response_times: Vec<Duration>,
    pub trust_level: f32,
    pub vendor_score: f32,
    active_connections: u8,
}

impl Statistics {
    pub fn new() -> Self {
        Self {
            requests: 0,
            successful_requests: 0,
            response_times: Vec::new(),
            trust_level: 0.0,
            vendor_score: 0.0,
            active_connections: 0,
        }
    }
}

impl Statistics {
    /// Adds a response time datum returns updated weights.
    ///
    /// # Arguments
    ///
    /// * `response_time` - The time it took for the request to complete.
    ///
    /// # Returns
    ///
    /// A tuple containing the updated initial and current weights of the relay.
    pub fn add_response_time(&mut self, response_time: Duration) -> (f32, f32) {
        self.response_times.push(response_time);
        weights::calculate_weights(
            self.response_times.as_mut_slice(),
            self.successful_requests,
            self.requests,
            self.trust_level,
            self.vendor_score,
            self.active_connections,
        )
    }

    /// Adds a request datum returns updated weights.
    ///
    /// # Arguments
    ///
    /// * `is_successful` - Whether the request was successful.
    ///
    /// # Returns
    ///
    /// A tuple containing the updated initial and current weights of the relay.
    pub fn add_request(&mut self, is_successful: bool) -> (f32, f32) {
        self.requests += 1;
        if is_successful {
            self.successful_requests += 1;
        }
        weights::calculate_weights(
            self.response_times.as_mut_slice(),
            self.successful_requests,
            self.requests,
            self.trust_level,
            self.vendor_score,
            self.active_connections,
        )
    }

    /// Adds an active connection datum returns updated weights.
    ///
    /// # Returns
    ///
    /// A tuple containing the updated initial and current weights of the relay.
    pub fn add_active_connection(&mut self) -> (f32, f32) {
        self.active_connections += 1;
        weights::calculate_weights(
            self.response_times.as_mut_slice(),
            self.successful_requests,
            self.requests,
            self.trust_level,
            self.vendor_score,
            self.active_connections,
        )
    }

    /// Removes an active connection datum returns updated weights.
    ///
    /// # Returns
    ///
    /// A tuple containing the updated initial and current weights of the relay.
    pub fn remove_active_connection(&mut self) -> (f32, f32) {
        self.active_connections -= 1;
        weights::calculate_weights(
            self.response_times.as_mut_slice(),
            self.successful_requests,
            self.requests,
            self.trust_level,
            self.vendor_score,
            self.active_connections,
        )
    }
}
