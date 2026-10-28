# ao-pilot

Sandbox repository for the ai-orchestrator tracker-integration live tests (Jira space `DEMO`).

- `.ai-orchestrator/`: hand-made copy of the kit (`contract/`, `lib/`, `tracker/`, `scripts/jira-sync.mjs`).
- `.claude/`: the kit hooks, the project settings (`AO_JIRA_SPACE`, `AO_APPROVERS`) and two test agents.
- `.github/workflows/`: `jira-sync` from the kit, a small `CI` (`ci-state.txt` turns it red or green), and a pretend `Deploy`.
