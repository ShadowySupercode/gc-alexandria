use std::{cell::RefCell, rc::Rc};

use wasm_bindgen::prelude::*;

use crate::relay;
use crate::relay_selector;

/// A relay handle containing the relay URL, its variant, and a private pointer to the selector.
///
/// This type implements the `Drop` trait to automatically perform cleanup actions when the JS
/// garbage collector deallocates the handle.
#[wasm_bindgen]
pub struct RelayHandle {
    #[wasm_bindgen(getter_with_clone)]
    pub url: String,
    #[wasm_bindgen(getter_with_clone)]
    pub variant: String,
    selector: *const RefCell<Option<relay_selector::RelaySelector>>,
}

impl RelayHandle {
    pub fn new(
        url: String,
        variant: relay::Variant,
        selector: &Rc<RefCell<Option<relay_selector::RelaySelector>>>,
    ) -> Self {
        let selector_clone = Rc::clone(selector);
        RelayHandle {
            url,
            variant: variant.to_string(),
            selector: Rc::into_raw(selector_clone),
        }
    }
}

impl Drop for RelayHandle {
    /// Cleans up the relay handle by returning it to the selector, allowing the selector to update
    /// its weights accordingly.
    fn drop(&mut self) {
        let variant =
            relay::Variant::from_str(self.variant.as_str()).unwrap_or(relay::Variant::General);
        let selector = unsafe { Rc::from_raw(self.selector) };
        selector
            .borrow_mut()
            .as_mut()
            .unwrap()
            .return_relay(self.url.as_str(), variant);
        drop(selector)
    }
}
