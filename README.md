# DriveHire & Carpool

Monorepo for a vehicle-hire and shared-carpool platform. The product architecture and implementation roadmap are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); engineering conventions are in [AGENTS.md](AGENTS.md).

## Requirements

- Node.js 20 or newer and npm 10+
- PostgreSQL 15+ (or Docker Desktop for the development stack)

## Quick start

```sh
npm install
docker compose up --build
```

The compose stack exposes the API at `http://localhost:5000/api/v1/health` and the client at `http://localhost:8080`. For local development outside Docker, copy `.env.example` to `.env`, start PostgreSQL with the configured database, then run `npm run dev`.

## Scripts

| Script                               | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `npm run dev`                        | Run client and server in watch mode  |
| `npm run build`                      | Build all workspaces                 |
| `npm run lint` / `npm run typecheck` | Static checks                        |
| `npm test`                           | Workspace unit/API tests             |
| `npm run test:integration`           | Server tests against real PostgreSQL |
| `npm run migrate` / `npm run seed`   | Apply migrations / development seeds |
| `npm run format`                     | Format source and docs               |

## Current phase

Prompt 4 establishes infrastructure only. Product endpoints and workflows are implemented in subsequent phases. Do not treat placeholder client routes as completed product functionality.
