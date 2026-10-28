// The quality gates of a project, quality/gates.yaml (quality-gates spec section 6), and its rules Q1 to Q4 (spec
// section 7). Like lib/contract.mjs, only the read functions touch the disk.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { NON_AGENT_ROLES } from '../rules/references.mjs';
import { schemaErrors } from '../rules/schema.mjs';
import { WORK_BRANCH_KINDS } from '../tracker/conventions.mjs';

const schema = JSON.parse(readFileSync(new URL('../../quality/schema/gates.schema.json', import.meta.url), 'utf8'));
const validateSchema = new Ajv({ allErrors: true }).compile(schema);

export function readGates(dir = 'quality') {
  const file = join(dir, 'gates.yaml');
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${error.message}`, { cause: error });
  }
}

// The job ids of a workflow file, for rule Q2.
export function readCiJobs(file) {
  return Object.keys(parse(readFileSync(file, 'utf8')).jobs ?? {});
}

// Returns every rule violation as { rule, path, message }; the contract must already be valid. ciJobs, the jobs of
// kit/.github/workflows/ci.yml, is only known in the kit repo; a project's copy has no kit folder and skips Q2.
export function validateGates(gates, contract, { ciJobs } = {}) {
  if (!validateSchema(gates)) return schemaErrors(gates, validateSchema.errors, 'Q1', 'quality/gates.yaml');
  return [...(ciJobs ? checkChecks(gates, ciJobs) : []), ...checkRoles(gates, contract), ...checkMergeMethods(gates)];
}

// Rule Q2: the required checks are exactly the jobs of the CI workflow, since a job is a check.
function checkChecks(gates, ciJobs) {
  return [
    ...gates.checks.filter((c) => !ciJobs.includes(c)).map((c) => ({ rule: 'Q2', path: 'checks', message: `${c} is not a job of kit/.github/workflows/ci.yml` })),
    ...ciJobs.filter((j) => !gates.checks.includes(j)).map((j) => ({ rule: 'Q2', path: 'checks', message: `job ${j} of kit/.github/workflows/ci.yml is not a required check` })),
  ];
}

// Rule Q3: the Apps and the editors of protected paths are agent roles of the contract, and no role uses two Apps.
// You never act through an App: you approve with your own account.
function checkRoles(gates, contract) {
  const errors = [];
  const agentRoles = new Set(contract.roles.map(({ id }) => id).filter((id) => !NON_AGENT_ROLES.includes(id)));
  const unknown = (path, roles) => {
    for (const role of roles.filter((r) => !agentRoles.has(r))) errors.push({ rule: 'Q3', path, message: `'${role}' is not an agent role of the contract` });
  };
  const owner = new Map();
  for (const [kind, { roles }] of Object.entries(gates.github_apps)) {
    const path = `github_apps.${kind}.roles`;
    unknown(path, roles);
    for (const role of roles) {
      if (owner.has(role)) errors.push({ rule: 'Q3', path, message: `role '${role}' already uses the ${owner.get(role)} App` });
      else owner.set(role, kind);
    }
  }
  gates.protected_paths.forEach(({ editors = [] }, index) => unknown(`protected_paths[${index}].editors`, editors));
  return errors;
}

// Rule Q4: every kind of work item branch of the conventions has a merge method, and no other kind does.
function checkMergeMethods(gates) {
  const errors = [];
  const kinds = Object.keys(gates.merge_method);
  for (const kind of WORK_BRANCH_KINDS.filter((k) => !kinds.includes(k))) {
    errors.push({ rule: 'Q4', path: `merge_method.${kind}`, message: 'has no merge method' });
  }
  for (const kind of kinds.filter((k) => !WORK_BRANCH_KINDS.includes(k))) {
    errors.push({ rule: 'Q4', path: `merge_method.${kind}`, message: `is not a kind of work item branch (${WORK_BRANCH_KINDS.join(', ')})` });
  }
  return errors;
}
