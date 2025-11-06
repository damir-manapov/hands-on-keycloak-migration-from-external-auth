# Keycloak Migration Reference

This is a reference implementation for migrating user authorization from a legacy system to Keycloak.

## Migration Strategy

The project implements a custom Keycloak extension (User Storage Provider SPI) that intercepts authentication attempts and redirects them to the legacy system. The legacy system validates the login/password combination, and if successful, the password is saved in Keycloak. This enables a gradual password migration: passwords flow into Keycloak on each user's first successful login. Once a password is stored locally in Keycloak, subsequent authentication attempts for that user use the local database instead of querying the legacy system.

Additionally, there is a bulk import script that migrates user profiles at startup without their passwords. The script temporarily disables the extension, imports user profiles from the legacy system into Keycloak, and then re-enables the extension. This allows users to be pre-provisioned in Keycloak while their passwords are migrated on-demand during their first login.

## How It Works

- `src/server.ts` acts as the legacy authentication facade. It accepts username/password pairs, mimicking the historical system that still owns the definitive credentials.
- Keycloak (see the `compose` directory) represents the target Identity Provider. The custom User Storage Provider intercepts login attempts and forwards them to the legacy system for validation.
- On first successful authentication, the password is stored in Keycloak. Subsequent logins use the local Keycloak database.
- The E2E tests model the migration flow: first authenticate via the legacy facade, then exchange those credentials against Keycloak's password grant to issue modern tokens.

> **Note:** For local experimentation the sample realm seeds `test-user / password` in both systems so the flows work out of the box. In a real migration you would call the Keycloak Admin API (or a custom SPI) to update the password only after the legacy system verifies the user.

## TODO

- Create maven package with legacy provider
- Create npm package with migration scripts and dummy legacy facade

## Prerequisites

- Node.js 18+
- Yarn 1.x
- Docker with Compose V2 (`docker compose` CLI)
- For the Java SPI (optional): JDK 21+, Maven 3.9+ (`sudo apt-get update && sudo apt-get install -y openjdk-21-jdk maven` on Debian/Ubuntu)
- Optional Java linting: SpotBugs (runs via Maven), Error Prone (pulled automatically via Maven), and Google Java Format (enforced via Maven) if you plan to run `mvn clean verify` inside `keycloak-providers/legacy-user-storage`.

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
- `GET /users` – exports all legacy profiles (sans passwords) for syncing into Keycloak
- `GET /users/:username` – exports a single user snapshot to support incremental migrations

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

The lightweight `starter` helper service waits until Keycloak's discovery endpoint responds before exiting, so `yarn compose:up` targets it to ensure the IdP is ready for tests and tooling.

### CLI Login Helper

Use the bundled `scripts/keycloak-login.sh` to obtain tokens via the password grant:

```bash
yarn compose:up
scripts/keycloak-login.sh test-user password
```

Override defaults with `KEYCLOAK_URL`, `KEYCLOAK_REALM`, or `KEYCLOAK_CLIENT_ID` when needed.

### List Keycloak Users via CLI

Inspect users provisioned in the realm without opening the admin console:

```bash
yarn list:users
```

Optional environment variables:

- `KEYCLOAK_USER_SEARCH` – filter by username/email
- `KEYCLOAK_USER_LIMIT` – limit the number of returned users
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_REALM` – override defaults

### Bulk User Import (without passwords)

The command `yarn load:users` calls `src/commands/loadUsers.ts`, which pulls user profiles from the legacy facade (`/users`) and pre-creates federated identities in Keycloak via the admin REST API, preserving emails and storing legacy roles as attributes. Defaults assume:

- legacy facade: `http://localhost:4000/users`
- admin credentials: `admin / admin`
- target realm: `research`

> Imported users keep their `federationLink` pointing at the legacy provider, so the first login will still delegate password validation to the legacy service. Once your SPI stores a password locally (or you detach the federation link), subsequent logins remain in Keycloak.

Example workflow:

```bash
yarn compose:up
yarn dev  # in a separate terminal
yarn load:users
```

Override behavior with env vars such as `LEGACY_URL`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_USER`, or `KEYCLOAK_ADMIN_PASSWORD` before running the command.

- Set `KEYCLOAK_LEGACY_PROVIDER_ID` if your legacy user storage component uses a different id than the default `legacy-user-storage`.

After startup, Keycloak is available at `http://localhost:8080` with admin credentials `admin / admin`. The imported `research` realm contains the `research-migration-from-legacy` public client and the `test-user / password` account.

### Custom User Storage Provider

A companion Java SPI lives in `keycloak-providers/legacy-user-storage`. It lets Keycloak call the legacy facade during authentication.

Build and copy the provider JAR:

```bash
mvn -f keycloak-providers/legacy-user-storage/pom.xml package
cp keycloak-providers/legacy-user-storage/target/legacy-user-storage-provider-0.1.0-SNAPSHOT.jar compose/keycloak/providers/legacy-user-storage-provider.jar
```

Restart Keycloak (`yarn compose:restart`). Then, in the admin console:

1. Go to **User Federation → Add provider → legacy-user-storage**.
2. Set **Legacy facade base URL** if the default (`http://legacy-auth:4000/`) differs in your environment.
3. Save and test a login for a migrated user.

Keycloak now queries the legacy facade for user details and validates passwords via `/login` before falling back to local credentials.

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
yarn typecheck
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
