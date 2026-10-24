use crate::tui;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandName {
    Check,
    Plan,
    Lex,
    Parse,
    Capabilities,
    Fmt,
    Run,
    Doctor,
    Interactive,
    Help,
    Version,
}

impl CommandName {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "check" => Some(Self::Check),
            "plan" => Some(Self::Plan),
            "lex" => Some(Self::Lex),
            "parse" => Some(Self::Parse),
            "capabilities" => Some(Self::Capabilities),
            "fmt" => Some(Self::Fmt),
            "run" => Some(Self::Run),
            "doctor" => Some(Self::Doctor),
            "help" => Some(Self::Help),
            "version" => Some(Self::Version),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Check => "check",
            Self::Plan => "plan",
            Self::Lex => "lex",
            Self::Parse => "parse",
            Self::Capabilities => "capabilities",
            Self::Fmt => "fmt",
            Self::Run => "run",
            Self::Doctor => "doctor",
            Self::Interactive => "interactive",
            Self::Help => "help",
            Self::Version => "version",
        }
    }

    pub fn takes_source(&self) -> bool {
        matches!(
            self,
            Self::Check | Self::Plan | Self::Lex | Self::Parse | Self::Fmt | Self::Run
        )
    }
}

#[derive(Debug, Clone)]
pub struct CliOptions {
    pub command: CommandName,
    pub file: Option<String>,
    pub json: bool,
    pub stdin: bool,
    pub quiet: bool,
    pub check: bool,
    pub dry_run: bool,
    pub verbose: bool,
}

#[derive(Debug)]
pub struct UsageError(pub String);

impl std::fmt::Display for UsageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for UsageError {}

pub fn parse_args<I, T>(args: I) -> Result<CliOptions, UsageError>
where
    I: IntoIterator<Item = T>,
    T: AsRef<str>,
{
    let mut command: Option<CommandName> = None;
    let mut file: Option<String> = None;
    let mut json = false;
    let mut stdin = false;
    let mut quiet = false;
    let mut check = false;
    let mut dry_run = false;
    let mut verbose = false;

    for arg in args {
        let arg = arg.as_ref();
        match arg {
            "--json" => json = true,
            "--stdin" => stdin = true,
            "--quiet" => quiet = true,
            "--check" => check = true,
            "--dry-run" => dry_run = true,
            "--verbose" | "-v" => verbose = true,
            "--help" | "-h" => command = Some(CommandName::Help),
            "--version" | "-V" => command = Some(CommandName::Version),
            "-" => stdin = true,
            _ => {
                if arg.starts_with('-') {
                    return Err(UsageError(format!("Unknown option {}.", arg)));
                }
                if command.is_none() {
                    if let Some(cmd) = CommandName::from_str(arg) {
                        command = Some(cmd);
                        continue;
                    }
                }
                if file.is_none() && command != Some(CommandName::Help) && command != Some(CommandName::Version) {
                    file = Some(arg.to_string());
                } else {
                    return Err(UsageError(format!("Unexpected argument {}.", arg)));
                }
            }
        }
    }

    if command == Some(CommandName::Help) || command == Some(CommandName::Version) {
        return Ok(CliOptions {
            command: command.unwrap(),
            file: None,
            json,
            stdin,
            quiet,
            check,
            dry_run,
            verbose,
        });
    }

    let final_command = match command {
        Some(cmd) => cmd,
        None => {
            if file.is_none() && !stdin {
                if !json && !quiet && tui::is_interactive_terminal() {
                    CommandName::Interactive
                } else {
                    CommandName::Help
                }
            } else {
                CommandName::Check
            }
        }
    };

    if final_command.takes_source() && file.is_none() && !stdin {
        return Err(UsageError(format!(
            "The {} command needs a .colt file, or --stdin to read standard input.",
            final_command.as_str()
        )));
    }

    if !final_command.takes_source() && final_command != CommandName::Interactive && file.is_some() {
        return Err(UsageError(format!(
            "The {} command does not take a source file.",
            final_command.as_str()
        )));
    }

    Ok(CliOptions {
        command: final_command,
        file,
        json,
        stdin,
        quiet,
        check,
        dry_run,
        verbose,
    })
}
