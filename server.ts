import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lex, parse } from './packages/parser/src/index.ts';
import { compile, postgresCapabilities } from './packages/compiler/src/index.ts';
import { createColtaneApi } from './packages/api/src/index.ts';
import hello from './hello.ts';

if (typeof process.loadEnvFile === 'function') {
  try {
    if (existsSync('.env.local')) {
      process.loadEnvFile('.env.local');
    } else if (existsSync('.env')) {
      process.loadEnvFile('.env');
    }
  } catch {
    // environment already configured or unsupported
  }
}

const apiSystem = createColtaneApi();
apiSystem.authService.createInvite('COLTANE-ALPHA-2026', 720);
const seedResult = apiSystem.authService.verifyInvite('COLTANE-ALPHA-2026', 'developer@coltanedb.dev');
let defaultProjectId = '';
if (seedResult.user) {
  const seedProject = await apiSystem.projectService.createProject({
    name: 'Default Workspace',
    ownerId: seedResult.user.id,
  });
  defaultProjectId = seedProject.tenantId;
}

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const HOST = '0.0.0.0';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > 5e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolveBody(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

async function getExampleCode(): Promise<string> {
  try {
    return await readFile(resolve(process.cwd(), 'examples/library.colt'), 'utf8');
  } catch {
    return `-- Colt v0.1 Example: Library Catalogue
DEFINE COLLECTION authors STRICT @backend(neon) {
  id: uuid @key,
  name: text @unique,
  joined: time @default(now)
}

DEFINE COLLECTION books STRICT @backend(neon) {
  id: uuid @key,
  title: text,
  author: link<authors>,
  tags: list<text>,
  published: time?,
  metadata: doc,
  embedding: vector(3) @index(hnsw),
  views: int @default(0)
}

FIND books SELECT title, author, metadata.edition
WHERE views > 10 AND published != null
ORDER BY views DESC
LIMIT 20 OFFSET 0`;
  }
}

function getProvidersStatus() {
  const hasFirebase = Boolean(process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const hasRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasSupabase = Boolean(process.env.SUPABASE_URL || process.env.SUPABASE_ANON_KEY);
  const hasNeon = Boolean(process.env.DATABASE_URL);
  const hasTurso = Boolean(process.env.TURSO_DATABASE_URL);
  const hasMongo = Boolean(process.env.MONGODB_URI);

  return [
    {
      id: 'neon',
      name: 'Neon Serverless Postgres',
      role: 'PostgreSQL primary store with schema generation and branching support.',
      status: hasNeon ? 'active' : 'plan-only',
      target: '@backend(neon)',
      features: ['Schema management', 'Branching', 'Transactional queries', 'Strict tenant schemas'],
    },
    {
      id: 'supabase',
      name: 'Supabase Postgres',
      role: 'Relational data store with ct_<tid> tenant schema isolation.',
      status: hasSupabase ? 'active' : 'available',
      target: '@backend(supabase)',
      features: ['Schema isolation', 'Row security', 'Direct SQL routing'],
    },
    {
      id: 'redis',
      name: 'Upstash Redis',
      role: 'Serverless KV cache with t:{tid}: key namespace isolation.',
      status: hasRedis ? 'active' : 'available',
      target: '@backend(redis)',
      features: ['REST protocol', 'Sub-millisecond KV', 'Prefix isolation'],
    },
    {
      id: 'firebase',
      name: 'Firebase Firestore & Auth',
      role: 'Document collection store with tenants/{tid}/c/{col}/d path isolation and Google OAuth ID token verification.',
      status: hasFirebase ? 'active' : 'available',
      target: '@backend(firestore)',
      features: ['Document store', 'Google OAuth & Firebase Auth tokens', 'Nested path tenant isolation', 'Admin SDK v14'],
    },
    {
      id: 'mongodb',
      name: 'MongoDB Atlas',
      role: 'Document collection store with _tid tenant attribute injection.',
      status: hasMongo ? 'active' : 'available',
      target: '@backend(mongodb)',
      features: ['Document store', '_tid query and mutation injection'],
    },
    {
      id: 'turso',
      name: 'Turso libSQL',
      role: 'Edge SQLite database engine with shared schema and _tid column isolation.',
      status: hasTurso ? 'active' : 'available',
      target: '@backend(turso)',
      features: ['Edge libSQL', '_tid row-level scoping'],
    },
  ];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    // 0. Internal Python service binding proxy (Vercel multi-service)
    if (url.pathname.startsWith('/api/v1/python-worker')) {
      const pythonUrl = process.env.PYTHON_SERVICE_URL;
      if (!pythonUrl) {
        sendJson(res, 503, { error: 'Python internal worker service binding not available.' });
        return;
      }
      try {
        const targetPath = url.pathname.replace(/^\/api\/v1\/python-worker/, '') || '/';
        const targetUrl = new URL(targetPath + url.search, pythonUrl);
        const reqBody = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : undefined;
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          body: reqBody,
        });
        const respData = await response.json();
        sendJson(res, response.status, respData);
      } catch (err) {
        sendJson(res, 502, { error: `Python worker request failed: ${String(err)}` });
      }
      return;
    }

    // 0b. API v1 routes (Milestone 3 & 4)
    if (url.pathname === '/api/v1/default-project') {
      sendJson(res, 200, { tenantId: defaultProjectId });
      return;
    }
    if (url.pathname === '/api/v1/query') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as { source?: string; parameters?: Record<string, unknown>; tenantId?: string }) : {};
      const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
      const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : '';

      let targetTenant = body.tenantId || defaultProjectId;
      if (token && token.startsWith('clt_live_')) {
        const authRes = apiSystem.authService.authenticateApiKey(token);
        if (authRes.valid && authRes.apiKey) {
          targetTenant = authRes.apiKey.tenantId;
        }
      }

      const project = await apiSystem.projectService.getProject(targetTenant);
      if (!project) {
        sendJson(res, 404, { error: `Project ${targetTenant} not found.` });
        return;
      }

      const execResult = await apiSystem.executionService.execute({
        tenantId: targetTenant,
        source: body.source || '',
        parameters: body.parameters,
      }, project.limits);

      sendJson(res, execResult.success ? 200 : 400, execResult);
      return;
    }
    if (url.pathname.startsWith('/api/v1/')) {
      let body: unknown = undefined;
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const raw = await readBody(req);
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: 'Invalid JSON body' });
            return;
          }
        }
      }
      const apiHeaders: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') apiHeaders[k.toLowerCase()] = v;
      }
      const apiResponse = await apiSystem.router.handle({
        method: req.method ?? 'GET',
        path: url.pathname,
        headers: apiHeaders,
        body,
      });
      sendJson(res, apiResponse.status, apiResponse.body);
      return;
    }

    // 1. Neon function route
    if (url.pathname === '/api/hello' || url.pathname === '/neon') {
      const helloResponse = await hello();
      const text = await helloResponse.text();
      res.writeHead(helloResponse.status, {
        'Content-Type': helloResponse.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(text);
      return;
    }

    // 2. Colt example file
    if (url.pathname === '/api/example' || url.pathname === '/examples/library.colt') {
      const example = await getExampleCode();
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(example);
      return;
    }

    // 3. Colt capabilities
    if (url.pathname === '/api/capabilities') {
      sendJson(res, 200, postgresCapabilities);
      return;
    }

    // 4. Providers status
    if (url.pathname === '/api/providers') {
      sendJson(res, 200, getProvidersStatus());
      return;
    }

    // 5. Colt plan / check
    if (url.pathname === '/api/plan' || url.pathname === '/api/check') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as { source?: string }) : { source: '' };
      const source = typeof body.source === 'string' ? body.source : '';
      const result = compile(source);
      sendJson(res, 200, result);
      return;
    }

    // 6. Colt parse
    if (url.pathname === '/api/parse') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as { source?: string }) : { source: '' };
      const source = typeof body.source === 'string' ? body.source : '';
      const parsed = parse(source);
      sendJson(res, 200, { ast: parsed.program, diagnostics: parsed.diagnostics });
      return;
    }

    // 7. Colt lex
    if (url.pathname === '/api/lex') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as { source?: string }) : { source: '' };
      const source = typeof body.source === 'string' ? body.source : '';
      const lexed = lex(source);
      sendJson(res, 200, { tokens: lexed.tokens, diagnostics: lexed.diagnostics });
      return;
    }

    // 8. Import .colt file API
    if (url.pathname === '/api/import') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' });
        return;
      }
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as { source?: string; filename?: string }) : { source: '' };
      const source = typeof body.source === 'string' ? body.source : '';
      const parsed = parse(source);
      const compiled = compile(source);
      sendJson(res, 200, {
        success: parsed.diagnostics.length === 0 && compiled.diagnostics.length === 0,
        filename: body.filename || 'imported.colt',
        source,
        diagnostics: compiled.diagnostics,
        plan: compiled.plan,
        ast: parsed.program,
      });
      return;
    }

    // Static SEO, Favicon, and Asset routes
    if (url.pathname === '/robots.txt') {
      const content = await readFile(resolve(process.cwd(), 'robots.txt'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      res.end(content);
      return;
    }
    if (url.pathname === '/sitemap.xml') {
      const content = await readFile(resolve(process.cwd(), 'sitemap.xml'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      res.end(content);
      return;
    }
    if (url.pathname === '/site.webmanifest') {
      const content = await readFile(resolve(process.cwd(), 'site.webmanifest'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      res.end(content);
      return;
    }
    if (url.pathname === '/favicon.ico') {
      const content = await readFile(resolve(process.cwd(), 'favicon.ico'));
      res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=604800' });
      res.end(content);
      return;
    }
    if (url.pathname === '/favicon.png' || url.pathname === '/favicon-32x32.png') {
      const content = await readFile(resolve(process.cwd(), 'favicon-32x32.png'));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' });
      res.end(content);
      return;
    }
    if (url.pathname === '/apple-touch-icon.png') {
      const content = await readFile(resolve(process.cwd(), 'apple-touch-icon.png'));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' });
      res.end(content);
      return;
    }
    if (url.pathname === '/og-image.png') {
      const content = await readFile(resolve(process.cwd(), 'og-image.png'));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' });
      res.end(content);
      return;
    }
    if (url.pathname === '/colt-logo.svg' || url.pathname === '/coltanedb-logo.svg' || url.pathname === '/favicon.svg') {
      const filename = url.pathname === '/colt-logo.svg' ? 'colt-logo.svg' : 'coltanedb-logo.svg';
      const content = await readFile(resolve(process.cwd(), filename), 'utf8');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=604800' });
      res.end(content);
      return;
    }
    if (url.pathname === '/api/config/firebase') {
      sendJson(res, 200, {
        projectId: 'coltanedb',
        appId: '1:573404384111:web:9add23b082210d273b769a',
        authDomain: 'coltanedb.firebaseapp.com',
        storageBucket: 'coltanedb.appspot.com',
        messagingSenderId: '573404384111',
      });
      return;
    }

    // Health check endpoint for container and platform proxies
    if (url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/api/health') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      }
      return;
    }

    if (url.pathname === '/login' || url.pathname === '/signin' || url.pathname === '/signup') {
      const content = await readFile(resolve(process.cwd(), 'login.html'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
      return;
    }

    if (
      url.pathname === '/app' ||
      url.pathname === '/dashboard' ||
      url.pathname === '/studio' ||
      url.pathname === '/console' ||
      url.pathname === '/ide' ||
      url.pathname === '/builder' ||
      url.pathname === '/table' ||
      url.pathname === '/explorer'
    ) {
      const content = await readFile(resolve(process.cwd(), 'app.html'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
      return;
    }

    if (url.pathname === '/docs') {
      const content = await readFile(resolve(process.cwd(), 'docs.html'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
      return;
    }

    if (url.pathname === '/privacy' || url.pathname === '/privacy.html') {
      const content = await readFile(resolve(process.cwd(), 'privacy.html'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
      return;
    }

    if (url.pathname === '/404' || url.pathname === '/404.html') {
      const content = await readFile(resolve(process.cwd(), '404.html'), 'utf8');
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(content);
      }
      return;
    }

    // 9. Web Landing page (serve index.html for root /, serve 404.html for unrecognized routes)
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/landing') {
        const html = await readFile(resolve(process.cwd(), 'index.html'), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Access-Control-Allow-Origin': '*',
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(html);
        }
        return;
      }

      // Unrecognized route -> serve dedicated 404.html with status 404
      const notFoundHtml = await readFile(resolve(process.cwd(), '404.html'), 'utf8');
      res.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(notFoundHtml),
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(notFoundHtml);
      }
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: errorMsg });
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please terminate the conflicting process.`);
  } else {
    console.error('Server error:', err);
  }
});

if (!process.env.VERCEL) {
  server.listen(PORT, HOST, () => {
    console.log(`ColtaneDB dev server listening at http://${HOST}:${PORT}`);
  });
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  server.emit('request', req, res);
}

