import { defineConfig } from '@playwright/test';

// E2E tests of the cart page with the Chrome installed on this machine, so Playwright downloads no browser. The cart
// server starts on its own port for the run. E2E does not run in CI yet: that comes with release-workflow.
const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node src/server.ts',
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
