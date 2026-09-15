// Starts the full app on port 0 with an in-memory database.
import { openDatabase } from '../../src/server/db/open.js';
import { createApp } from '../../src/server/app.js';

export async function startApp() {
  const db = openDatabase(':memory:');
  const server = createApp(db);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<{ status: number, body: any, headers: Headers }>}
   */
  async function api(method, path, body) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {
      status: res.status,
      body: text ? JSON.parse(text) : null,
      headers: res.headers,
    };
  }
  /** @param {string} name @param {string} [startDate] */
  async function project(name = 'Kitchen', startDate = '2026-01-05') {
    const res = await api('POST', '/api/projects', {
      name,
      startDate,
      budgetCents: 100_000,
    });
    return /** @type {import('../../src/types.ts').Project} */ (res.body);
  }
  /** @param {string} projectId @param {string} title @param {Record<string, unknown>} [extra] */
  async function item(projectId, title, extra = {}) {
    const res = await api('POST', `/api/projects/${projectId}/schedule`, {
      title,
      startDate: '2026-01-05',
      endDate: '2026-01-09',
      ...extra,
    });
    return /** @type {import('../../src/types.ts').ScheduleItem} */ (res.body);
  }
  return {
    api,
    project,
    item,
    port,
    db,
    close: () =>
      new Promise((r) =>
        server.close(() => {
          db.close();
          r(null);
        }),
      ),
  };
}
