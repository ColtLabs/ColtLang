use std::fs;
use std::io::{self, Read};

#[derive(Debug, Clone)]
pub struct SourceUnit {
    pub name: String,
    pub text: String,
}

#[derive(Debug)]
pub struct SourceReadError(pub String);

impl std::fmt::Display for SourceReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for SourceReadError {}

pub fn read_source(file: Option<&str>, stdin: bool) -> Result<SourceUnit, SourceReadError> {
    if stdin {
        let mut buffer = String::new();
        io::stdin()
            .read_to_string(&mut buffer)
            .map_err(|e| SourceReadError(format!("Could not read from standard input: {}", e)))?;
        Ok(SourceUnit {
            name: "<stdin>".to_string(),
            text: buffer,
        })
    } else if let Some(path) = file {
        match fs::read_to_string(path) {
            Ok(text) => Ok(SourceUnit {
                name: path.to_string(),
                text,
            }),
            Err(e) => Err(SourceReadError(format!("Could not read {}: {}", path, e))),
        }
    } else {
        Err(SourceReadError("No input file provided.".to_string()))
    }
}
