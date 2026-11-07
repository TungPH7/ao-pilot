// A PR that copies a kit another project already reviewed (kit-copy-review spec 2.1, 2.2): ao-step compares it with the
// head of that review and writes the two reports itself, with no agent. The claim in the PR description proves nothing:
// everything is checked here against what GitHub says. Any doubt falls back to the review by the agents, so nothing here
// can let a PR through unread that would not have been read anyway. decideKitCopy and kitCopyReport are pure.
import { matchesGlob } from '../quality/glob.mjs';
import { botLogin, reportGaps } from '../quality/merge-gate.mjs';

const CLAIM = /^Kit review:[ \t]*([\w.-]+\/[\w.-]+)#(\d+)[ \t\r]*$/gm;
const MARK = 'Kit copy of:';
const MARKED = new RegExp(`^${MARK}`, 'm');

// The PR the description points at, or null without exactly one line of the right form.
export function kitReviewOf(body) {
  const found = [...(body ?? '').matchAll(CLAIM)];
  return found.length === 1 ? { repo: found[0][1], number: Number(found[0][2]) } : null;
}

const within = (globs, path) => globs.some((glob) => matchesGlob(glob, path));
// What a tree holds at each path: kind, mode and content, so a link or a file made executable counts as a change.
const entries = ({ tree }) => new Map(tree.filter(({ type }) => type !== 'tree').map(({ path, type, mode, sha }) => [path, `${type} ${mode} ${sha}`]));

// claim: { repo, number }, from kitReviewOf. peers: the repositories of AO_KIT_PEERS. pr: { headSha, files }, files as
// GET /pulls/{n}/files gives them. headTree: GET /git/trees/{head}?recursive=1. reference: { pull, reviews, newest, tree },
// where newest is the newest commit of its base on gates.kit_copy.newest_path. Returns { ok: false, reason } or
// { ok: true, compared, reference: { repo, number, head }, renders }; renders asks for the rendered files to be checked.
export function decideKitCopy({ claim, peers, pr, headTree, reference, gates, apps, approvers }) {
  const no = (reason) => ({ ok: false, reason });
  const name = `${claim.repo}#${claim.number}`;
  if (!peers.includes(claim.repo)) return no(`${claim.repo} is not in AO_KIT_PEERS`);
  const { pull, reviews, newest, tree } = reference;
  if (!pull.merged_at) return no(`${name} is not merged`);
  if (!gates.protected_branches.some((glob) => matchesGlob(glob, pull.base.ref))) return no(`${name} was merged into ${pull.base.ref}, not a protected branch`);
  if (!approvers.includes(pull.merged_by?.login)) return no(`${name} was merged by ${pull.merged_by?.login}, not by you`);

  const head = pull.head.sha;
  const bot = botLogin(apps.review);
  const gaps = reportGaps(reviews, head, `on head ${head.slice(0, 7)}`, gates.github_apps.review.roles, bot);
  if (gaps.length > 0) return no(`${name} lacks: ${gaps.join('; ')}`);
  // A copy of a copy would hide how far the real review is.
  if (reviews.some((r) => r.user?.login === bot && r.commit_id === head && MARKED.test(r.body ?? ''))) return no(`${name} is a kit copy too: point at the PR the agents reviewed`);
  const rule = gates.kit_copy;
  if (newest !== pull.merge_commit_sha) return no(`${name} is not the newest PR of ${claim.repo} on ${rule.newest_path}`);
  if (headTree.truncated) return no('the tree of the head is too large for GitHub to list');
  if (tree.truncated) return no(`the tree of ${name} is too large for GitHub to list`);

  const ours = entries(headTree);
  const theirs = entries(tree);
  const compared = new Set();
  let renders = false;
  const differs = (path) => {
    compared.add(path);
    return (ours.get(path) ?? null) !== (theirs.get(path) ?? null);
  };
  // A renamed file counts by both names; the same comparison covers a file removed, which must be gone there too.
  for (const path of pr.files.flatMap(({ filename, previous_filename: previous }) => (previous ? [previous, filename] : [filename]))) {
    if (within(rule.rendered, path)) renders = true;
    else if (!within([...rule.same, ...rule.same_when_changed], path)) return no(`the PR changes ${path}, which is not a kit file`);
    else if (differs(path)) return no(`${path} differs from ${name}`);
  }
  // Both ways: a part of the copy left out, or a file added beside it, is a kit nobody reviewed as a whole.
  for (const path of [...new Set([...ours.keys(), ...theirs.keys()])].filter((p) => within(rule.same, p)).sort()) {
    if (differs(path)) return no(`${path} differs from ${name}`);
  }
  return { ok: true, compared: compared.size, reference: { repo: claim.repo, number: claim.number, head }, renders };
}

// Reads what decideKitCopy needs and decides. null when the PR makes no claim or the kit has no kit_copy block; on any
// error { ok: false, reason }, so a PR is never held up by this and never passes on it unread. github: the project's
// client; peer(repo): a reading client of another repository; render(sha): renders the rendered files again, and
// resolves to null or the reason they differ. A repository outside peers is not opened: your login reads only those.
export async function readKitCopy({ pr, github, peer, peers, gates, apps, approvers, render }) {
  const claim = kitReviewOf(pr.body);
  if (!claim || !gates.kit_copy) return null;
  if (!peers.includes(claim.repo)) return { ok: false, reason: `${claim.repo} is not in AO_KIT_PEERS` };
  try {
    const client = peer(claim.repo);
    const pull = await client.get(`/pulls/${claim.number}`);
    const reviews = await client.getAll(`/pulls/${claim.number}/reviews`);
    const [newest] = await client.get('/commits', { path: gates.kit_copy.newest_path, sha: pull.base.ref, per_page: 1 });
    const tree = await client.get(`/git/trees/${pull.head.sha}`, { recursive: 1 });
    const head = pr.headSha;
    const files = await github.getAll(`/pulls/${pr.number}/files`);
    const headTree = await github.get(`/git/trees/${head}`, { recursive: 1 });
    // The list of files is of the head at that moment, and only the tree is read by its SHA.
    const now = (await github.get(`/pulls/${pr.number}`)).head.sha;
    if (now !== head) return { ok: false, reason: `the head of PR #${pr.number} moved from ${head.slice(0, 7)} while it was compared` };
    const decision = decideKitCopy({ claim, peers, pr: { headSha: head, files }, headTree, reference: { pull, reviews, newest: newest?.sha, tree }, gates, apps, approvers });
    if (!decision.ok || !decision.renders) return decision;
    const wrong = await render(head);
    return wrong ? { ok: false, reason: wrong } : decision;
  } catch (error) {
    return { ok: false, reason: `could not read the reference: ${error.message}` };
  }
}

// Why the rendered files at `sha` are not what their sources give, or null (spec 2.3). tree: { add, remove }, a copy of
// the head that no agent reads, removed whatever happens; render(path): { status, text } of render-agents.mjs --check.
export function renderedReason({ sha, tree, render }) {
  const short = sha.slice(0, 7);
  const added = tree.add();
  if (!added.ok) return `the tree of ${short} could not be made: ${added.reason}`;
  try {
    const { status, text } = render(added.path);
    return status === 0 ? null : `the rendered files at ${short} do not match their sources: ${text.trim()}`;
  } finally {
    tree.remove();
  }
}

// Posts the reports on the head that was compared, never on the head of the moment (spec 2.4): after a push they stay on
// the old head, and merge-gate asks for new ones. github: a client of the ao-review App.
export async function postKitCopyReports({ github, step }) {
  const { number, title, key, sha, roles, reference, compared } = step;
  const notes = [];
  for (const role of roles) {
    await github.request('POST', `/pulls/${number}/reviews`, {}, { commit_id: sha, event: 'COMMENT', body: kitCopyReport({ role, pr: { title }, key, reference, compared }) });
    notes.push(`Posted the ${role} report of PR #${number} on ${sha.slice(0, 7)}: a copy of ${reference.repo}#${reference.number}, ${compared} files compared, no agent ran.`);
  }
  return notes;
}

// The report of one role, in the form of templates/review-report.md, for the head ao-step compared.
export function kitCopyReport({ role, pr, key, reference, compared }) {
  const title = pr.title.endsWith(`(${key})`) ? pr.title : `${pr.title} (${key})`;
  const source = `${reference.repo}#${reference.number}`;
  return `${[
    `# Review: ${title}`,
    '',
    `Role: ${role}`,
    `${MARK} ${source} at ${reference.head}`,
    '',
    '## Context',
    '',
    `Không agent nào đọc PR này. \`ao-step\` so ${compared} file của bản chép kit với head của ${source}, nơi \`reviewer\` và \`security\` đã review đầy đủ, và file nào cũng khớp về nội dung, mode và loại. Các file render lại đã được dựng lại từ nguồn ở head của PR.`,
    '',
    '## Findings',
    '',
    '| Severity | Axis | Where | Finding | Suggested fix |',
    '|---|---|---|---|---|',
    '',
    '## Verdict',
    '',
    `Không có finding mới, vì nội dung giống hệt bản đã review ở ${source}. Bạn vẫn đọc diff và merge ở gate ③.`,
  ].join('\n')}\n`;
}
