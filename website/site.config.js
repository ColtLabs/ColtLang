// website/site.config.js
// Centralized configuration for the official ColtLang website & documentation.
// DO NOT hardcode domain URLs in components; use this configuration as the single source of truth.

const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || 'https://coltlang.dev';
const REPO_URL = 'https://github.com/ColtLabs/ColtLang';
const VERSION = '0.2.0';

export default {
  siteUrl: PUBLIC_SITE_URL,
  name: 'ColtLang',
  tagline: 'One declarative language for every kind of data.',
  description: 'Colt is a high-performance, declarative, multi-paradigm query and data language unifying relational tables, nested documents, key-value stores, vector embeddings, graphs, and temporal data under a single compiler and runtime.',
  version: VERSION,
  repoUrl: REPO_URL,
  releasesUrl: `${REPO_URL}/releases`,
  installCommands: {
    powershell: `irm ${PUBLIC_SITE_URL}/install.ps1 | iex`,
    cmd: `curl -fsSL ${PUBLIC_SITE_URL}/install.cmd -o install.cmd && install.cmd && del install.cmd`,
    unix: `curl -fsSL ${PUBLIC_SITE_URL}/install.sh | sh`,
  },
  platforms: [
    { id: 'windows-ps', name: 'Windows PowerShell', cmd: `irm ${PUBLIC_SITE_URL}/install.ps1 | iex`, recommended: true },
    { id: 'windows-cmd', name: 'Windows CMD', cmd: `curl -fsSL ${PUBLIC_SITE_URL}/install.cmd -o install.cmd && install.cmd && del install.cmd` },
    { id: 'macos', name: 'macOS (Apple Silicon & Intel)', cmd: `curl -fsSL ${PUBLIC_SITE_URL}/install.sh | sh`, recommended: true },
    { id: 'linux', name: 'Linux (x86_64)', cmd: `curl -fsSL ${PUBLIC_SITE_URL}/install.sh | sh`, recommended: true },
  ],
  links: {
    github: REPO_URL,
    docs: '/docs',
    install: '/install',
    migration: '/migration',
    coltstudio: 'https://github.com/ColtLabs/ColtStudio2',
    license: `${REPO_URL}/blob/main/LICENSE`,
  }
};
