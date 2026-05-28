#!/usr/bin/env node
/**
 * Set SUPABASE_SERVICE_ROLE_KEY on the Railway service that hosts Mr. Waiz
 * (wm-os-production.up.railway.app).
 *
 * Requires in .env.local:
 *   SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL
 *   RAILWAY_TOKEN  — Account token from railway.com/account/tokens (not a project UUID)
 *
 * Usage: node scripts/set-railway-service-role.mjs [--project-name wm-os]
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const path = resolve(root, '.env.local');
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    env[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return env;
}

async function gql(token, query, variables = {}) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

async function fetchServiceRoleKey(env) {
  const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https:\/\//, '').split('.')[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  });
  const keys = await res.json();
  if (!Array.isArray(keys)) throw new Error(keys.message || 'Failed to fetch Supabase API keys');
  const row = keys.find((k) => k.name === 'service_role');
  if (!row?.api_key) throw new Error('service_role key not found');
  return row.api_key;
}

const PROJECT_QUERY = `
  query Projects {
    projects {
      edges {
        node {
          id
          name
          services {
            edges {
              node {
                id
                name
              }
            }
          }
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`;

const UPSERT = `
  mutation Upsert($input: VariableUpsertInput!) {
    variableUpsert(input: $input)
  }
`;

const REDEPLOY = `
  mutation Redeploy($id: String!) {
    serviceInstanceRedeploy(serviceId: $id)
  }
`;

function matchProject(projects, hint) {
  const h = (hint || 'wm-os').toLowerCase();
  return projects.find(
    (p) =>
      p.name.toLowerCase().includes(h) ||
      p.services.some((s) => s.name.toLowerCase().includes(h))
  );
}

async function main() {
  const env = loadEnv();
  const token = env.RAILWAY_TOKEN;
  if (!token) throw new Error('Missing RAILWAY_TOKEN in .env.local');
  if (token.length < 40) {
    throw new Error(
      'RAILWAY_TOKEN looks too short — use an Account API token from railway.com/account/tokens, not a project UUID.'
    );
  }

  const hint = process.argv.includes('--project-name')
    ? process.argv[process.argv.indexOf('--project-name') + 1]
    : 'wm-os';

  console.log('Fetching Supabase service_role key…');
  const serviceRoleKey = await fetchServiceRoleKey(env);

  console.log('Listing Railway projects…');
  const data = await gql(token, PROJECT_QUERY);
  const projects = (data.projects?.edges ?? []).map((e) => ({
    id: e.node.id,
    name: e.node.name,
    services: (e.node.services?.edges ?? []).map((s) => ({
      id: s.node.id,
      name: s.node.name,
    })),
    environments: (e.node.environments?.edges ?? []).map((en) => ({
      id: en.node.id,
      name: en.node.name,
    })),
  }));

  if (!projects.length) throw new Error('No Railway projects found for this token.');

  const project = matchProject(projects, hint);
  if (!project) {
    console.error('Projects on this account:');
    for (const p of projects) console.error(`  - ${p.name} (${p.services.map((s) => s.name).join(', ')})`);
    throw new Error(`No project matching "${hint}". Pass --project-name <name>.`);
  }

  const environment =
    project.environments.find((e) => e.name === 'production') ?? project.environments[0];
  const service =
    project.services.find((s) => s.name.toLowerCase().includes('production')) ??
    project.services[0];

  if (!environment || !service) {
    throw new Error(`Project "${project.name}" has no environment or service to target.`);
  }

  console.log(`Updating ${project.name} / ${environment.name} / ${service.name}…`);

  await gql(token, UPSERT, {
    input: {
      projectId: project.id,
      environmentId: environment.id,
      serviceId: service.id,
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      value: serviceRoleKey,
    },
  });

  console.log('Redeploying service…');
  await gql(token, REDEPLOY, { id: service.id });

  console.log('Done. SUPABASE_SERVICE_ROLE_KEY updated and redeploy triggered.');
  console.log('Live app: https://wm-os-production.up.railway.app');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
