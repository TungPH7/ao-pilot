# ao-pilot

Sandbox repository for the ai-orchestrator live tests (Jira space `DEMO`).

- `.ai-orchestrator/`: hand-made copy of the kit, with the contract, the templates, the agent roster and the scripts.
- `.claude/`: the kit hooks, the project settings, the ten agents, the shared rules and the vendored skills.
- `.github/workflows/`: the kit's `CI`, `jira-sync`, `merge-gate` and `audit`, and a pretend `Deploy`.
- `src/`: a small cart (`cart.ts`) and its page, rendered on the server (`page.ts`, `server.ts`).

## Commands

```
npm test              # unit tests
npm run test:coverage # unit tests with coverage, lcov in coverage/lcov.info
npm run serve         # the cart page on http://127.0.0.1:3000/ (PORT changes the port)
npm run test:e2e      # Playwright E2E tests with the Chrome installed on this machine
```

E2E tests do not run in CI yet. Their names start with the acceptance criterion they cover, such as `AC1 …`.
