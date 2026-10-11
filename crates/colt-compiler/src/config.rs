use crate::types::{ConnectionModel, EngineType};

pub fn parse_colt_toml(content: &str) -> Vec<ConnectionModel> {
    let mut connections = Vec::new();
    let mut current_alias: Option<String> = None;
    let mut current_engine: Option<String> = None;
    let mut current_url_env: Option<String> = None;

    let flush = |alias: &mut Option<String>,
                 engine: &mut Option<String>,
                 url_env: &mut Option<String>,
                 conns: &mut Vec<ConnectionModel>| {
        if let (Some(a), Some(e)) = (alias.take(), engine.take()) {
            if let Some(engine_type) = EngineType::from_str_loose(&e) {
                conns.push(ConnectionModel {
                    alias: a,
                    engine: engine_type,
                    env_var: None,
                    url_env: url_env.take(),
                    span: None,
                });
            }
        }
        *alias = None;
        *engine = None;
        *url_env = None;
    };

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with("[connections.") && line.ends_with(']') {
            flush(
                &mut current_alias,
                &mut current_engine,
                &mut current_url_env,
                &mut connections,
            );
            let section_name = &line["[connections.".len()..line.len() - 1];
            current_alias = Some(section_name.to_string());
            continue;
        }

        if current_alias.is_some() {
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim().to_lowercase();
                let val = val.trim();
                let clean_val = val.trim_matches(|c| c == '"' || c == '\'');
                if key == "engine" {
                    current_engine = Some(clean_val.to_string());
                } else if key == "url_env" || key == "env_var" {
                    current_url_env = Some(clean_val.to_string());
                }
            }
        }
    }

    flush(
        &mut current_alias,
        &mut current_engine,
        &mut current_url_env,
        &mut connections,
    );
    connections
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_colt_toml() {
        let toml = r#"
# Connections configuration
[connections.main]
engine = "postgres"
url_env = "DATABASE_URL"

[connections.cache]
engine = "redis"
url_env = "REDIS_URL"
"#;
        let conns = parse_colt_toml(toml);
        assert_eq!(conns.len(), 2);
        assert_eq!(conns[0].alias, "main");
        assert_eq!(conns[0].engine, EngineType::Postgres);
        assert_eq!(conns[0].url_env, Some("DATABASE_URL".to_string()));
        assert_eq!(conns[1].alias, "cache");
        assert_eq!(conns[1].engine, EngineType::Redis);
        assert_eq!(conns[1].url_env, Some("REDIS_URL".to_string()));
    }
}
