# Keycloak Migration Sandbox

This sandbox demonstrates how to bridge a legacy username/password authenticator with Keycloak when migrating an existing user base. Accounts are provisioned in Keycloak up-front, while credentials stay in the legacy store and are only copied to Keycloak on the user's first post-migration sign-in.

## Migration Scenario

- `src/server.ts` acts as the legacy authentication facade. It accepts username/password pairs, mimicking the historical system that still owns the definitive credentials.
- Keycloak (see the `compose` directory) represents the target Identity Provider. Users exist there from day one, but the password hash is transferred when the legacy service successfully authenticates a login event.
- The E2E tests model a "just-in-time" migration: first authenticate via the legacy facade, then exchange those credentials against Keycloak's password grant to issue modern tokens.

> **Note:** For local experimentation the sample realm seeds `test-user / password` in both systems so the flows work out of the box. In a real migration you would call the Keycloak Admin API (or a custom SPI) to update the password only after the legacy system verifies the user.

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

# drop all Keycloak data (volumes) and remove orphan containers
yarn compose:reset
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
