// Refuses requests that do not come from the app's own page. A hostile
// site can point its own name at 127.0.0.1 (DNS rebinding) and then read
// every response, because the browser treats it as same-origin. Its
// requests still name the hostile site in the Host header, so any Host
// other than the loopback names gets 421. A cross-site form or fetch
// names its page in the Origin header, so a foreign Origin gets 403.
import { HttpError } from './errors.js';

// Sent on every response. frame-ancestors stops another site from
// framing the app and steering a click onto Delete. img-src allows data:
// because the select chevron in base.css is a data URI. nosniff stops a
// browser from running a JSON or text answer as a script.
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
});

/** @param {import('node:http').ServerResponse} res */
export function setSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

const LOCAL_NAMES = ['127.0.0.1', 'localhost'];

/**
 * The Host values that name this server. A browser leaves out the port
 * when it is 80.
 * @param {number | undefined} port
 * @returns {string[]}
 */
export function localHosts(port) {
  const hosts = LOCAL_NAMES.map((name) => `${name}:${port}`);
  return port === 80 ? [...hosts, ...LOCAL_NAMES] : hosts;
}

/**
 * Throws an HttpError when the Host or the Origin header is foreign.
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @param {number | undefined} port the port the request arrived on
 */
export function checkSource(headers, port) {
  const hosts = localHosts(port);
  if (!hosts.includes(headers.host?.toLowerCase() ?? '')) {
    throw new HttpError(
      421,
      'This server answers only to 127.0.0.1 and localhost',
    );
  }
  const origin = headers.origin?.toLowerCase();
  if (origin !== undefined && !hosts.some((h) => origin === `http://${h}`)) {
    throw new HttpError(403, 'Requests from other sites are refused');
  }
}

/**
 * True when a Content-Type header names JSON. A cross-site form can send
 * only text/plain, urlencoded, or multipart bodies, and a cross-site
 * fetch with JSON needs a preflight that this server never answers.
 * @param {string | undefined} contentType
 */
export function isJsonType(contentType) {
  return /^application\/json\s*(;|$)/i.test(contentType ?? '');
}
