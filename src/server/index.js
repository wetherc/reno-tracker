// Starts the server. Settings come from the environment and nowhere
// else: PORT (default 3000) and RENO_DB_PATH (default ./data/reno.sqlite).
// The server binds to 127.0.0.1 only because the app has no login.
import { readFileSync } from 'node:fs';
import { openDatabase, DEFAULT_DB_PATH } from './db/open.js';
import { createApp } from './app.js';
import { projectRoot } from './static.js';
import { listProjects } from './repo/projects.js';

const HOST = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.RENO_DB_PATH ?? DEFAULT_DB_PATH;

const db = openDatabase(dbPath);
const server = createApp(db);
const { version } = JSON.parse(
  readFileSync(new URL('package.json', `file://${projectRoot()}/`), 'utf8'),
);

server.listen(port, HOST, () => {
  const count = listProjects(db).length;
  console.log(
    `reno-tracker ${version} on http://${HOST}:${port}, database ${dbPath} (${count} project${count === 1 ? '' : 's'})`,
  );
});

/** @param {string} signal */
function shutdown(signal) {
  console.log(`${signal}: closing`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // A hung request must not keep the process alive.
  setTimeout(() => process.exit(1), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
