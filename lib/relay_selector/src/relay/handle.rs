use std::{cell::RefCell, rc::Rc};

use js_sys::JsString;
use wasm_bindgen::prelude::*;

use crate::relay_selector;

#[wasm_bindgen]
pub struct RelayHandle {
    #[wasm_bindgen(getter_with_clone)]
    pub url: js_sys::JsString,
    selector: *const RefCell<relay_selector::RelaySelector>,
}

impl RelayHandle {
    pub fn new(url: String, selector: &Rc<RefCell<relay_selector::RelaySelector>>) -> Self {
        let selector_clone = Rc::clone(selector);
        RelayHandle {
            url: JsString::from(url),
            selector: Rc::into_raw(selector_clone),
        }
    }
}

impl Drop for RelayHandle {
    fn drop(&mut self) {
        let selector = unsafe { Rc::from_raw(self.selector) };
        drop(selector)
    }
}
