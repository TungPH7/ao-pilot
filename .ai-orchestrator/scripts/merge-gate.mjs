// merge-gate (quality-gates spec section 2.5): merges each agent PR that meets every gate, with the ao-dev App, and
// prints what the others wait for. The logic is lib/quality/merge-gate.mjs; this file builds the clients. In a project
// it runs from .ai-orchestrator/scripts/, next to the project's copy of the kit.
// Usage: node scripts/merge-gate.mjs [--dry-run] [--repo <owner>/<name>]
// The repository is GITHUB_REPOSITORY, else the GitHub remote origin of the current folder. Reads use GITHUB_TOKEN or
// the GitHub CLI: an App token cannot read check runs. Merges use an installation token of the ao-dev App, whose key
// is AO_DEV_APP_KEY in CI or the file AO_DEV_APP_KEY_FILE names on your machine. The App slugs and id, and your GitHub
// logins (AO_APPROVERS), come from the environment or from the env block of the project's .claude/settings.json.
// --dry-run prints the decisions and buys no App token.
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { projectSettings, setting } from '../lib/project-settings.mjs';
import { readGates } from '../lib/quality/gates.mjs';
import { appCredentials, installationToken } from '../lib/quality/github-app.mjs';
import { runMergeGate } from '../lib/quality/merge-gate.mjs';
import { createGitHubClient, originRepo, readGitHubToken } from '../lib/tracker/github-client.mjs';

const projectDir = process.env.GITHUB_WORKSPACE ?? process.cwd();

try {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, repo: { type: 'string' } } });
  const repo = values.repo ?? process.env.GITHUB_REPOSITORY ?? originRepo(projectDir);
  if (!repo) throw new Error('Set GITHUB_REPOSITORY, pass --repo <owner>/<name>, or run merge-gate in a clone whose origin is on GitHub');
  const settings = projectSettings(projectDir);
  const apps = { dev: setting('AO_DEV_APP', settings), review: setting('AO_REVIEW_APP', settings) };
  if (!apps.dev || !apps.review) throw new Error('Set AO_DEV_APP and AO_REVIEW_APP, the slugs of the two GitHub Apps, in .claude/settings.json');
  const approvers = (setting('AO_APPROVERS', settings) ?? '').split(',').map((login) => login.trim()).filter(Boolean);
  if (approvers.length === 0) console.log('Warning: AO_APPROVERS is not set, so no PR counts as approved by you and none is merged');
  const token = readGitHubToken();
  if (!token) throw new Error('Set GITHUB_TOKEN, or log in to the GitHub CLI');

  const mergeClient = async () => {
    const env = { ...process.env, AO_DEV_APP: apps.dev, AO_DEV_APP_ID: setting('AO_DEV_APP_ID', settings) };
    const { appId, privateKey } = appCredentials('dev', { env });
    const { token: appToken } = await installationToken({ appId, privateKey, repo });
    return createGitHubClient({ repo, token: appToken, write: true });
  };
  const { failures } = await runMergeGate({
    github: createGitHubClient({ repo, token }),
    mergeClient,
    gates: readGates(fileURLToPath(new URL('../quality/', import.meta.url))),
    apps,
    approvers,
    dryRun: values['dry-run'],
  });
  if (failures.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
