use std::rc::Rc;

use futures::lock::Mutex;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use web_sys::console;

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
    selector: *const Mutex<Option<relay_selector::RelaySelector>>,
}

impl RelayHandle {
    pub fn new(
        url: String,
        variant: relay::Variant,
        selector: &Rc<Mutex<Option<relay_selector::RelaySelector>>>,
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
        let url = self.url.clone();
        let url_js = JsValue::from_str(&url);

        let variant =
            relay::Variant::from_str(self.variant.as_str()).unwrap_or(relay::Variant::General);

        let selector = unsafe { Rc::from_raw(self.selector) };

        // Spawn async task to acquire mutex and call return_relay
        spawn_local(async move {
            let mut guard = selector.lock().await;
            if let Some(sel) = guard.as_mut() {
                sel.return_relay(&url, variant);
            }
            drop(guard);
            drop(selector);
        });
    }
}
