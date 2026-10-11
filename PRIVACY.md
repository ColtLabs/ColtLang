# ColtaneDB Privacy Policy

**Effective Date:** October 2026  
**Last Updated:** October 3, 2026  
**Platform URL:** [https://coltanedb.vercel.app](https://coltanedb.vercel.app)  
**Maintained by:** Ayush Bhattacharya ([info.cometlabs@gmail.com](mailto:info.cometlabs@gmail.com))

---

## 1. Overview & Scope

ColtaneDB is an open-source, web-first multi-model database engine and query router built around **Colt**, a custom query language for unified access across relational, key-value, document, and vector storage engines.

This Privacy Policy explains how ColtaneDB ("we", "our", or "the Platform") handles personal information, credentials, and query data when you:
1. Visit our web portal at [coltanedb.vercel.app](https://coltanedb.vercel.app).
2. Use the interactive Colt Studio IDE, Schema Designer, or Table Explorer.
3. Authenticate using Firebase Authentication (Google OAuth or Email/Password).
4. Send query requests to our REST endpoints (`/api/v1/query`) or client SDKs.

We prioritize data minimization, tenant sovereignty, and transparent open-source operations.

---

## 2. Information We Collect

### A. Authentication & Account Information
- **Email Address:** Collected when registering via Email/Password or Google Sign-In through Firebase Authentication. Used solely for authentication, session verification, and account recovery.
- **Google OAuth Profile Identifiers:** When authenticating via Google Sign-In, Firebase provides your Google User ID (UID), verified email address, and public avatar URL. We do not request access to Google Drive, contacts, or external Google profile permissions.
- **Invitation Tokens:** If you join the alpha program via an invite code (such as `COLTANE-ALPHA-2026`), we record code redemption to provision your isolated tenant workspace.

### B. Workspace, Tenant, and Query Data
- **Tenant Identifiers:** Cryptographically generated unique identifiers (e.g., `tnt_xxxx`) that namespace your storage tables, document collections, and vector indices.
- **API Keys:** Cryptographic keys (e.g., `clt_live_xxxx`) generated for programmatic API access. API keys are hashed and stored with TenantGuard permission masks (`read`, `write`).
- **Colt Query Code:** <code>.colt</code> language source code executed in the browser studio or sent via HTTP API to compile abstract syntax trees (ASTs), execution plans, and result sets.

### C. Local Storage & Cookies
ColtaneDB does **not** use third-party marketing cookies, behavioral ad trackers, or cross-site tracking pixels. We use browser `localStorage` solely for functional platform features:
- `coltane_tenant_v1`: Stores your active tenant ID and API key to maintain your workspace session across page reloads.
- `coltane_theme`: Stores your UI theme preference (dark / obsidian mode).
- `coltane_cookies_decided` & `coltane_cookies_accepted`: Stores your cookie consent selection.

---

## 3. How We Process & Route Data

ColtaneDB operates as a compiler and execution router:
- **TenantGuard Cryptographic Isolation:** Every query compilation and execution is strictly bounded to your authenticated `tenantId`. TenantGuard verifies query ASTs to prevent cross-tenant data leakage.
- **Multi-Model Routing:** Queries are compiled into plans and routed to the configured backing store:
  - High-speed key-value reads/writes route to **Upstash Redis**.
  - Relational queries and ACID transactions route to **PostgreSQL / Supabase**.
- **Compiler Telemetry (Opt-in):** If telemetry consent is granted via the cookie banner, anonymized compiler performance timings (e.g., lexer latency, JIT cache rates) are aggregated to improve compiler efficiency. No sensitive record data or query values are included in telemetry.

---

## 4. Subprocessors & Cloud Infrastructure

ColtaneDB partners with trusted cloud service providers:

| Subprocessor | Purpose | Data Transferred | Region |
| :--- | :--- | :--- | :--- |
| **Vercel Inc.** | Web application hosting, edge CDN, serverless execution | Encrypted HTTP traffic, client IP | Global (Primary: US-East IAD1) |
| **Google Firebase** | User authentication (OAuth & Email/Password) | Email, Firebase UID, auth tokens | United States / Global |
| **Upstash Inc.** | Serverless Redis caching and rate limiting | Encrypted key-value records, session cache | US-East / EU |
| **Supabase Inc.** | PostgreSQL storage engine and relational records | Relational tenant schemas, rows | US-East / AWS |

---

## 5. Data Retention, Portability & Your Rights

Under applicable privacy regulations (including GDPR and CCPA):
1. **Right to Access & Portability:** You can export your schemas, tables, and queries at any time in `.colt` or JSON format from the Table Explorer.
2. **Right to Erasure (Deletion):** You can request complete deletion of your tenant workspace, collections, and associated API keys. Deletion requests purge stored data within 30 days.
3. **Right to Revocation:** You can revoke API keys or sign out of active Firebase sessions instantly via the web console.

---

## 6. Security Safeguards

- **Encryption in Transit:** All traffic is strictly transmitted over HTTPS / TLS 1.3.
- **Tenant Isolation:** TenantGuard enforces tenant boundary checks at the parser, planner, and adapter layers.
- **Continuous Validation:** The codebase undergoes automated fuzz testing and end-to-end multi-tenant isolation tests on every release.

---

## 7. Contact & Inquiries

For privacy inquiries, data subject requests, or security disclosures, please contact:

- **Creator & Lead Maintainer:** Ayush Bhattacharya
- **Email:** [info.cometlabs@gmail.com](mailto:info.cometlabs@gmail.com)
- **Repository:** [https://github.com/itsjustayush/ColtaneDB](https://github.com/itsjustayush/ColtaneDB)
- **Security Policy:** [SECURITY.md](SECURITY.md)
