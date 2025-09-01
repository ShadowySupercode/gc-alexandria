use indexed_db_futures::database::Database;
use indexed_db_futures::prelude::*;
use indexed_db_futures::transaction::TransactionMode;

use crate::database::schema;

pub async fn insert_or_update(store_name: &str, relay: schema::Relay) -> Result<(), String> {
    // TODO: Move this to a module-level constant.
    const DB_NAME: &str = "relay_selector";
    let db = match Database::open(DB_NAME).await {
        Ok(db) => db,
        Err(err) => Err(format!("Failed to open database: {:?}", err))?,
    };
    let tx = match db
        .transaction([store_name])
        .with_mode(TransactionMode::Readwrite)
        .build()
    {
        Ok(tx) => tx,
        Err(err) => Err(format!("Failed to create transaction: {:?}", err))?,
    };
    let store = match tx.object_store(store_name) {
        Ok(store) => store,
        Err(err) => Err(format!("Failed to get object store: {:?}", err))?,
    };

    store.put(relay);

    match tx.commit().await {
        Ok(_) => Ok(()),
        Err(err) => Err(format!("Failed to commit transaction: {:?}", err))?,
    }
}
