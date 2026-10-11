use crate::types::Capabilities;

pub const POSTGRES_CAPABILITIES: Capabilities = Capabilities {
    joins: true,
    transactions: true,
    doc_paths: true,
    vector: true,
    graph: true,
    time_series: true,
    full_text: true,
    ttl: false,
};

pub const SQLITE_CAPABILITIES: Capabilities = Capabilities {
    joins: true,
    transactions: true,
    doc_paths: true,
    vector: false,
    graph: true,
    time_series: false,
    full_text: true,
    ttl: false,
};

pub const LIBSQL_CAPABILITIES: Capabilities = Capabilities {
    joins: true,
    transactions: true,
    doc_paths: true,
    vector: false,
    graph: true,
    time_series: false,
    full_text: true,
    ttl: false,
};

pub const MONGODB_CAPABILITIES: Capabilities = Capabilities {
    joins: false,
    transactions: true,
    doc_paths: true,
    vector: true,
    graph: false,
    time_series: false,
    full_text: true,
    ttl: true,
};

pub const FIRESTORE_CAPABILITIES: Capabilities = Capabilities {
    joins: false,
    transactions: true,
    doc_paths: true,
    vector: false,
    graph: false,
    time_series: false,
    full_text: false,
    ttl: true,
};

pub const REDIS_CAPABILITIES: Capabilities = Capabilities {
    joins: false,
    transactions: false,
    doc_paths: false,
    vector: false,
    graph: false,
    time_series: false,
    full_text: false,
    ttl: true,
};

pub const D1_CAPABILITIES: Capabilities = Capabilities {
    joins: true,
    transactions: true,
    doc_paths: true,
    vector: false,
    graph: false,
    time_series: false,
    full_text: true,
    ttl: false,
};

pub fn capabilities_for_engine(engine: &str) -> Capabilities {
    match engine.to_lowercase().as_str() {
        "postgres" => POSTGRES_CAPABILITIES,
        "sqlite" => SQLITE_CAPABILITIES,
        "libsql" => LIBSQL_CAPABILITIES,
        "mongodb" => MONGODB_CAPABILITIES,
        "firestore" => FIRESTORE_CAPABILITIES,
        "redis" => REDIS_CAPABILITIES,
        "d1" => D1_CAPABILITIES,
        _ => POSTGRES_CAPABILITIES,
    }
}
