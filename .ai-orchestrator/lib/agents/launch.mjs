// The command ao-agent.mjs runs to start an agent as the main session (agent-roster spec 2.5). `claude --agent` takes
// only the tools, model and system prompt of an agent, so the effort, the turn limit and the preloaded skills come as
// flags (T1). Pure: the script reads the skills, writes the skills file and starts claude.
import { join } from 'node:path';

const INTERACTIVE = 'You work with the human directly in this session: when you need an answer, ask them one question at a time.';
const UNATTENDED = 'You run unattended (claude -p): nobody answers questions in this session. Write them where your instructions say, then stop.';

// args: the caller's arguments for claude, such as -p "<prompt>" --output-format json. skills: Map of skill name →
// { dir, text } for the SKILL.md files the role preloads. roster: already merged with roster.local.yaml.
export function launchPlan({ role, roster, args, skills, projectDir }) {
  const entry = roster.roles[role];
  if (!entry) throw new Error(`${role} is not a role of agents/roster.yaml`);
  const unattended = args.includes('-p') || args.includes('--print');
  const parts = [`## Session\n\n${unattended ? UNATTENDED : INTERACTIVE}`];
  for (const name of entry.skills) {
    const skill = skills.get(name);
    if (!skill) throw new Error(`skill ${name} of ${role} has no SKILL.md in .claude/skills/${name}`);
    parts.push(`## Skill: ${name}\n\nThe files of this skill are in ${skill.dir}.\n\n${skill.text.replace(/\r\n?/g, '\n').trim()}`);
  }
  const path = join(projectDir, '.ai', 'agents', `${role}.skills.md`);
  const ours = [
    '--agent',
    role,
    ...(args.includes('--effort') ? [] : ['--effort', entry.effort]),
    '--append-system-prompt-file',
    path,
    ...(unattended && entry.max_turns && !args.includes('--max-turns') ? ['--max-turns', String(entry.max_turns)] : []),
  ];
  return { command: 'claude', args: [...ours, ...args], skillsFile: { path, text: `${parts.join('\n\n')}\n` } };
}
