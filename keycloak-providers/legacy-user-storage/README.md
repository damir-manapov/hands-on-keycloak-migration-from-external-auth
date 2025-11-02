# Legacy User Storage Provider (Keycloak SPI)

This module contains a sample [Keycloak User Storage Provider SPI](https://www.keycloak.org/docs/latest/server_development/#_user-storage-spi) that forwards credential checks to the legacy Express facade (`src/server.ts`). It also exposes basic user metadata so users can be created on demand the first time they sign in.

## Prerequisites

- JDK 21+
- Maven 3.9+
- Running legacy facade (`yarn dev`) and Keycloak container (`yarn compose:up`) when testing the provider

## Build

```bash
mvn -f keycloak-providers/legacy-user-storage/pom.xml package
```

The compiled JAR will be available at:

```
keycloak-providers/legacy-user-storage/target/legacy-user-storage-provider-0.1.0-SNAPSHOT.jar
```

Rename or copy it to `legacy-user-storage-provider.jar` and place it where the Keycloak container can load it, e.g. `compose/providers/`.

```bash
cp keycloak-providers/legacy-user-storage/target/legacy-user-storage-provider-0.1.0-SNAPSHOT.jar compose/providers/legacy-user-storage-provider.jar
```

Restart Keycloak so it picks up the new provider:

```bash
yarn compose:down
yarn compose:up
```

## Registering the Provider

1. Log in to the Keycloak admin console (`http://localhost:8080/admin` → `admin` / `admin`).
2. Navigate to **User Federation → Add provider → legacy-user-storage**.
3. Set **Legacy facade base URL** if you need an override (default `http://legacy-auth:4000/`).
4. Save the provider. On the first login attempt, Keycloak will query the legacy facade for user details and validate passwords by forwarding `/login` requests.

## Configuration notes

- The provider reads the component configuration property `legacyBaseUrl`. Defaults to `http://legacy-auth:4000/`. When running locally, map `legacy-auth` to the host machine (e.g. Docker networks or `host.docker.internal`).
- Logs from the provider appear in the Keycloak container output (`docker compose logs keycloak`).
- Only password validation and basic lookups are implemented. Additional SPI contracts (e.g. user registration or credential updates) can be added as needed.
