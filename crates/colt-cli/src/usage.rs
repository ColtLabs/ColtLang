pub fn version_text() -> &'static str {
    "colt 0.2.0\n"
}

pub fn help_text() -> String {
    [
        "colt — the ColtLang compiler command line interface.",
        "",
        "Usage:",
        "  colt <command> [file.colt] [options]",
        "",
        "  colt 0.2.0",
        "",
        "Commands:",
        "  check <file>         Lex, parse, and compile; report diagnostics. Exit 1 on any error.",
        "  plan  <file>         Compile and print the backend-neutral execution plan as JSON.",
        "  parse <file>         Parse and print the AST as JSON.",
        "  lex   <file>         Lex and print the token stream.",
        "  capabilities         Print the Postgres Tier-1 capability matrix.",
        "  fmt   <file>         Format Colt source file consistently.",
        "  help                 Print this help.",
        "  version              Print the CLI version.",
        "",
        "Options:",
        "  --json               Emit machine-readable JSON instead of text.",
        "  --stdin, -           Read .colt source from standard input.",
        "  --quiet              Suppress success messages.",
        "  --check              Check if file is formatted without writing (fmt only).",
        "  --help, -h           Print this help.",
        "  --version, -V        Print the CLI version.",
        "",
        "The compiler never connects to a provider, executes a plan, or embeds values in SQL.",
        "",
    ]
    .join("\n")
}
