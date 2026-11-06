// What ao-step does around a qa run (release-workflow spec 2.5), besides the run itself: the basic auth of Development
// and Staging for Playwright, and, once the run ends and before its worktree goes, the evidence attached to the item with
// the CI token, and a check that the environment still runs the release qa tested. The effects are parameters.

// AO_ENV_AUTH, a user variable of your Windows account, is "user:password". An error never quotes it.
export function basicAuthEnv(envAuth) {
  const at = typeof envAuth === 'string' ? envAuth.indexOf(':') : -1;
  if (at < 1 || at === envAuth.length - 1) throw new Error('AO_ENV_AUTH must be user:password, the basic auth of Development and Staging (docs/vps-setup.md section 11)');
  return { E2E_HTTP_USER: envAuth.slice(0, at), E2E_HTTP_PASSWORD: envAuth.slice(at + 1) };
}

const short = (sha) => (sha ? sha.slice(0, 8) : 'nothing');
const title = (env) => `${env[0].toUpperCase()}${env.slice(1)}`;
const TRACE = /(^|\/)trace\.zip$/;

// run: the qa run ({ key, qa: { environment, sha } }); tree: its worktree ({ path }). list(dir) gives the files under a
// folder, [] when there is none; attach(key, files) resolves { attached, skipped } (lib/tracker/attachments.mjs);
// running(environment) resolves the sha that runs there now. Resolves notes for state.json and last.md.
export async function qaFollowUp({ run, tree, projectDir, list, attach, running }) {
  const notes = [];
  const dir = (path) => path.replaceAll('\\', '/').replace(/\/+$/, '');
  const files = [...list(`${dir(projectDir)}/.ai/qa/${run.key}`), ...(tree ? list(`${dir(tree.path)}/test-results`).filter((file) => TRACE.test(file)) : [])];
  if (files.length > 0) {
    try {
      const { attached, skipped } = await attach(run.key, files);
      const over = skipped.length > 0 ? ` Over the limit of Jira: ${skipped.map(({ name }) => name).join(', ')}.` : '';
      notes.push(`Attached to ${run.key}: ${attached.length > 0 ? attached.join(', ') : 'no file'}.${over}`);
    } catch (error) {
      notes.push(`The evidence was not attached: ${error.message}. It stays in .ai/qa/${run.key}/.`);
    }
  }
  const now = await running(run.qa.environment);
  if (now !== run.qa.sha) {
    notes.push(`${title(run.qa.environment)} ran ${short(run.qa.sha)} when qa started and runs ${short(now)} now: the deployer replaced it during the run, so run /ao-qa ${run.key} again.`);
  }
  return notes;
}
