use std::env;
use std::process::ExitCode as StdExitCode;

fn main() -> StdExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let code = colt_cli::run(args);
    match code {
        0 => StdExitCode::SUCCESS,
        1 => StdExitCode::from(1),
        _ => StdExitCode::from(2),
    }
}
