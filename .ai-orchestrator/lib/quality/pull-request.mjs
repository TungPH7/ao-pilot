// Checks of the PR artifacts (quality-gates spec sections 2.2 and 2.5): the title and description of a PR against
// templates/pull-request.md, and the head of a review report against templates/review-report.md. Pure. A project's kit
// copy has no templates folder, so the sections and placeholders are listed here; a test keeps them equal to the template.
import { checkPrTitle } from '../tracker/conventions.mjs';

export const PR_SECTIONS = ['Jira', 'What Changed', 'How It Was Tested', 'Acceptance Criteria Coverage', 'Risks', 'Definition of Done'];
export const PLACEHOLDERS = ['<type(scope): subject>', '<KEY>', '<Given … When … Then …>', '<test file › test name>'];

// The level-2 sections of a Markdown text, without guidance comments: { name: content }.
function sections(markdown) {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const found = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      current = heading[1];
      found[current] = '';
    } else if (current) found[current] += `${line}\n`;
  }
  return { text, found };
}

export function checkPullRequest({ title, body }) {
  const problems = [...checkTitle(title), ...checkDescription(body)];
  return { ok: problems.length === 0, problems };
}

export function checkTitle(title) {
  const result = checkPrTitle(title ?? '');
  return result.ok ? [] : [`title: ${result.reason}`];
}

export function checkDescription(body) {
  const problems = [];
  const { text, found } = sections(body ?? '');
  for (const name of PR_SECTIONS) {
    if (!(name in found)) problems.push(`${name}: the section is missing`);
    else if (found[name].trim() === '') problems.push(`${name}: the section is empty`);
  }
  for (const placeholder of PLACEHOLDERS.filter((p) => text.includes(p))) problems.push(`placeholder: ${placeholder} is still in the description`);
  if ('Example' in found) problems.push('Example: delete the Example section of the template');
  return problems;
}

// The first heading and the Role line that tell merge-gate which role wrote a review report.
export function checkReviewHeader(body, roles) {
  const problems = [];
  const lines = (body ?? '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (!/^# Review: .+\(\S+\)\s*$/.test(lines[0] ?? '')) problems.push('the report must start with "# Review: <PR title> (<KEY>)"');
  const role = lines.find((line) => /^Role:/.test(line))?.replace(/^Role:\s*/, '').trim();
  if (!roles.includes(role)) problems.push(`the report needs a line ${roles.map((r) => `"Role: ${r}"`).join(' or ')}`);
  return { ok: problems.length === 0, role: problems.length === 0 ? role : undefined, problems };
}
