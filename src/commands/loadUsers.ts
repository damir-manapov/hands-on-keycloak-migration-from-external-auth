import axios from "axios";

// yarn compose:up
// yarn dev
// yarn load:users

interface LegacyUser {
  username: string;
  displayName: string;
  email: string;
  roles?: string[];
}

interface KeycloakAdminTokenResponse {
  access_token: string;
}

type KnownError = {
  error?: string;
  error_description?: string;
};

interface KeycloakUserRepresentation {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  federationLink?: string | null;
}

interface KeycloakComponentRepresentation {
  id: string;
  name: string;
  providerId: string;
  providerType: string;
  parentId?: string;
  config?: Record<string, string[]>;
}

interface LegacyProviderSnapshot {
  component: KeycloakComponentRepresentation;
  originalEnabled: string;
  changed: boolean;
}

const env = {
  legacyUrl: process.env.LEGACY_URL ?? "http://localhost:4000",
  legacyEndpoint: process.env.LEGACY_ENDPOINT ?? "/users",
  keycloakUrl: process.env.KEYCLOAK_URL ?? "http://localhost:8080",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "research",
  adminRealm: process.env.KEYCLOAK_ADMIN_REALM ?? "master",
  adminUser: process.env.KEYCLOAK_ADMIN_USER ?? "admin",
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin",
  adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? "admin-cli",
  legacyProviderId: process.env.KEYCLOAK_LEGACY_PROVIDER_ID ?? "legacy-user-storage",
};

let legacyProviderDisabled = false;

const log = {
  info: (message: string) => console.log(message),
  success: (message: string) => console.log(`✅ ${message}`),
  skip: (message: string) => console.log(`ℹ️  ${message}`),
  error: (message: string, detail?: unknown) => {
    console.error(`❌ ${message}`);
    if (detail) {
      console.error(detail);
    }
  },
};

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function fetchAdminToken(): Promise<string> {
  log.info("▶ Fetching admin access token...");

  const tokenEndpoint = `${normalizeBaseUrl(env.keycloakUrl)}/realms/${env.adminRealm}/protocol/openid-connect/token`;

  try {
    const params = new URLSearchParams({
      grant_type: "password",
      client_id: env.adminClientId,
      username: env.adminUser,
      password: env.adminPassword,
    });

    const response = await axios.post<KeycloakAdminTokenResponse>(tokenEndpoint, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.data?.access_token) {
      throw new Error("Keycloak response missing access token");
    }

    return response.data.access_token;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Failed to retrieve admin token: ${JSON.stringify(error.response?.data)}`);
    }

    throw error;
  }
}

async function fetchLegacyUsers(): Promise<LegacyUser[]> {
  const legacyUrl = `${normalizeBaseUrl(env.legacyUrl)}${env.legacyEndpoint}`;
  log.info(`▶ Fetching legacy users from ${legacyUrl}`);

  const response = await axios.get<LegacyUser[]>(legacyUrl);
  log.info(`▶ Retrieved ${response.data.length} users`);
  return response.data;
}

async function createKeycloakUser(accessToken: string, user: LegacyUser): Promise<number> {
  const targetUrl = `${normalizeBaseUrl(env.keycloakUrl)}/admin/realms/${env.keycloakRealm}/users`;
  const [firstName = "", ...restName] = (user.displayName ?? "").split(" ");
  const lastName = restName.length > 0 ? restName.join(" ") : "";

  const payload = {
    username: user.username,
    email: user.email,
    firstName: firstName || null,
    lastName: lastName || null,
    enabled: true,
    emailVerified: true,
    federationLink: env.legacyProviderId,
    attributes: {
      legacyRoles: (user.roles ?? []).map((role) => String(role)),
    },
    requiredActions: [] as string[],
  };

  const response = await axios.post(targetUrl, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    validateStatus: (status) => status < 500,
  });

  return response.status;
}

async function findExistingUser(
  accessToken: string,
  username: string
): Promise<KeycloakUserRepresentation | null> {
  const response = await axios.get<KeycloakUserRepresentation[]>(
    `${normalizeBaseUrl(env.keycloakUrl)}/admin/realms/${env.keycloakRealm}/users`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        username,
        exact: true,
      },
    }
  );

  return response.data.length > 0 ? response.data[0] : null;
}

async function updateExistingUser(
  accessToken: string,
  id: string,
  user: LegacyUser
): Promise<void> {
  const baseUrl = normalizeBaseUrl(env.keycloakUrl);
  const [firstName = "", ...restName] = (user.displayName ?? "").trim().split(/\s+/);
  const lastName = restName.length > 0 ? restName.join(" ") : "";

  const payload = {
    username: user.username,
    email: user.email,
    firstName: firstName || null,
    lastName: lastName || null,
    enabled: true,
    emailVerified: true,
    federationLink: env.legacyProviderId,
    attributes: {
      legacyRoles: (user.roles ?? []).map((role) => String(role)),
    },
    requiredActions: [] as string[],
  };

  await axios.put(`${baseUrl}/admin/realms/${env.keycloakRealm}/users/${id}`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function fetchLegacyProviderComponent(
  accessToken: string
): Promise<KeycloakComponentRepresentation | null> {
  const baseUrl = normalizeBaseUrl(env.keycloakUrl);
  try {
    const response = await axios.get<KeycloakComponentRepresentation>(
      `${baseUrl}/admin/realms/${env.keycloakRealm}/components/${env.legacyProviderId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      log.skip(
        `Legacy user storage provider '${env.legacyProviderId}' not found; skipping temporary disable.`
      );
      return null;
    }
    throw error;
  }
}

async function updateLegacyProviderComponent(
  accessToken: string,
  component: KeycloakComponentRepresentation
): Promise<void> {
  const baseUrl = normalizeBaseUrl(env.keycloakUrl);
  await axios.put(
    `${baseUrl}/admin/realms/${env.keycloakRealm}/components/${component.id}`,
    component,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

async function ensureLegacyProviderDisabled(
  accessToken: string
): Promise<LegacyProviderSnapshot | null> {
  const component = await fetchLegacyProviderComponent(accessToken);
  if (!component) {
    legacyProviderDisabled = false;
    return null;
  }

  const originalEnabled = component.config?.enabled?.[0] ?? "true";
  if (originalEnabled === "false") {
    legacyProviderDisabled = true;
    log.info("▶ Legacy user storage provider already disabled");
    return { component, originalEnabled, changed: false };
  }

  const updated: KeycloakComponentRepresentation = {
    ...component,
    config: {
      ...(component.config ?? {}),
      enabled: ["false"],
    },
  };

  log.info("▶ Disabling legacy user storage provider during import");
  await updateLegacyProviderComponent(accessToken, updated);
  legacyProviderDisabled = true;

  return { component, originalEnabled, changed: true };
}

async function restoreLegacyProviderState(
  accessToken: string,
  snapshot: LegacyProviderSnapshot | null
): Promise<void> {
  if (!snapshot) {
    legacyProviderDisabled = false;
    return;
  }

  if (!snapshot.changed) {
    legacyProviderDisabled = snapshot.originalEnabled === "false";
    return;
  }

  const restored: KeycloakComponentRepresentation = {
    ...snapshot.component,
    config: {
      ...(snapshot.component.config ?? {}),
      enabled: [snapshot.originalEnabled],
    },
  };

  log.info("▶ Restoring legacy user storage provider state");
  await updateLegacyProviderComponent(accessToken, restored);
  legacyProviderDisabled = snapshot.originalEnabled === "false";
}

async function main() {
  let exitCode = 0;
  let accessToken: string | null = null;
  let providerSnapshot: LegacyProviderSnapshot | null = null;

  try {
    accessToken = await fetchAdminToken();
    providerSnapshot = await ensureLegacyProviderDisabled(accessToken);
    const legacyUsers = await fetchLegacyUsers();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of legacyUsers) {
      try {
        const status = await createKeycloakUser(accessToken, user);

        if (status === 201) {
          created += 1;
          log.success(`Created user: ${user.username}`);
          continue;
        }

        if (status === 409) {
          const existing = await findExistingUser(accessToken, user.username);

          if (!existing) {
            skipped += 1;
            log.skip(
              `User ${user.username} resolves only through federation; verify provider configuration and retry.`
            );
            continue;
          }

          if (existing.federationLink && existing.federationLink !== env.legacyProviderId) {
            skipped += 1;
            log.skip(
              `User ${user.username} is federated via ${existing.federationLink}; update manually if this is unexpected.`
            );
            continue;
          }

          if (!existing.federationLink && !legacyProviderDisabled) {
            skipped += 1;
            log.skip(
              `User ${user.username} already exists locally without federation link; migrations will not call the legacy service for this account.`
            );
            continue;
          }

          await updateExistingUser(accessToken, existing.id, user);
          updated += 1;
          log.success(`Updated existing federated user: ${user.username}`);
          continue;
        }

        failed += 1;
        log.error(`HTTP ${status} while creating user ${user.username}`);
      } catch (error) {
        failed += 1;

        if (axios.isAxiosError(error)) {
          const data = error.response?.data as KnownError | undefined;
          log.error(`Failed to create user ${user.username}`, data ?? error.message);
        } else {
          log.error(`Failed to create user ${user.username}`, error);
        }
      }
    }

    log.info("---");
    log.info(`Created : ${created}`);
    log.info(`Updated : ${updated}`);
    log.info(`Skipped : ${skipped}`);
    log.info(`Failed  : ${failed}`);

    if (failed > 0) {
      exitCode = 1;
    }
  } catch (error) {
    exitCode = 1;
    if (error instanceof Error) {
      log.error("Aborting migration", error.message);
    } else {
      log.error("Aborting migration", error);
    }
  } finally {
    if (accessToken && providerSnapshot) {
      try {
        await restoreLegacyProviderState(accessToken, providerSnapshot);
      } catch (restoreError) {
        if (restoreError instanceof Error) {
          log.error("Failed to restore legacy provider state", restoreError.message);
        } else {
          log.error("Failed to restore legacy provider state", restoreError);
        }

        if (exitCode === 0) {
          exitCode = 1;
        }
      }
    }
  }

  process.exitCode = exitCode;
}

void main();
