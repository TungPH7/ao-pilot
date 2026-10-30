// What gh-guard refuses to agents (quality-gates spec section 2.7): skipping the git hooks, pushing to a protected
// branch, working on a PR or writing through the GitHub API with your account, taking your token or an App key,
// changing the repository settings or deleting its workflow runs, running ao-pr.mjs with the other role's App, and
// editing protected paths. With the roster, also the role rules of agent-roster spec 2.10 (lib/agents/scope.mjs):
// files outside the role's paths, and git commands that change the checkout for read-only roles. Pure.
// Commands are read the way a shell splits them: good enough for what agents write, not proof against a determined one.
import { gitRefusal, writeRefusal } from '../agents/scope.mjs';
import { NON_AGENT_ROLES } from '../rules/references.mjs';
import { matchesGlob } from './glob.mjs';

const allow = { allow: true };
const deny = (reason) => ({ allow: false, reason: `gh-guard: ${reason}` });

const HOOKS = 'do not skip or move the git hooks; fix what they report';
const TOKEN = 'do not take or change the GitHub token of your account';
const KEY = 'do not read the private key of a GitHub App; ao-pr.mjs uses it for you';
const KEY_FILE = /\.pem\b|ao-keys|AO_(?:DEV|REVIEW)_APP_KEY/i;
// gh auth token prints your token, and so does gh auth status with -t, alone or in a group such as -at (after -h the
// rest of the group is the host name); login, switch and the others change it.
const TOKEN_COMMAND = /\bgh(?:\.exe)?\s+auth\s+(?:token|login|logout|switch|refresh|setup-git)\b|\bgh(?:\.exe)?\s+auth\s+status\b[^\n;&|]*\s(?:--show-token\b|-[^-h\s]*t)/;
// Without the system keyring, gh keeps your token in hosts.yml: in %AppData%\GitHub CLI on Windows, ~/.config/gh elsewhere.
const GH_HOSTS_FILE = /(?:GitHub CLI|[\\/]gh)[\\/]+hosts\.yml\b/i;

// The main session is you, and agents outside the contract (plugins, Explore) are not checked here. roster, the
// project's agents/roster.yaml, adds the role rules; without it they are skipped.
export function checkAgentCall(input, { gates, contract, projectDir, roster }) {
  const role = input.agent_type;
  const agentRoles = contract.roles.map(({ id }) => id).filter((id) => !NON_AGENT_ROLES.includes(id));
  if (!agentRoles.includes(role)) return allow;
  const args = input.tool_input ?? {};
  switch (input.tool_name) {
    case 'Bash':
      return checkCommand(args.command ?? '', role, gates, roster);
    case 'Read': {
      const file = args.file_path ?? '';
      if (KEY_FILE.test(file)) return deny(KEY);
      return GH_HOSTS_FILE.test(file) ? deny(TOKEN) : allow;
    }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return checkEdit(args.file_path ?? args.notebook_path ?? '', role, gates, projectDir, roster);
    default:
      return allow;
  }
}

function checkCommand(command, role, gates, roster) {
  if (TOKEN_COMMAND.test(command) || GH_HOSTS_FILE.test(command)) return deny(TOKEN);
  if (KEY_FILE.test(command)) return deny(KEY);
  for (const words of segments(command)) {
    const program = words[0]?.split(/[\\/]/).at(-1).replace(/\.exe$/i, '');
    const result = program === 'git' ? checkGit(words, gates) : program === 'gh' ? checkGh(words) : checkAoPr(words, role, gates);
    if (!result.allow) return result;
    const refusal = program === 'git' && roster ? gitRefusal(roster, role, words) : null;
    if (refusal) return deny(refusal);
  }
  return allow;
}

// The simple commands of a command line, as lists of words, with quotes removed and leading VAR=value dropped.
function segments(command) {
  const all = [];
  let words = [];
  let word = '';
  let started = false;
  let quote = null;
  const endWord = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const endCommand = () => {
    endWord();
    const start = words.findIndex((w) => !/^[A-Za-z_]\w*=/.test(w));
    if (start >= 0) all.push(words.slice(start));
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (char === '\\' && i + 1 < command.length) {
      word += command[++i];
      started = true;
    } else if (char === '\n' || ';|&()'.includes(char)) endCommand();
    else if (/\s/.test(char)) endWord();
    else {
      word += char;
      started = true;
    }
  }
  endCommand();
  return all;
}

const isProtected = (branch, gates) => gates.protected_branches.some((pattern) => matchesGlob(pattern, branch));

function checkGit(words, gates) {
  let i = 1;
  // Options of git itself, before the subcommand: -c name=value and -C <path> take a value.
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-c' && /^core\.hookspath/i.test(words[i + 1] ?? '')) return deny(HOOKS);
    i += words[i] === '-c' || words[i] === '-C' ? 2 : 1;
  }
  const [sub, ...rest] = words.slice(i);
  if (sub === 'config' && rest.some((w) => /^core\.hookspath(=|$)/i.test(w))) return deny(HOOKS);
  if (sub === 'commit' && commitSkipsHooks(rest)) return deny(HOOKS);
  if (sub === 'push') return checkPush(rest, gates);
  return allow;
}

// git commit options whose value is the next word, so a message such as -m "-n" is not read as an option.
const COMMIT_SHORT_VALUES = new Set(['m', 'F', 'C', 'c', 't']);
const COMMIT_LONG_VALUES = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer']);

function commitSkipsHooks(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-verify') return true;
    if (arg === '--') break;
    if (arg.startsWith('--')) {
      if (COMMIT_LONG_VALUES.has(arg)) i++;
    } else if (/^-[A-Za-z]+$/.test(arg)) {
      for (let j = 1; j < arg.length; j++) {
        if (arg[j] === 'n') return true;
        if (COMMIT_SHORT_VALUES.has(arg[j])) {
          if (j === arg.length - 1) i++;
          break;
        }
      }
    }
  }
  return false;
}

const PUSH_VALUES = new Set(['--repo', '-o', '--push-option', '--receive-pack', '--exec']);

// git push [options] [<remote> [<refspec>...]]. A plain `git push` names no branch; the pre-push hook sees its refs.
function checkPush(args, gates) {
  if (args.includes('--no-verify')) return deny(HOOKS);
  if (args.some((a) => ['--all', '--mirror', '--branches'].includes(a))) return deny('pushing every branch reaches the protected ones: change them through a pull request');
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (PUSH_VALUES.has(args[i])) i++;
    else if (!args[i].startsWith('-')) positional.push(args[i]);
  }
  for (const refspec of positional.slice(1)) {
    const target = refspec.split(':').at(-1).replace(/^\+/, '').replace(/^refs\/heads\//, '');
    if (isProtected(target, gates)) return deny(`${target} is protected: change it through a pull request, not a push`);
  }
  return allow;
}

// revert and update-branch came after gh 2.16, like repo autolink and run delete below.
const PR_WRITES = ['create', 'edit', 'merge', 'review', 'close', 'ready', 'reopen', 'comment', 'revert', 'update-branch'];
const REPO_WRITES = ['edit', 'delete', 'rename', 'archive', 'unarchive'];

function checkGh(words) {
  const [group, sub, action] = positional(words.slice(1));
  if (group === 'pr' && PR_WRITES.includes(sub)) {
    return deny(`do not run gh pr ${sub} with your account; use node .ai-orchestrator/scripts/ao-pr.mjs (create, edit, comment, review), and leave merging to merge-gate`);
  }
  if (group === 'api' && apiWrites(words.slice(2))) return deny('gh api may only read (GET); write through ao-pr.mjs');
  if ((group === 'secret' || group === 'variable') && ['set', 'delete', 'remove'].includes(sub)) return deny(`do not change the repository ${group}s`);
  if (group === 'repo' && (REPO_WRITES.includes(sub) || (sub === 'autolink' && ['create', 'delete'].includes(action)))) {
    return deny('do not change the repository settings');
  }
  if (group === 'run' && sub === 'delete') return deny('do not delete workflow runs; they record what the gates did');
  return allow;
}

// The words of a gh command that are not options, so that gh pr -R o/r merge 12 reads as pr merge 12. -R and --repo
// take a value.
function positional(args) {
  const words = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-R' || args[i] === '--repo') i++;
    else if (!args[i].startsWith('-')) words.push(args[i]);
  }
  return words;
}

// gh api sends GET unless told otherwise; a field or an input file makes it POST.
function apiWrites(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-X' || arg === '--method') {
      if ((args[++i] ?? '').toUpperCase() !== 'GET') return true;
    } else if (/^(?:-X|--method=)./.test(arg)) {
      if (arg.replace(/^-X|^--method=/, '').toUpperCase() !== 'GET') return true;
    } else if (/^(?:-f|-F|--field|--raw-field|--input)(?:=|$)/.test(arg) || /^-[fF]./.test(arg)) return true;
  }
  return false;
}

// ao-pr.mjs <command>: each role runs only the commands of its own App (quality/gates.yaml, github_apps).
function checkAoPr(words, role, gates) {
  const at = words.findIndex((w) => /(?:^|[\\/])ao-pr\.mjs$/.test(w));
  if (at < 0) return allow;
  const command = words[at + 1];
  const app = Object.entries(gates.github_apps).find(([, { roles }]) => roles.includes(role));
  if (!app) return deny(`${role} has no GitHub App, so it does not work on PRs`);
  const [kind, { commands }] = app;
  return commands.includes(command) ? allow : deny(`${role} uses the ${kind} App, which runs ao-pr.mjs ${commands.join(', ')}, not ${command}`);
}

function checkEdit(file, role, gates, projectDir, roster) {
  const path = relativeToProject(file, projectDir);
  if (path === null) return allow;
  const hit = gates.protected_paths.find(({ path: glob }) => matchesGlob(glob, path));
  if (hit && !(hit.editors ?? []).includes(role)) {
    return deny(`${hit.path} is protected: ${hit.editors ? `only ${hit.editors.join(', ')} may edit it` : 'agents do not edit it'}`);
  }
  const refusal = roster ? writeRefusal(roster, role, path) : null;
  return refusal ? deny(refusal) : allow;
}

// The path inside the project with forward slashes, or null for a file outside it.
function relativeToProject(file, projectDir) {
  const path = file.replaceAll('\\', '/');
  if (!/^(?:[A-Za-z]:)?\//.test(path)) return path.replace(/^\.\//, '');
  const root = `${projectDir.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
  return path.toLowerCase().startsWith(root.toLowerCase()) ? path.slice(root.length) : null;
}
