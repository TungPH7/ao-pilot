import { defineConfig, type Project } from '@playwright/test';

// E2E tests of the cart page with the Chrome installed on this machine, so Playwright downloads no browser. The cart
// server starts on its own port for the run.
//
// With E2E_BASE_URL, such as https://pilot-dev.ao.t2g.io.vn for /ao-qa, one `playwright test` runs two projects:
// - local: the tests tagged @local, on the server started here. They send raw requests (a foreign Host or Origin, an
//   oversized body) that a browser cannot send and that Caddy, with HTTPS and basic auth, would not pass on as they are.
// - environment: every other test, on E2E_BASE_URL, with basic auth from E2E_HTTP_USER and E2E_HTTP_PASSWORD when both
//   are set. AC4 of e2e/remove.spec.ts starts a server of its own and goes to it, wherever the project points.
// Without E2E_BASE_URL every test runs on the server started here, as before.
const PORT = 3100;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const BASE_URL = process.env.E2E_BASE_URL || undefined;
const USER = process.env.E2E_HTTP_USER;
const PASSWORD = process.env.E2E_HTTP_PASSWORD;

const projects: Project[] =
  BASE_URL === undefined
    ? [{ name: 'local' }]
    : [
        { name: 'local', grep: /@local/ },
        {
          name: 'environment',
          grepInvert: /@local/,
          use: {
            baseURL: BASE_URL,
            ...(USER && PASSWORD ? { httpCredentials: { username: USER, password: PASSWORD } } : {}),
          },
        },
      ];

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: LOCAL_URL,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects,
  webServer: {
    command: 'node src/server.ts',
    url: `${LOCAL_URL}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
