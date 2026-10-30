// The two role rules gh-guard adds from agents/roster.yaml (agent-roster spec 2.10): a role writes only the files of
// its `writes` globs, and a role with read-only git runs only git commands that read. Pure; each function returns the
// reason of a refusal, or null.
import { matchesGlob } from '../quality/glob.mjs';

// path: inside the project, with forward slashes. Roles the roster does not know are not checked here.
export function writeRefusal(roster, role, path) {
  const writes = roster.roles[role]?.writes;
  if (!writes || writes.some((glob) => matchesGlob(glob, path))) return null;
  return `${role} may write only ${writes.join(', ') || 'no file'} (agents/roster.yaml), not ${path}`;
}

// The git subcommands that only read (spec 2.10). branch, remote and config read only in some forms, below.
const READ = new Set(['status', 'log', 'show', 'diff', 'fetch', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'merge-base', 'blame', 'grep', 'describe', 'shortlog', 'for-each-ref']);
// git branch options that list; the ones that take a commit may be followed by one.
const BRANCH_LISTING = new Set(['-a', '--all', '-r', '--remotes', '-l', '--list', '-v', '-vv', '--verbose', '--show-current', '--no-color', '--color', '--column', '--no-column', '-i', '--ignore-case', '--omit-empty']);
const BRANCH_COMMIT = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at']);
// git config options that read, and options that only shape what is read or where from.
const CONFIG_GETS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '-l', '--list']);
const CONFIG_SHAPES = new Set(['--show-origin', '--show-scope', '--null', '-z', '--name-only', '--global', '--system', '--local', '--worktree', '--includes', '--no-includes', '--type', '--default', '--bool', '--int', '--path']);

// words: a git command as words, starting with git. Options of git itself (-C <path>, -c name=value, --no-pager…)
// come before the subcommand.
export function gitRefusal(roster, role, words) {
  if (roster.roles[role]?.git !== 'read') return null;
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) i += words[i] === '-c' || words[i] === '-C' ? 2 : 1;
  const [sub, ...args] = words.slice(i);
  if (sub === undefined || READ.has(sub)) return null;
  if (sub === 'branch' && branchLists(args)) return null;
  if (sub === 'remote' && (args.length === 0 || args.every((a) => a === '-v' || a === '--verbose') || ['show', 'get-url'].includes(args.find((a) => !a.startsWith('-'))))) return null;
  if (sub === 'config' && configReads(args)) return null;
  return `${role} has read-only git (agents/roster.yaml): git ${sub} would change the shared checkout or the repository. Read another branch with git show <ref>:<path> or git diff <ref>`;
}

function branchLists(args) {
  const listing = args.includes('-l') || args.includes('--list');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = arg.split('=')[0];
    if (BRANCH_COMMIT.has(flag)) {
      if (!arg.includes('=') && args[i + 1] && !args[i + 1].startsWith('-')) i++;
    } else if (BRANCH_LISTING.has(arg) || /^--(format|sort)=/.test(arg)) continue;
    else if (arg.startsWith('-') || !listing) return false;
  }
  return true;
}

// git config reads with --get and its kind, --list, `get` and `list`, or a single name; a name and a value write.
function configReads(args) {
  const names = [];
  let gets = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = arg.split('=')[0];
    if (CONFIG_GETS.has(flag)) gets = true;
    else if (CONFIG_SHAPES.has(flag)) {
      if ((flag === '--type' || flag === '--default') && !arg.includes('=')) i++;
    } else if (arg.startsWith('-')) return false;
    else names.push(arg);
  }
  if (['get', 'list'].includes(names[0])) return true;
  return names.length <= (gets ? 2 : 1);
}
