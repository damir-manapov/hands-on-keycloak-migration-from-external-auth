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

const env = {
  legacyUrl: process.env.LEGACY_URL ?? "http://localhost:4000",
  legacyEndpoint: process.env.LEGACY_ENDPOINT ?? "/users",
  keycloakUrl: process.env.KEYCLOAK_URL ?? "http://localhost:8080",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "research",
  adminRealm: process.env.KEYCLOAK_ADMIN_REALM ?? "master",
  adminUser: process.env.KEYCLOAK_ADMIN_USER ?? "admin",
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin",
  adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? "admin-cli",
};

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

async function fetchAdminToken(): Promise<string> {
  log.info("▶ Fetching admin access token...");

  const tokenEndpoint = `${env.keycloakUrl.replace(/\/$/, "")}/realms/${env.adminRealm}/protocol/openid-connect/token`;

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
  const legacyUrl = `${env.legacyUrl.replace(/\/$/, "")}${env.legacyEndpoint}`;
  log.info(`▶ Fetching legacy users from ${legacyUrl}`);

  const response = await axios.get<LegacyUser[]>(legacyUrl);
  log.info(`▶ Retrieved ${response.data.length} users`);
  return response.data;
}

async function createKeycloakUser(accessToken: string, user: LegacyUser): Promise<number> {
  const targetUrl = `${env.keycloakUrl.replace(/\/$/, "")}/admin/realms/${env.keycloakRealm}/users`;
  const [firstName = "", ...restName] = (user.displayName ?? "").split(" ");
  const lastName = restName.length > 0 ? restName.join(" ") : "";

  const payload = {
    username: user.username,
    email: user.email,
    firstName: firstName || null,
    lastName: lastName || null,
    enabled: true,
    emailVerified: true,
    attributes: {
      legacyRoles: (user.roles ?? []).map((role) => String(role)),
    },
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

async function main() {
  try {
    const accessToken = await fetchAdminToken();
    const legacyUsers = await fetchLegacyUsers();

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of legacyUsers) {
      try {
        const status = await createKeycloakUser(accessToken, user);

        if (status === 201) {
          created += 1;
          log.success(`Created user: ${user.username}`);
        } else if (status === 409) {
          skipped += 1;
          log.skip(`User already exists, skipping: ${user.username}`);
        } else {
          failed += 1;
          log.error(`HTTP ${status} while creating user ${user.username}`);
        }
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
    log.info(`Created: ${created}`);
    log.info(`Skipped : ${skipped}`);
    log.info(`Failed  : ${failed}`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof Error) {
      log.error("Aborting migration", error.message);
    } else {
      log.error("Aborting migration", error);
    }

    process.exit(1);
  }
}

void main();
