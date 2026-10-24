// website/build.js
// Deterministic static site builder for ColtLang Official Website.
// Compiles HTML, synchronizes authoritative installers, generates sitemaps, and prepares dist/ for Vercel/Cloudflare.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import siteConfig from './site.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, 'dist');
const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');

console.log('⚡ Building ColtLang Official Website & Documentation Portal...');
console.log(`   Canonical URL: ${siteConfig.siteUrl}`);
console.log(`   Target Output: ${DIST_DIR}`);

// 1. Clean and recreate dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'styles'), { recursive: true });
fs.mkdirSync(path.join(DIST_DIR, 'scripts'), { recursive: true });

// 2. Helper to copy file
function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  const relDest = path.relative(DIST_DIR, dest);
  const size = fs.statSync(dest).size;
  console.log(`   ✓ Copied ${relDest} (${(size / 1024).toFixed(1)} KB)`);
}

// 3. Helper to copy directory
function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

// 4. Copy stylesheets and client scripts
copyDir(path.join(__dirname, 'styles'), path.join(DIST_DIR, 'styles'));
copyDir(path.join(__dirname, 'scripts'), path.join(DIST_DIR, 'scripts'));

// 5. Copy brand assets
if (fs.existsSync(path.join(__dirname, 'colt-logo.svg'))) {
  copyFile(path.join(__dirname, 'colt-logo.svg'), path.join(DIST_DIR, 'colt-logo.svg'));
}

// 6. Process and copy HTML files with canonical domain injection
const htmlPages = ['index.html', 'install.html', 'docs.html', 'migration.html'];
for (const page of htmlPages) {
  const srcPath = path.join(__dirname, page);
  if (fs.existsSync(srcPath)) {
    let content = fs.readFileSync(srcPath, 'utf8');
    // Ensure canonical domain matches configuration
    content = content.replace(/https:\/\/coltlang\.dev/g, siteConfig.siteUrl);
    fs.writeFileSync(path.join(DIST_DIR, page), content, 'utf8');
    const size = Buffer.byteLength(content);
    console.log(`   ✓ Processed ${page} (${(size / 1024).toFixed(1)} KB)`);
  }
}

// 7. Synchronize authoritative installer scripts from repository root
const installerScripts = [
  { name: 'install.ps1', src: path.join(SCRIPTS_DIR, 'install.ps1') },
  { name: 'install.cmd', src: path.join(SCRIPTS_DIR, 'install.cmd') },
  { name: 'install.sh',  src: path.join(SCRIPTS_DIR, 'install.sh') }
];

for (const script of installerScripts) {
  if (fs.existsSync(script.src)) {
    let content = fs.readFileSync(script.src, 'utf8');
    // Ensure scripts point to correct repo releases or URLs if needed
    fs.writeFileSync(path.join(DIST_DIR, script.name), content, 'utf8');
    const size = Buffer.byteLength(content);
    console.log(`   ✓ Synced installer endpoint /${script.name} (${(size / 1024).toFixed(1)} KB)`);
  } else {
    console.error(`   ✗ Missing authoritative script: ${script.src}`);
    process.exit(1);
  }
}

// 8. Generate robots.txt
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${siteConfig.siteUrl}/sitemap.xml
`;
fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt, 'utf8');
console.log('   ✓ Generated robots.txt');

// 9. Generate sitemap.xml
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteConfig.siteUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteConfig.siteUrl}/install</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteConfig.siteUrl}/docs</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteConfig.siteUrl}/migration</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
`;
fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
console.log('   ✓ Generated sitemap.xml');

console.log('\n✨ Build complete! Output directory: website/dist/');
