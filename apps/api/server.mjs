import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DataImportError, loadDataset } from './ingest.mjs';

const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

export function createApiServer({ dataPath = process.env.BHHS_DATA_DIR } = {}) {
  return http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && LOCAL_ORIGINS.has(origin)) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, payload) => { response.writeHead(status); response.end(JSON.stringify(payload)); };
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); send(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'This local API supports read-only GET requests.' } }); return; }
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (!['/api/health', '/api/dataset'].includes(pathname)) { send(404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }); return; }
    try {
      // No cache: product-file replacements are reflected by every refresh, including health checks.
      const dataset = await loadDataset(dataPath);
      if (pathname === '/api/health') {
        send(200, { status: 'ok', mode: dataset.meta.mode, assistant_mode: 'rules', quarantined_count: dataset.meta.quarantined_count, loaded_at: dataset.meta.loaded_at });
      } else send(200, dataset);
    } catch (error) {
      send(503, { error: {
        code: error instanceof DataImportError ? error.code : 'DATA_UNAVAILABLE',
        message: error instanceof DataImportError ? error.message : 'The configured data source is unavailable. Check local files and retry.',
      } });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BHHS_API_PORT || 8001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BHHS_API_PORT must be a valid port.');
  const server = createApiServer();
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : 'Local API could not start.'); process.exitCode = 1; });
  // Validate on startup; individual rejected rows are summarized, never printed.
  loadDataset().then((dataset) => {
    server.listen(port, '127.0.0.1', () => console.log(`BHHS local API http://127.0.0.1:${port} | ${dataset.meta.mode} | quarantined rows: ${dataset.meta.quarantined_count}`));
  }).catch((error) => { console.error(error instanceof DataImportError ? `${error.code}: ${error.message}` : 'Configured dataset could not be loaded.'); process.exitCode = 1; });
}
