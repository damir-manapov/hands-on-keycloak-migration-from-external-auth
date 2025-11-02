import axios from "axios";

// yarn list:users

interface KeycloakAdminTokenResponse {
  access_token: string;
}

interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdTimestamp?: number;
}

const env = {
  keycloakUrl: process.env.KEYCLOAK_URL ?? "http://localhost:8080",
  keycloakRealm: process.env.KEYCLOAK_REALM ?? "research",
  adminRealm: process.env.KEYCLOAK_ADMIN_REALM ?? "master",
  adminUser: process.env.KEYCLOAK_ADMIN_USER ?? "admin",
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin",
  adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? "admin-cli",
  search: process.env.KEYCLOAK_USER_SEARCH,
  limit: process.env.KEYCLOAK_USER_LIMIT,
};

const log = {
  info: (message: string) => console.log(message),
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
  const tokenEndpoint = `${normalizeBaseUrl(env.keycloakUrl)}/realms/${env.adminRealm}/protocol/openid-connect/token`;

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
}

async function fetchUsers(accessToken: string): Promise<KeycloakUser[]> {
  const baseUrl = normalizeBaseUrl(env.keycloakUrl);
  const query = new URLSearchParams();

  if (env.search && env.search.trim().length > 0) {
    query.set("search", env.search.trim());
  }

  if (env.limit) {
    const parsedLimit = Number(env.limit);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      query.set("max", String(parsedLimit));
    }
  }

  const url = `${baseUrl}/admin/realms/${env.keycloakRealm}/users${query.toString() ? `?${query.toString()}` : ""}`;

  const response = await axios.get<KeycloakUser[]>(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

function printUsers(users: KeycloakUser[]): void {
  if (users.length === 0) {
    log.info("No users found.");
    return;
  }

  log.info(`Found ${users.length} user${users.length === 1 ? "" : "s"}:`);
  const rows = users.map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email ?? "",
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    enabled: user.enabled,
    createdAt: user.createdTimestamp ? new Date(user.createdTimestamp).toISOString() : "",
  }));

  console.table(rows);
}

async function main() {
  try {
    log.info("▶ Fetching admin token...");
    const accessToken = await fetchAdminToken();

    log.info("▶ Fetching users from Keycloak...");
    const users = await fetchUsers(accessToken);
    printUsers(users);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? "unknown";
      const detail = error.response?.data ?? error.message;
      log.error(`Request to Keycloak failed (status ${status})`, detail);
    } else if (error instanceof Error) {
      log.error(error.message);
    } else {
      log.error("Unexpected error", error);
    }

    process.exitCode = 1;
  }
}

void main();
