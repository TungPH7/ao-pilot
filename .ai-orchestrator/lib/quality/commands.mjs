// What gh-guard refuses to agents (quality-gates spec section 2.7): skipping the git hooks, pushing to a protected
// branch, working on a PR or writing through the GitHub API with your account, taking your token or an App key,
// changing the repository settings or deleting its workflow runs, running ao-pr.mjs with the other role's App, and
// editing protected paths. With the roster, also the role rules of agent-roster spec 2.10 (lib/agents/scope.mjs):
// files outside the role's paths, and git commands that change the checkout for read-only roles. Pure.
// Commands are read the way a shell splits them, with the script of sh -c and eval, the command after a wrapper such as
// env or timeout, and any git or gh further on: good enough for what agents write, not proof against a determined one.
// A file written by a Bash command, such as a redirection, is not checked; the role rules cover Edit and Write.
import { posix } from 'node:path';
import { gitRefusal, writeRefusal } from '../agents/scope.mjs';
import { NON_AGENT_ROLES } from '../rules/references.mjs';
import { configReads, gitSubcommand } from './git-options.mjs';
import { matchesGlob } from './glob.mjs';

const allow = { allow: true };
const deny = (reason) => ({ allow: false, reason: `gh-guard: ${reason}` });

const HOOKS = 'do not skip or move the git hooks; fix what they report';
const TOKEN = 'do not take or change the GitHub token of your account';
const KEY = 'do not read the private key of a GitHub App; ao-pr.mjs uses it for you';
const CREDENTIAL = "do not set a git credential helper: git gets your role's token from the session (dev-workflow spec 2.3)";
// The scripts that start agents and buy their tokens (dev-workflow spec 2.3, plan decision 5).
// Matched at the end of a word: an unquoted Windows path loses its backslashes in the shell.
const ORCHESTRATION = /(ao-step|ao-agent|ao-git-credential)\.mjs$/;
const GIT_DIR = ".git/ holds git's own settings and hooks: change them with git commands, not by editing the files";
const KEY_FILE = /\.pem\b|ao-keys|AO_(?:DEV|REVIEW)_APP_KEY/i;
// gh auth token prints your token, and so does gh auth status with -t, alone or in a group such as -at (after -h the
// rest of the group is the host name); login, switch and the others change it.
const TOKEN_COMMAND = /\bgh(?:\.exe)?\s+auth\s+(?:token|login|logout|switch|refresh|setup-git|git-credential)\b|\bgh(?:\.exe)?\s+auth\s+status\b[^\n;&|]*\s(?:--show-token\b|-[^-h\s]*t)/;
// Without the system keyring, gh keeps your token in hosts.yml: in %AppData%\GitHub CLI on Windows, ~/.config/gh elsewhere.
const GH_HOSTS_FILE = /(?:GitHub CLI|[\\/]gh)[\\/]+hosts\.yml\b/i;

// The main session is you, and agents outside the contract (plugins, Explore) are not checked here. roster, the
// project's agents/roster.yaml, adds the role rules; without it they are skipped. tempDir is the one folder outside the
// project that Edit and Write may reach.
export function checkAgentCall(input, { gates, contract, projectDir, roster, tempDir }) {
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
      return checkEdit(args.file_path ?? args.notebook_path ?? '', role, gates, projectDir, roster, tempDir);
    default:
      return allow;
  }
}

function checkCommand(command, role, gates, roster, depth = 0) {
  if (TOKEN_COMMAND.test(command) || GH_HOSTS_FILE.test(command)) return deny(TOKEN);
  if (KEY_FILE.test(command)) return deny(KEY);
  for (const words of segments(command)) {
    const result = checkWords(words, role, gates, roster, depth);
    if (!result.allow) return result;
  }
  return allow;
}

// sh -c and its kin run their script, and eval its words. The wrappers run the command after their options; the
// options listed here take a value. timeout also takes a duration first.
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
const WRAPPERS = {
  env: ['-u', '--unset', '-C', '--chdir'],
  command: [],
  exec: ['-a'],
  nohup: [],
  time: [],
  nice: ['-n', '--adjustment'],
  timeout: ['-s', '--signal', '-k', '--kill-after'],
};
const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const programOf = (word) => word?.split(/[\\/]/).at(-1).replace(/\.exe$/i, '');
const nested = (script, role, gates, roster, depth) => (depth < 5 ? checkCommand(script, role, gates, roster, depth + 1) : deny('too many nested shells'));

// env: the VAR=value words before the command, which git reads too (GIT_CONFIG_*).
function checkWords(words, role, gates, roster, depth, env = words.env ?? []) {
  const program = programOf(words[0]);
  if (SHELLS.has(program)) {
    const at = words.findIndex((word, i) => i > 0 && /^-[a-z]*c[a-z]*$/.test(word));
    const script = words[at + 1] === '--' ? words[at + 2] : words[at + 1];
    if (at > 0 && script !== undefined) return nested(script, role, gates, roster, depth);
  }
  if (program === 'eval') return nested(words.slice(1).join(' '), role, gates, roster, depth);
  if (Object.hasOwn(WRAPPERS, program)) {
    const values = WRAPPERS[program];
    const assignments = [];
    let i = 1;
    for (; i < words.length; i++) {
      const word = words[i];
      if (word === '--') {
        i++;
        break;
      }
      // env -S splits its value into a command.
      if (program === 'env' && (word === '-S' || word === '--split-string')) return nested(words[i + 1] ?? '', role, gates, roster, depth);
      if (program === 'env' && /^-S./.test(word)) return nested(word.slice(2), role, gates, roster, depth);
      if (values.includes(word)) i++;
      else if (program === 'env' && ASSIGNMENT.test(word)) assignments.push(word);
      else if (!word.startsWith('-')) break;
    }
    if (program === 'timeout') i++;
    return i < words.length ? checkWords(words.slice(i), role, gates, roster, depth, [...env, ...assignments]) : allow;
  }
  if (program === 'git' && env.some((assignment) => /^GIT_CONFIG/.test(assignment))) return deny(HOOKS);
  const result = program === 'git' ? checkGit(words, gates) : program === 'gh' ? checkGh(words) : (checkOrchestration(words) ?? checkAoPr(words, role, gates));
  if (!result.allow) return result;
  const refusal = program === 'git' && roster ? gitRefusal(roster, role, words) : null;
  if (refusal) return deny(refusal);
  // A git or gh further on, as after xargs or a wrapper not listed above: its refusals apply too.
  const at = program === 'git' || program === 'gh' ? -1 : words.findIndex((word, i) => i > 0 && ['git', 'gh'].includes(programOf(word)));
  if (at < 0) return allow;
  if (programOf(words[at]) === 'git' && env.some((assignment) => /^GIT_CONFIG/.test(assignment))) return deny(HOOKS);
  return programOf(words[at]) === 'git' ? checkGit(words.slice(at), gates) : checkGh(words.slice(at));
}

// The simple commands of a command line, as lists of words, with quotes removed. The leading VAR=value words are
// dropped from the list and kept in its `env`.
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
    const start = words.findIndex((w) => !ASSIGNMENT.test(w));
    if (start >= 0) all.push(Object.assign(words.slice(start), { env: words.slice(0, start) }));
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

// -c include.path and includeIf read a whole config file, which may move the hooks; an alias may run any command.
function checkGit(words, gates) {
  const { index, settings } = gitSubcommand(words);
  if (settings.some((name) => name === 'core.hookspath' || name.startsWith('include.') || name.startsWith('includeif.'))) return deny(HOOKS);
  if (settings.some((name) => name.startsWith('alias.'))) return deny('do not define a git alias on the command line; run the git command itself');
  if (settings.some((name) => name.startsWith('credential.'))) return deny(CREDENTIAL);
  const [sub, ...rest] = words.slice(index);
  if (sub === 'credential' || sub?.startsWith('credential-')) return deny(TOKEN);
  if (sub === 'config' && !configReads(rest) && rest.some((w) => /^core\.hookspath(=|$)/i.test(w))) return deny(HOOKS);
  if (sub === 'config' && !configReads(rest) && rest.some((w) => /^credential\./i.test(w))) return deny(CREDENTIAL);
  if (sub === 'commit' && commitSkipsHooks(rest)) return deny(HOOKS);
  if (sub === 'push') return checkPush(rest, gates);
  return allow;
}

// git commit options whose value is the next word, so a message such as -m "-n" is not read as an option.
const COMMIT_SHORT_VALUES = new Set(['m', 'F', 'C', 'c', 't']);
const COMMIT_LONG_VALUES = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer']);

// git takes an unambiguous start of a long option: --no-veri is --no-verify.
const NO_VERIFY = /^--no-veri(?:f|fy)?$/;

function commitSkipsHooks(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (NO_VERIFY.test(arg)) return true;
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
  if (args.some((arg) => NO_VERIFY.test(arg))) return deny(HOOKS);
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

// gh auth token and status -t print your token; login, switch and the others change it. TOKEN_COMMAND sees the same in
// the raw text; here the words are read after the shell's quotes and backslashes.
const AUTH_TOKEN = ['token', 'login', 'logout', 'switch', 'refresh', 'setup-git', 'git-credential'];

function checkGh(words) {
  const [group, sub, action] = positional(words.slice(1));
  if (group === 'auth' && (AUTH_TOKEN.includes(sub) || (sub === 'status' && words.some((w) => w === '--show-token' || /^-[^-h\s]*t/.test(w))))) {
    return deny(TOKEN);
  }
  if (group === 'alias' && ['set', 'import'].includes(sub)) return deny('do not add a gh alias; run the gh command itself');
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

// node running ao-step.mjs, ao-agent.mjs or ao-git-credential.mjs, wherever node is in the command (xargs node ...).
// Another program that names the file, such as cat or grep, only reads it. Returns a refusal, or undefined.
function checkOrchestration(words) {
  if (!words.some((word) => programOf(word) === 'node')) return undefined;
  const script = words.map((word) => word.match(ORCHESTRATION)?.[1]).find(Boolean);
  return script ? deny(`${script}.mjs is for the human's session: an agent does not start agents or buy a token itself`) : undefined;
}

// node ao-pr.mjs <command>: each role runs only the commands of its own App (quality/gates.yaml, github_apps). The
// script is the first word after node's options; another program that names the file, such as grep, only reads it.
function checkAoPr(words, role, gates) {
  if (programOf(words[0]) !== 'node') return allow;
  const at = words.findIndex((w, i) => i > 0 && !w.startsWith('-'));
  if (at < 0 || !/(?:^|[\\/])ao-pr\.mjs$/.test(words[at])) return allow;
  const command = words[at + 1];
  const app = Object.entries(gates.github_apps).find(([, { roles }]) => roles.includes(role));
  if (!app) return deny(`${role} has no GitHub App, so it does not work on PRs`);
  const [kind, { commands }] = app;
  return commands.includes(command) ? allow : deny(`${role} uses the ${kind} App, which runs ao-pr.mjs ${commands.join(', ')}, not ${command}`);
}

// Outside the project an agent writes only in the temp folder: a user setting such as ~/.gitconfig could move the hooks.
// Windows paths ignore letter case, so the globs do too.
function checkEdit(file, role, gates, projectDir, roster, tempDir) {
  const path = relativeToProject(file, projectDir);
  if (path === null) {
    return tempDir && relativeToProject(file, tempDir) !== null ? allow : deny(`${file} is outside the project: agents write only in the project and the temp folder`);
  }
  if (/^\.git(?:\/|$)/i.test(path)) return deny(GIT_DIR);
  const hit = gates.protected_paths.find(({ path: glob }) => matchesGlob(glob.toLowerCase(), path.toLowerCase()));
  if (hit && !(hit.editors ?? []).includes(role)) {
    return deny(`${hit.path} is protected: ${hit.editors ? `only ${hit.editors.join(', ')} may edit it` : 'agents do not edit it'}`);
  }
  const refusal = roster ? writeRefusal(roster, role, path) : null;
  return refusal ? deny(refusal) : allow;
}

// The path inside the project with forward slashes and no `.` or `..`, or null for a file outside it. The Windows
// prefixes \\?\ and \\.\ name the same file.
function relativeToProject(file, projectDir) {
  const path = posix.normalize(file.replaceAll('\\', '/').replace(/^\/\/[?.]\//, ''));
  if (!/^(?:[A-Za-z]:)?\//.test(path)) return path === '..' || path.startsWith('../') ? null : path;
  const root = `${projectDir.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
  return path.toLowerCase().startsWith(root.toLowerCase()) ? path.slice(root.length) : null;
}
