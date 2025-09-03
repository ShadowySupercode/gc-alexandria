use futures::TryStreamExt;
use indexed_db_futures::cursor::Cursor;
use indexed_db_futures::database::Database;
use indexed_db_futures::object_store::ObjectStore;
use indexed_db_futures::prelude::*;
use indexed_db_futures::transaction::{Transaction, TransactionMode};

use crate::database::schema;

const DB_NAME: &str = "relay_selector";

pub async fn get_all_relays(store_name: &str) -> Result<Vec<schema::Relay>, String> {
    let db = open_database(DB_NAME).await?;
    let tx = open_transaction(&db, store_name, TransactionMode::Readonly).await?;
    let store = get_object_store(&tx, store_name).await?;
    let cursor = open_serde_cursor(&store).await?;

    let stream = cursor.stream_ser::<schema::Relay>();
    stream
        .try_collect::<Vec<_>>()
        .await
        .map_err(|err| format!("Failed to collect relays: {:?}", err))
}

pub async fn insert_or_update(store_name: &str, relays: &[schema::Relay]) -> Result<(), String> {
    let db = open_database(DB_NAME).await?;
    let tx = open_transaction(&db, store_name, TransactionMode::Readwrite).await?;
    let store = get_object_store(&tx, store_name).await?;

    for relay in relays {
        store.put(relay);
    }

    commit_transaction(tx).await
}

async fn open_database(database_name: &str) -> Result<Database, String> {
    Database::open(database_name)
        .await
        .or_else(|err| Err(format!("Failed to open database: {:?}", err)))
}

async fn open_transaction<'a>(
    database: &'a Database,
    store_name: &str,
    mode: TransactionMode,
) -> Result<Transaction<'a>, String> {
    database
        .transaction([store_name])
        .with_mode(mode)
        .build()
        .or(Err(format!(
            "Failed to begin transaction on store: {:?}",
            store_name
        )))
}

async fn get_object_store<'a>(
    transaction: &'a Transaction<'a>,
    store_name: &str,
) -> Result<ObjectStore<'a>, String> {
    transaction
        .object_store(store_name)
        .or(Err(format!("Failed to get object store: {:?}", store_name)))
}

async fn open_serde_cursor<'a>(
    store: &'a ObjectStore<'a>,
) -> Result<Cursor<'a, ObjectStore<'a>>, String> {
    match store
        .open_cursor()
        .serde()
        .map_err(|err| {
            format!(
                "Failed to open cursor builder on store {:?} with error {:?}",
                store.name(),
                err
            )
        })?
        .await
        .map_err(|err| {
            format!(
                "Failed to open cursor on store {:?} with error {:?}",
                store.name(),
                err
            )
        })? {
        Some(cursor) => Ok(cursor),
        None => Err(format!("Failed to open cursor on store {:?}", store.name())),
    }
}

async fn commit_transaction<'a>(transaction: Transaction<'a>) -> Result<(), String> {
    transaction
        .commit()
        .await
        .or(Err(format!("Failed to commit transaction")))
}
