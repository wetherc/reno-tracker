// Builds the request handler: API routes first, static files for the
// rest. Kept apart from index.js so tests can mount it on port 0 with an
// in-memory database.
import { createServer } from 'node:http';
import { checkSource, setSecurityHeaders } from './guard.js';
import { requestTarget, Router, sendError } from './router.js';
import { projectRoot, serveStatic } from './static.js';
import { projectRoutes } from './routes/projects.js';
import { scheduleRoutes } from './routes/schedule.js';
import { noteRoutes } from './routes/notes.js';
import { dependencyRoutes } from './routes/dependencies.js';
import { materialRoutes } from './routes/materials.js';
import { invoiceRoutes } from './routes/invoices.js';
import { changeOrderRoutes } from './routes/changeOrders.js';
import { transferRoutes } from './routes/transfer.js';

/** @typedef {import('node:sqlite').DatabaseSync} Database */

/**
 * @param {Database} db
 * @returns {Router}
 */
export function buildRouter(db) {
  const router = new Router();
  projectRoutes(router, db);
  // Import is registered before the payload route so /api/projects/import
  // is not read as a project id.
  transferRoutes(router, db);
  scheduleRoutes(router, db);
  noteRoutes(router, db);
  dependencyRoutes(router, db);
  materialRoutes(router, db);
  invoiceRoutes(router, db);
  changeOrderRoutes(router, db);
  return router;
}

/**
 * @param {Database} db
 * @param {{ root?: string }} [options]
 * @returns {import('node:http').Server}
 */
export function createApp(db, { root = projectRoot() } = {}) {
  const router = buildRouter(db);
  const files = serveStatic(root);
  return createServer((req, res) => {
    setSecurityHeaders(res);
    try {
      checkSource(req.headers, req.socket.localPort);
      const { path } = requestTarget(req);
      if (path === '/api' || path.startsWith('/api/')) router.handle(req, res);
      else files(req, res);
    } catch (error) {
      sendError(res, error, router.onError);
    }
  });
}
