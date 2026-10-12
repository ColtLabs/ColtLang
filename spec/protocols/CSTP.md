# Colt Security and Trust Profile (CSTP)

Version: 1.0  
Status: Normative  
Security Boundary: Credential Isolation & Execution Sandboxing

## 1. Threat Model & Boundaries

Colt programs declare database endpoints and cross-database schemas. Because `.colt` files are shared in version control, the language enforces strict security boundaries to prevent credential leaks, unauthorized schema modifications, and remote code execution.

## 2. Mandatory Security Rules

### 2.1 Zero-Credential Storage in Source Files
1. Connection strings with passwords, tokens, or private endpoints **MUST NOT** appear literally in `.colt` files.
2. The compiler actively scans connection strings for embedded credentials and emits `COLT2023` (`Connection url cannot contain literal credentials; use env("VAR") instead`).
3. Only the `env("VAR")` constructor is permitted.

### 2.2 Local Secrets Isolation (`.colt.env`)
1. Local secrets for development must reside in `.colt.env`.
2. `.colt.env` and `*.colt.env` are permanently added to root `.gitignore`.
3. Repositories must provide a sanitized template in `.colt.env.example` with dummy placeholders.

### 2.3 Diagnostic Redaction
Plan outputs, CLI logs, and compiler diagnostics automatically redact all secrets, database credentials, and authorization headers:
```
CONNECT main AS postgres(env("DATABASE_URL")) -> Endpoint: [REDACTED]
```

### 2.4 Isolation from Operating System
ColtLang contains no system call primitives, file execution hooks, eval statements, or dynamic code compilation. Source files cannot execute arbitrary commands on developer machines or CI/CD runners.
