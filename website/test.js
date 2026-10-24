// website/test.js
// Verification suite for the ColtLang Official Website build artifacts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');

console.log('🔍 Running ColtLang Website Verification Test Suite...\n');

let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

// 1. Verify existence of dist directory
assert(fs.existsSync(DIST_DIR), 'dist directory exists');

// 2. Verify all primary pages exist
const expectedPages = ['index.html', 'install.html', 'docs.html', 'migration.html'];
for (const page of expectedPages) {
  const filePath = path.join(DIST_DIR, page);
  assert(fs.existsSync(filePath), `Page ${page} exists in dist`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert(content.length > 500, `Page ${page} has non-trivial content (${content.length} chars)`);
    assert(content.includes('ColtLang'), `Page ${page} mentions ColtLang`);
    assert(!content.includes('undefined'), `Page ${page} contains no undefined placeholders`);
  }
}

// 3. Verify static assets
assert(fs.existsSync(path.join(DIST_DIR, 'styles', 'main.css')), 'styles/main.css exists');
assert(fs.existsSync(path.join(DIST_DIR, 'styles', 'docs.css')), 'styles/docs.css exists');
assert(fs.existsSync(path.join(DIST_DIR, 'scripts', 'app.js')), 'scripts/app.js exists');
assert(fs.existsSync(path.join(DIST_DIR, 'colt-logo.svg')), 'colt-logo.svg exists');
assert(fs.existsSync(path.join(DIST_DIR, 'robots.txt')), 'robots.txt exists');
assert(fs.existsSync(path.join(DIST_DIR, 'sitemap.xml')), 'sitemap.xml exists');

// 4. Verify installer endpoints are raw text scripts (NOT HTML)
const installerChecks = [
  { file: 'install.ps1', expectedPattern: '$ErrorActionPreference', forbiddenPattern: '<!DOCTYPE html>' },
  { file: 'install.cmd', expectedPattern: 'ECHO OFF', forbiddenPattern: '<!DOCTYPE html>' },
  { file: 'install.sh',  expectedPattern: '#!/usr/bin/env sh', forbiddenPattern: '<!DOCTYPE html>' }
];

for (const check of installerChecks) {
  const filePath = path.join(DIST_DIR, check.file);
  assert(fs.existsSync(filePath), `Installer endpoint /${check.file} exists`);
  if (fs.existsSync(filePath)) {
    const body = fs.readFileSync(filePath, 'utf8');
    assert(!body.includes(check.forbiddenPattern), `/${check.file} is NOT an HTML error page`);
    assert(body.includes(check.expectedPattern), `/${check.file} contains expected syntax signature`);
    assert(body.length > 200, `/${check.file} has valid script length (${body.length} bytes)`);
  }
}

// 5. Verify sitemap.xml structure
const sitemap = fs.readFileSync(path.join(DIST_DIR, 'sitemap.xml'), 'utf8');
assert(sitemap.includes('<urlset'), 'sitemap.xml has <urlset>');
assert(sitemap.includes('/install</loc>'), 'sitemap.xml lists /install');
assert(sitemap.includes('/docs</loc>'), 'sitemap.xml lists /docs');
assert(sitemap.includes('/migration</loc>'), 'sitemap.xml lists /migration');

// 6. Verify internal links across all HTML files
for (const page of expectedPages) {
  const content = fs.readFileSync(path.join(DIST_DIR, page), 'utf8');
  // Check that all link targets exist
  if (content.includes('href="/install"')) {
    assert(fs.existsSync(path.join(DIST_DIR, 'install.html')), `${page} link to /install resolves to install.html`);
  }
  if (content.includes('href="/docs"')) {
    assert(fs.existsSync(path.join(DIST_DIR, 'docs.html')), `${page} link to /docs resolves to docs.html`);
  }
  if (content.includes('href="/migration"')) {
    assert(fs.existsSync(path.join(DIST_DIR, 'migration.html')), `${page} link to /migration resolves to migration.html`);
  }
}

console.log('\n----------------------------------------');
if (failedTests === 0) {
  console.log('✅ ALL WEBSITE VERIFICATION TESTS PASSED!\n');
  process.exit(0);
} else {
  console.error(`❌ ${failedTests} TEST(S) FAILED.\n`);
  process.exit(1);
}
