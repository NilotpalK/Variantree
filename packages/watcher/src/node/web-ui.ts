/**
 * @variantree/watcher — Web UI server helper
 *
 * Serves the pre-built Variantree web UI as a local HTTP server,
 * injecting the current workspace JSON so the React app can display
 * real file-system data instead of IndexedDB data.
 *
 * Used by both the MCP `tree_web` tool and the `variantree tree --web` CLI.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { Workspace } from '@variantree/core';

/** Resolve the web UI dist directory shipped with the MCP package. */
function findWebUiDir(): string {
  // __dirname equivalent in ESM
  const thisFile = new URL(import.meta.url).pathname;
  const thisDir = path.dirname(thisFile);

  const candidates = [
    // Published: node_modules/@variantree/watcher/dist/node/ → node_modules/@variantree/mcp/dist/web-ui/
    path.resolve(thisDir, '../../../@variantree/mcp/dist/web-ui'),
    // Monorepo dev: packages/watcher/dist/node/ → packages/mcp/dist/web-ui/
    path.resolve(thisDir, '../../../mcp/dist/web-ui'),
    // Monorepo dev (web not yet copied): packages/watcher/dist/node/ → packages/web/dist/
    path.resolve(thisDir, '../../../web/dist'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  throw new Error(
    'Variantree web UI not found. Run `npm run build` in packages/mcp (or packages/web) first.'
  );
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

/** Open a URL in the default browser (cross-platform). */
function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' } as any);
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    // Silently fail — the URL is printed anyway
  }
}

export interface WebUiServer {
  url: string;
  close(): void;
}

/**
 * Starts a local HTTP server serving the web UI with the given workspace
 * data injected. Opens the browser and returns the server URL + close fn.
 */
export async function openWebUi(workspace: Workspace): Promise<WebUiServer> {
  const webUiDir = findWebUiDir();
  const workspaceJson = JSON.stringify(workspace);

  const server = http.createServer((req, res) => {
    const reqPath = req.url?.split('?')[0] ?? '/';
    const filePath = path.join(webUiDir, reqPath === '/' ? 'index.html' : reqPath);

    // Fall back to index.html for client-side routing
    const resolvedPath = fs.existsSync(filePath) ? filePath : path.join(webUiDir, 'index.html');

    const ext = path.extname(resolvedPath);
    const contentType = MIME[ext] ?? 'application/octet-stream';

    try {
      let content = fs.readFileSync(resolvedPath);

      // Inject workspace data into index.html
      if (resolvedPath.endsWith('index.html')) {
        const injectionScript = `<script>window.__VARIANTREE_DATA__ = ${workspaceJson};</script>`;
        const html = content.toString('utf8').replace('</head>', `${injectionScript}\n</head>`);
        content = Buffer.from(html, 'utf8');
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  // Bind to a random available port
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}?source=injected`;

  openBrowser(url);

  return {
    url,
    close: () => server.close(),
  };
}
