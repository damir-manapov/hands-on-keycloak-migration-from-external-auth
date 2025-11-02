# Keycloak Research Sandbox

This project provides a minimal playground for experimenting with authenticating against a local Keycloak instance and a custom TypeScript REST facade that emulates username/password validation.

## Prerequisites

- Node.js 18+
- Yarn 1.x
- Docker with Compose V2 (`docker compose` CLI)

## Getting Started

Install dependencies:

```bash
yarn install
```

Build the TypeScript sources:

```bash
yarn build
```

Run the auth facade in watch mode:

```bash
yarn dev
```

The REST service listens on `http://localhost:4000` and exposes:

- `GET /health` – basic readiness probe
- `POST /login` – accepts `{ "username": string, "password": string }` and returns a mock session token when the credentials match the in-memory users

## Keycloak via Docker Compose

The `compose` directory contains a ready-to-use Keycloak stack with a pre-provisioned realm and test user.

```bash
# start Keycloak in the background
yarn compose:up

# follow container logs
yarn compose:logs

# stop and remove containers
yarn compose:down
```

After startup, Keycloak is available at `http://localhost:8080` with admin credentials `admin / admin`. The imported `research` realm contains the `research-rest-client` public client and the `test-user / password` account.

## End-to-End Tests

End-to-end coverage is implemented with Vitest in `tests/e2e/auth.test.ts`. The suite validates:

1. Successful and unsuccessful authentication against the REST facade.
2. The password grant flow against Keycloak's token endpoint.

To execute the E2E tests, ensure the compose stack is running:

```bash
yarn compose:up
yarn test:e2e
```

You can override Keycloak connection parameters with environment variables when necessary:

- `KEYCLOAK_URL` (default `http://localhost:8080`)
- `KEYCLOAK_REALM` (default `research`)
- `KEYCLOAK_CLIENT_ID` (default `research-rest-client`)
- `KEYCLOAK_USERNAME` (default `test-user`)
- `KEYCLOAK_PASSWORD` (default `password`)

Stop the stack afterwards with `yarn compose:down`.

## Linting & Formatting

Run static analysis:

```bash
yarn lint
```

Automatically apply ESLint fixes:

```bash
yarn lint:fix
```

Check or apply Prettier formatting:

```bash
yarn format:check
yarn format
```

Run the full verification bundle:

```bash
yarn check
```
