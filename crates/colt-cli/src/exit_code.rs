pub struct ExitCode;

impl ExitCode {
    pub const SUCCESS: i32 = 0;
    pub const DIAGNOSTICS: i32 = 1;
    pub const USAGE_ERROR: i32 = 2;
}
