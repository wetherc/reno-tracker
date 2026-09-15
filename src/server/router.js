// Method and path matching for the JSON API. A route pattern such as
// `/api/schedule/:id` binds `id`. Handlers receive the parsed params and
// body and return the response body; the router writes JSON. A handler
// that returns undefined sends 204.
import { HttpError } from './errors.js';

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/**
 * @typedef {{ params: Record<string, string>, body: unknown, req: IncomingMessage }} RouteContext
 * @typedef {(ctx: RouteContext) => unknown} Handler
 * @typedef {{ method: string, pattern: string, keys: string[], regex: RegExp, handler: Handler }} Route
 */

const MAX_BODY_BYTES = 1_000_000;

/**
 * The method and path of a request. Node fills both on a real request;
 * the defaults keep a bare object usable in tests.
 * @param {Pick<IncomingMessage, 'method' | 'url'>} req
 * @returns {{ method: string, path: string }}
 */
export function requestTarget(req) {
  return {
    method: req.method ?? 'GET',
    path: new URL(req.url ?? '/', 'http://localhost').pathname,
  };
}

/**
 * @param {string} pattern
 * @returns {{ keys: string[], regex: RegExp }}
 */
export function compilePattern(pattern) {
  /** @type {string[]} */
  const keys = [];
  const source = pattern
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { keys, regex: new RegExp(`^${source}/?$`) };
}

/**
 * Reads the whole request body and parses it as JSON. An empty body is
 * an empty object so a POST with no fields still reaches the handler.
 * @param {IncomingMessage} req
 * @returns {Promise<unknown>}
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      // Keep reading so the client gets the response instead of a reset.
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooLarge) return reject(new HttpError(413, 'Body is over 1 MB'));
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (text === '') return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'Body is not valid JSON'));
      }
    });
  });
}

/**
 * @param {ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
export function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

export class Router {
  constructor() {
    /** @type {Route[]} */
    this.routes = [];
    /** @type {(error: unknown) => void} */
    this.onError = console.error;
  }

  /**
   * @param {string} method
   * @param {string} pattern
   * @param {Handler} handler
   */
  add(method, pattern, handler) {
    this.routes.push({ method, pattern, handler, ...compilePattern(pattern) });
    return this;
  }

  /** @param {string} pattern @param {Handler} handler */
  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }
  /** @param {string} pattern @param {Handler} handler */
  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }
  /** @param {string} pattern @param {Handler} handler */
  patch(pattern, handler) {
    return this.add('PATCH', pattern, handler);
  }
  /** @param {string} pattern @param {Handler} handler */
  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  /**
   * Finds the route for a request. When the path matches but the method
   * does not, `allow` lists the methods that would.
   * @param {string} method
   * @param {string} path
   * @returns {{ route: Route, params: Record<string, string> } | { allow: string[] } | null}
   */
  match(method, path) {
    /** @type {string[]} */
    const allow = [];
    for (const route of this.routes) {
      const m = route.regex.exec(path);
      if (!m) continue;
      if (route.method !== method) {
        allow.push(route.method);
        continue;
      }
      /** @type {Record<string, string>} */
      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1]);
      });
      return { route, params };
    }
    return allow.length > 0 ? { allow } : null;
  }

  /**
   * Handles one request end to end and always writes a response.
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   */
  async handle(req, res) {
    const { method, path } = requestTarget(req);
    try {
      const found = this.match(method, path);
      if (found === null) {
        throw new HttpError(404, `No route for ${method} ${path}`);
      }
      if ('allow' in found) {
        res.setHeader('Allow', found.allow.join(', '));
        throw new HttpError(405, `${path} does not accept ${method}`);
      }
      const body =
        method === 'GET' || method === 'DELETE' ? {} : await readJsonBody(req);
      const result = await found.route.handler({
        params: found.params,
        body,
        req,
      });
      if (result === undefined) {
        res.writeHead(204).end();
      } else {
        sendJson(res, method === 'POST' ? 201 : 200, result);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, error.toBody());
      } else {
        this.onError(error);
        sendJson(res, 500, { error: 'Something went wrong on the server' });
      }
    }
  }
}
