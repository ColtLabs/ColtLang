# Colt Protocol Architecture (CPA)

The Colt Protocol Architecture defines the formal contracts governing language conformance, toolchain interoperability, editor integration, and security boundaries for ColtLang.

## Protocol Registry

| Identifier | Protocol Name | Responsibility | Owner |
| :--- | :--- | :--- | :--- |
| **[CLCP](CLCP.md)** | Colt Language Conformance Protocol | Lexical, grammar, AST, and semantic equivalence rules | ColtLang Specification |
| **[CTP](CTP.md)** | Colt Toolchain Protocol | Machine-readable CLI, JSON diagnostics, and exit codes | Colt Toolchain (`colt-cli`) |
| **[CLSP](CLSP.md)** | Colt Language Server Profile | Grounded LSP extensions, capability negotiation, and document synchronization | Colt Toolchain (`colt-lsp`) |
| **[CSTP](CSTP.md)** | Colt Security and Trust Profile | Credential boundaries, `.colt.env`, redaction, and local isolation | Colt Ecosystem |

## Governing Principles

1. **Protocol Evolution without Language Drift**: Changes in wire format, CLI JSON output, or LSP capabilities never alter the formal syntax or semantics of `.colt` programs.
2. **Implementation Independence**: Independent engines (Rust, TypeScript, C++, Go) can verify exact behavioral conformance against standardized fixtures without relying on private implementation details.
3. **Fail-Safe Unknowns**: Unknown mandatory protocol options or version mismatches produce explicit, structured diagnostics.
4. **Deterministic Behavior**: Identical source code and configuration must produce identical token streams, AST nodes, and formatted output.
