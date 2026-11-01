// What security reviews on a PR (dev-workflow spec 2.6): only the changes since its last full report, at effort high,
// when that report is readable and was posted by ao-review on a commit X that is an ancestor of the head, and the diff
// from X to the head has at most 300 added and deleted lines and touches no protected path. Otherwise the whole PR, at
// the effort of the roster. Pure.
import { protectedPaths } from '../quality/merge-gate.mjs';

export const MAX_DELTA_LINES = 300;

// report: the newest security report as facts give it ({ sha, at, ok, onHead }), or null. compare: GitHub's compare of
// X with the head ({ status, files }), or null. Returns { mode: 'none' | 'full' | 'delta', reason, since?, at?, lines? }.
export function securityScope({ report, compare, gates }) {
  if (!report) return { mode: 'full', reason: 'no security report on this PR yet' };
  if (report.onHead) return { mode: 'none', reason: `the security report is on the head ${report.sha.slice(0, 7)}` };
  if (!report.ok) return { mode: 'full', reason: `the security report on ${report.sha.slice(0, 7)} cannot be read` };
  const since = report.sha.slice(0, 7);
  // ahead: the head has X and more. behind, diverged or no answer: a rebase or force-push took X out.
  if (compare?.status !== 'ahead') return { mode: 'full', reason: `${since} is no longer an ancestor of the head (rebase or force-push)` };
  const lines = compare.files.reduce((total, { additions = 0, deletions = 0 }) => total + additions + deletions, 0);
  if (lines > MAX_DELTA_LINES) return { mode: 'full', reason: `${lines} lines changed since ${since}, over ${MAX_DELTA_LINES}` };
  const paths = protectedPaths(compare.files, gates);
  if (paths.length > 0) return { mode: 'full', reason: `the changes since ${since} touch ${paths.join(', ')}` };
  return { mode: 'delta', reason: `${lines} lines changed since ${since}`, since: report.sha, at: report.at, lines };
}
