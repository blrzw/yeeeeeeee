# Orbit PC Monitoring — Local Run Package

This archive contains the Orbit dashboard source, production build output, database schema/migrations, and the current Windows x64 monitoring agent.

## Important

Orbit is not a standalone static HTML file. The Client tab uses the Express/tRPC server, authenticated operator sessions, the managed database, and the agent heartbeat API. Opening `client/index.html` directly will not provide live device data.

## Development mode

Requirements: Node.js 22 or newer and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm dev
```

The development server prints a local preview URL. Open that URL in a browser and sign in through the Manus OAuth flow. The browser must be able to reach the database-backed server for the Client tab to show enrolled PCs.

## Production build mode

The archive includes the latest `dist/` output. To rebuild from source:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm start
```

The server expects the project environment variables used by the deployed Orbit project, including database and authentication settings. Do not commit secrets into this folder or into the archive.

## Windows agent

The latest agent is:

```text
agent/orbit-monitor-screen.exe
```

It uses the shared Orbit enrollment token configured by the server, sends device health and browser-inventory metadata, supports the employee-visible consent prompt, and requires explicit approval before screen sharing.

Run the EXE on an authorized Windows PC. The agent's connection diagnostic log is saved to:

```text
%TEMP%\\OrbitPCMonitor.log
```

## Database

The current schema is in `drizzle/schema.ts`. The migration `drizzle/0001_fantastic_pyro.sql` adds the detailed telemetry fields and enrollment-token table created during development. The per-device enrollment UI and API have since been removed; the legacy table is retained unused so no token data is deleted automatically.

Do not run destructive schema changes against a production database without reviewing them first.

## Verification

The packaged project was verified with:

- TypeScript check passing
- 12 automated tests passing
- Production build passing
- Windows x64 agent compilation passing
- Live route and agent-download checks passing
