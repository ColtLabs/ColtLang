# ColtLang Hosting & Domain Migration Runbook

## Executive Summary

This document governs the procedures for deploying, maintaining, and migrating the official ColtLang website, documentation portal, and short installation endpoints (`/install.ps1`, `/install.cmd`, `/install.sh`).

The architecture strictly decouples:
1. **The Website & Documentation Target:** Deployed as static HTML/CSS/JS to Vercel or Cloudflare Pages.
2. **The Public Canonical Domain:** Centralized in `website/site.config.js` via `PUBLIC_SITE_URL`.
3. **The Native Binary Releases:** Published to GitHub Releases (`https://github.com/ColtLabs/ColtLang/releases`) with SHA-256 checksums. The website **never** distributes or compiles Rust binaries directly.

---

## Architecture Boundaries

```
[ Developer Terminal ]
       |
       |  irm https://coltlang.dev/install.ps1 | iex
       v
[ Web Host: Vercel / Cloudflare Pages ] (Zero Binaries)
       |
       |  Returns plain-text script containing verified release URL:
       |  https://github.com/ColtLabs/ColtLang/releases/download/v0.2.0/colt-x86_64-pc-windows-msvc.zip
       v
[ GitHub Releases Asset Storage ]
       |
       |  Downloads binary zip + SHA256SUMS.txt
       v
[ Local Client Machine ]
       |
       |  1. Verifies SHA-256 checksum
       |  2. Unpacks colt.exe into %LOCALAPPDATA%\Programs\Colt
       |  3. Adds to User PATH
       |  4. Runs: colt --version
       v
[ Verified Working Installation ]
```

---

## 1. Migrating Between Vercel and Cloudflare Pages

Because the custom domain (e.g. `coltlang.dev`) is preserved during a host migration, **no user installation commands ever change**.

### Step 1: Deterministic Static Build

Run the independent website build script from `website/`:

```bash
cd website
npm run build
npm test
```

This ensures `website/dist/` contains:
- `index.html` (Landing page with interactive terminal demo)
- `install.html` (Installation portal with platform tabs)
- `docs.html` (Reference manual and language specification)
- `migration.html` (Web runbook)
- `install.ps1` (Authoritative Windows PowerShell installer)
- `install.cmd` (Authoritative Windows CMD installer)
- `install.sh` (Authoritative POSIX macOS/Linux installer)
- `colt-logo.svg`, `robots.txt`, `sitemap.xml`

### Step 2: Deploy to Target Provider

#### If Target is Cloudflare Pages:
1. In Cloudflare Dashboard, select **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select repository `ColtLabs/ColtLang`.
3. Configure build settings:
   - **Framework preset:** None (Static)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `website`
4. Set Environment Variables:
   - `PUBLIC_SITE_URL`: `https://coltlang.dev`
5. Click **Save and Deploy**. Cloudflare assigns a preview URL (e.g., `coltlang.pages.dev`).

#### If Target is Vercel:
1. In Vercel Dashboard, import repository `ColtLabs/ColtLang`.
2. Configure project:
   - **Root Directory:** `website`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Configure environment variable: `PUBLIC_SITE_URL=https://coltlang.dev`.
4. Deploy. Vercel automatically respects `website/vercel.json` headers and clean URLs.

### Step 3: Staging Verification

Before touching any DNS records, test the staging deployment:

```bash
# Verify headers on all installer endpoints
curl -I https://<staging-host>/install.ps1
curl -I https://<staging-host>/install.cmd
curl -I https://<staging-host>/install.sh

# Ensure Content-Type is text/plain; charset=utf-8
# Ensure status is HTTP/2 200 (not 404 or HTML error redirect)
```

### Step 4: DNS Cutover

1. Update the CNAME record for `coltlang.dev` in your DNS provider:
   - For Cloudflare Pages: Target `coltlang.pages.dev`
   - For Vercel: Target `cname.vercel-dns.com`
2. Wait for automatic TLS certificate provisioning.
3. Keep the old deployment active for at least 48 hours to handle lingering DNS caches.

---

## 2. Changing to a New Canonical Domain

If ColtLang moves to a new domain (e.g., from `coltlang.dev` to `coltlang.org`):

### 1. Update Central Configuration
Update `website/site.config.js` or set `PUBLIC_SITE_URL=https://coltlang.org` in CI/CD environment variables.

### 2. Configure HTTP 301 Permanent Redirects on Old Domain
To prevent breaking existing published links and automated installation commands:

```json
{
  "redirects": [
    { "source": "/install.ps1", "destination": "https://coltlang.org/install.ps1", "permanent": true },
    { "source": "/install.cmd", "destination": "https://coltlang.org/install.cmd", "permanent": true },
    { "source": "/install.sh", "destination": "https://coltlang.org/install.sh", "permanent": true },
    { "source": "/(.*)", "destination": "https://coltlang.org/$1", "permanent": true }
  ]
}
```

Both `Invoke-RestMethod` (`irm`) in PowerShell and `curl -fsSL` on Unix follow HTTP 301 redirects automatically without user intervention.

### 3. Maintain Ownership of Old Domain
Keep registration and redirect routing active on the old domain for as long as possible (minimum 12–24 months).

---

## 3. Installer Endpoint Verification Checklist

Every deployment must pass this matrix:

| Endpoint | Method | Expected Content-Type | Verification |
|---|---|---|---|
| `/install.ps1` | `GET` | `text/plain; charset=utf-8` | Valid PowerShell script body; no HTML tags. |
| `/install.cmd` | `GET` | `text/plain; charset=utf-8` | Valid Batch script body; ends with exit code 0. |
| `/install.sh` | `GET` | `text/plain; charset=utf-8` | Valid POSIX shell script body; starts with `#!/bin/sh`. |
| `/install` | `GET` | `text/html; charset=utf-8` | Dedicated installation portal. |
| `/docs` | `GET` | `text/html; charset=utf-8` | Complete documentation manual. |
| `/migration` | `GET` | `text/html; charset=utf-8` | Web runbook. |

---

## 4. Emergency Rollback

If a deployment fails or issues arise:
1. Revert DNS CNAME records to the previous host target.
2. Both Vercel and Cloudflare Pages offer one-click instant rollbacks to any prior immutable deployment.
