// website/scripts/app.js - Interactive ColtLang Website Controller

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initCopyButtons();
  initTerminalDemo();
  initPlatformTabs();
  initDocsSearch();
});

// Theme controller
function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  const stored = localStorage.getItem('colt-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const currentTheme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', currentTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const active = document.documentElement.getAttribute('data-theme');
      const next = active === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('colt-theme', next);
      toggleBtn.innerHTML = next === 'dark' ? '☀' : '🌙';
    });
    toggleBtn.innerHTML = currentTheme === 'dark' ? '☀' : '🌙';
  }
}

// Copy to clipboard
function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-target');
      const textToCopy = targetId ? document.getElementById(targetId)?.innerText : btn.getAttribute('data-code');
      
      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy.trim());
        const originalText = btn.innerHTML;
        btn.innerHTML = '✔ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    });
  });
}

// Interactive Terminal Demo Controller
function initTerminalDemo() {
  const tabs = document.querySelectorAll('.term-tab');
  const body = document.getElementById('terminal-content');
  if (!body) return;

  const demoScenarios = {
    'dry-run': {
      cmd: 'colt run examples/library.colt --dry-run',
      output: `\x1b[38;2;224;122;95m┌─ Dry Run Execution Preview (0 operations executed) ──────────────────────────┐\x1b[0m
│ Source: examples/library.colt
│ Planned Operations: 6 | Database Mutations: 0 (Preview Mode)
├───────────────────────────────────────────────────────────────────────────────┤
│  1. [relational] schema.create on collection authors via main
     Statement: CREATE TABLE "authors" ("id" uuid NOT NULL, "name" text NOT NULL UNIQUE, "joined" timestamptz NOT NULL, PRIMARY KEY ("id"))
│  2. [relational] schema.create on collection books via main
     Statement: CREATE TABLE "books" ("id" uuid NOT NULL, "title" text NOT NULL, "author" uuid NOT NULL, "tags" text[] NOT NULL, "published" timestamptz, "metadata" jsonb NOT NULL, "embedding" vector(3) NOT NULL, "views" integer NOT NULL, PRIMARY KEY ("id"))
│  3. [relational] query    on collection books via main
     Statement: SELECT "title", "author", jsonb_extract_path("metadata", 'edition') FROM "books" WHERE ("views" > $1) LIMIT 20
│  4. [relational] record.put on collection books via main
     Statement: INSERT INTO "books" VALUES (...) ON CONFLICT ("id") DO UPDATE ...
│  5. [relational] record.create on collection books via main
     Statement: INSERT INTO "books" VALUES (gen_random_uuid(), ...)
│  6. [relational] transaction on collection books via main
└───────────────────────────────────────────────────────────────────────────────┘
\x1b[32m✔\x1b[0m Whole-file validation & planning successful. Zero mutations performed.`
    },
    'doctor': {
      cmd: 'colt doctor',
      output: `\x1b[38;2;224;122;95m╔═ Colt Doctor Diagnostic Report ══════════════════════════════════════════════╗\x1b[0m
║ Toolchain: colt v0.2.0 (native x86_64)
║ Executable: /usr/local/bin/colt
╟──────────────────────────────────────────────────────────────────────────────╢
║ Environment Configuration (Secrets Redacted):
  \x1b[32m✔\x1b[0m DATABASE_URL: postgresql://***:***@ep-polished-hat.neon.tech/colt1
  \x1b[32m✔\x1b[0m REDIS_URL:    rediss://***:***@settled-fly.upstash.io:6379
  \x1b[90m○\x1b[0m MONGODB_URL:  not set (optional doc store)
╟──────────────────────────────────────────────────────────────────────────────╢
║ Runtime Service Status:
  Target Endpoint: http://127.0.0.1:3000
  \x1b[32m✔\x1b[0m ColtaneDB Engine: \x1b[32mONLINE\x1b[0m (Live multi-adapter execution ready)
╚══════════════════════════════════════════════════════════════════════════════╝`
    },
    'check': {
      cmd: 'colt check examples/library.colt',
      output: `examples/library.colt: ok (6 planned steps)`
    },
    'plan': {
      cmd: 'colt plan examples/library.colt',
      output: `{\n  "source": "examples/library.colt",\n  "status": "ok",\n  "plan": {\n    "steps": [\n      { "backend": "main", "operation": "schema.create", "collection": "authors" },\n      { "backend": "main", "operation": "schema.create", "collection": "books" },\n      { "backend": "main", "operation": "query", "collection": "books" },\n      { "backend": "main", "operation": "record.put", "collection": "books" }\n    ]\n  }\n}`
    },
    'live': {
      cmd: 'colt run examples/library.colt',
      output: `\x1b[32m✔\x1b[0m Executed examples/library.colt (6 operations completed in 34ms)

[RELATIONAL] query books on main (completed, 12ms)
  ┌──────────────────────────────┬──────────────────────────────────────┬──────────────────┐
  │ title                        │ author                               │ metadata.edition │
  ├──────────────────────────────┼──────────────────────────────────────┼──────────────────┤
  │ The Left Hand of Darkness    │ 22222222-2222-4222-8222-222222222222 │ 3                │
  │ The Dispossessed             │ 22222222-2222-4222-8222-222222222222 │ 1                │
  └──────────────────────────────┴──────────────────────────────────────┴──────────────────┘
  (2 records)

[MUTATION] record.put books on main (completed, 8ms)
  \x1b[32m✔\x1b[0m Affected records: 1
Tenant Resource Usage: 3 rows read/written, 256 bytes transferred.`
    }
  };

  function renderScenario(key) {
    const data = demoScenarios[key];
    if (!data) return;

    // Convert ANSI color sequences to styled spans
    let formatted = data.output
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\x1b\[38;2;224;122;95m/g, '<span style="color:#E07A5F;">')
      .replace(/\x1b\[38;2;221;161;94m/g, '<span style="color:#DDA15E;">')
      .replace(/\x1b\[32m/g, '<span style="color:#81B29A;">')
      .replace(/\x1b\[31m/g, '<span style="color:#E63946;">')
      .replace(/\x1b\[33m/g, '<span style="color:#F4A261;">')
      .replace(/\x1b\[34m/g, '<span style="color:#38BDF8;">')
      .replace(/\x1b\[35m/g, '<span style="color:#C084FC;">')
      .replace(/\x1b\[36m/g, '<span style="color:#38BDF8;">')
      .replace(/\x1b\[90m/g, '<span style="color:#8D99AE;">')
      .replace(/\x1b\[1m/g, '<span style="font-weight:700;">')
      .replace(/\x1b\[0m/g, '</span>');

    body.innerHTML = `<div><span class="term-prompt">user@colt:~$</span> <span class="term-cmd">${data.cmd}</span></div><div class="term-output">${formatted}</div>`;
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.getAttribute('data-scenario');
      renderScenario(key);
    });
  });

  // Default scenario
  renderScenario('dry-run');
}

// Platform Tabs on /install
function initPlatformTabs() {
  const tabs = document.querySelectorAll('.platform-tab');
  const panels = document.querySelectorAll('.platform-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-platform');
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.add('active');
    });
  });
}

// Documentation Search Controller
function initDocsSearch() {
  const input = document.getElementById('docs-search');
  if (!input) return;

  const navItems = document.querySelectorAll('.docs-nav-item');
  const sections = document.querySelectorAll('.docs-section');

  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    navItems.forEach(item => {
      const text = item.innerText.toLowerCase();
      item.style.display = text.includes(query) ? '' : 'none';
    });

    if (query.length > 2) {
      sections.forEach(sec => {
        const text = sec.innerText.toLowerCase();
        sec.style.display = text.includes(query) ? '' : 'none';
      });
    } else {
      sections.forEach(sec => sec.style.display = '');
    }
  });
}
