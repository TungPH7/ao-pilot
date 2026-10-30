// Starts an agent as the main session (agent-roster spec 2.5): claude --agent <role> with the effort of the roster, its
// preloaded skills in a file appended to the system prompt, and with -p its turn limit. Run it from the project root.
// The skills file is rewritten in .ai/agents/<role>.skills.md on every run. CLAUDE_CODE_EFFORT_LEVEL still beats the
// effort, to raise it for one run.
// Usage: node .ai-orchestrator/scripts/ao-agent.mjs <role> [--ao-dry-run] [claude arguments, such as -p "<prompt>"]
// --ao-dry-run writes the skills file and prints the command instead of running it. The kit is in AO_KIT_DIR when set.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { launchPlan } from '../lib/agents/launch.mjs';
import { mergeLocal, readRoster } from '../lib/agents/roster.mjs';

const [role, ...rest] = process.argv.slice(2);
if (!role || role.startsWith('-')) {
  console.error('Usage: node .ai-orchestrator/scripts/ao-agent.mjs <role> [--ao-dry-run] [claude arguments, such as -p "<prompt>"]');
  process.exit(2);
}
const dryRun = rest.includes('--ao-dry-run');
const args = rest.filter((arg) => arg !== '--ao-dry-run');
const kitDir = resolve(process.env.AO_KIT_DIR ?? fileURLToPath(new URL('..', import.meta.url)));
const projectDir = process.cwd();
const skillDir = (name) => join(projectDir, '.claude', 'skills', name);

let plan;
try {
  const localFile = join(kitDir, 'roster.local.yaml');
  const local = existsSync(localFile) ? parse(readFileSync(localFile, 'utf8')) : undefined;
  const { roster, errors } = mergeLocal(readRoster(join(kitDir, 'agents')), local, { skillExists: (name) => existsSync(join(skillDir(name), 'SKILL.md')) });
  if (errors.length > 0) throw new Error(errors.join('\n'));
  const names = roster.roles[role]?.skills ?? [];
  const skills = new Map(names.filter((name) => existsSync(join(skillDir(name), 'SKILL.md'))).map((name) => [name, { dir: skillDir(name), text: readFileSync(join(skillDir(name), 'SKILL.md'), 'utf8') }]));
  plan = launchPlan({ role, roster, args, skills, projectDir });
  mkdirSync(dirname(plan.skillsFile.path), { recursive: true });
  writeFileSync(plan.skillsFile.path, plan.skillsFile.text);
} catch (error) {
  console.error(`ao-agent: ${error.message}`);
  process.exit(1);
}

if (dryRun) {
  const shown = plan.args.map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg));
  console.log(`${plan.command} ${shown.join(' ')}`);
} else {
  const child = spawn(plan.command, plan.args, { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`ao-agent: cannot start ${plan.command}: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}
