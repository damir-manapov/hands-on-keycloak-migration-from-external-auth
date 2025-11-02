import axios, { AxiosError } from "axios";
import type { AxiosResponse } from "axios";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../../src/server";
import type { AuthErrorResponse, AuthSuccessResponse } from "../../src/server";
import type { PublicUserProfile } from "../../src/users";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "research";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "research-migration-from-legacy";
const KEYCLOAK_USERNAME = process.env.KEYCLOAK_USERNAME ?? "test-user";
const KEYCLOAK_PASSWORD = process.env.KEYCLOAK_PASSWORD ?? "password";

const TOKEN_ENDPOINT = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = startServer(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  await waitForKeycloak();
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

function expectAxiosError<T>(error: unknown): asserts error is AxiosError<T> {
  if (!axios.isAxiosError<T>(error)) {
    throw error;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

function isPublicUserProfile(value: unknown): value is PublicUserProfile {
  if (!isRecord(value)) {
    return false;
  }

  const username = value.username;
  const displayName = value.displayName;
  const email = value.email;
  const roles = value.roles;
  const lastLoginAt = value.lastLoginAt;

  return (
    typeof username === "string" &&
    typeof displayName === "string" &&
    typeof email === "string" &&
    isStringArray(roles) &&
    (lastLoginAt === undefined || typeof lastLoginAt === "string")
  );
}

function assertPublicUserProfiles(value: unknown): asserts value is PublicUserProfile[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Expected an array of PublicUserProfile objects");
  }

  for (const entry of value) {
    if (!isPublicUserProfile(entry)) {
      throw new TypeError("Expected an array of PublicUserProfile objects");
    }
  }
}

describe("User export APIs", () => {
  it("exports user profiles without passwords for migration", async () => {
    await axios.post<AuthSuccessResponse>(`${baseUrl}/login`, {
      username: "test-user",
      password: "password",
    });

    const response: AxiosResponse<PublicUserProfile[]> = await axios.get(`${baseUrl}/users`);

    expect(response.status).toBe(200);
    const profilesUnknown = response.data;
    assertPublicUserProfiles(profilesUnknown);
    const profiles = profilesUnknown;
    const usernames = profiles.map((user) => user.username);
    expect(usernames).toEqual(
      expect.arrayContaining([
        "test-user",
        "api-reader",
        "analyst-mila",
        "ops-noah",
        "legacy-admin",
      ])
    );

    const testUserProfile = profiles.find((user) => user.username === "test-user");
    if (!testUserProfile) {
      throw new Error("Expected test-user to be present in legacy export");
    }
    expect(testUserProfile).not.toHaveProperty("password");
    expect(testUserProfile.lastLoginAt).toBeDefined();
  });

  it("provides individual user snapshots without passwords", async () => {
    const response: AxiosResponse<PublicUserProfile> = await axios.get(
      `${baseUrl}/users/legacy-admin`
    );

    expect(response.status).toBe(200);
    const profileUnknown = response.data;
    if (!isPublicUserProfile(profileUnknown)) {
      throw new TypeError("Expected a public user profile");
    }
    const profile = profileUnknown;
    expect(profile.username).toBe("legacy-admin");
    expect(profile.roles).toEqual(["admin"]);
    expect(profile).not.toHaveProperty("password");
  });

  it("returns 404 when exporting an unknown user", async () => {
    try {
      await axios.get<PublicUserProfile>(`${baseUrl}/users/unknown-person`);
      throw new Error("Expected request to fail");
    } catch (error) {
      expectAxiosError<AuthErrorResponse>(error);
      expect(error.response?.status).toBe(404);
      expect(error.response?.data).toMatchObject({
        status: "error",
        message: "user not found",
      });
    }
  });
});

describe("Auth research workflows", () => {
  it("authenticates against the local REST facade", async () => {
    const response = await axios.post<AuthSuccessResponse>(`${baseUrl}/login`, {
      username: "test-user",
      password: "password",
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe("success");
    expect(response.data.username).toBe("test-user");
    expect(response.data.token).toHaveLength(48);
  });

  it("rejects invalid credentials via the REST facade", async () => {
    await expect(
      axios.post<AuthSuccessResponse>(`${baseUrl}/login`, {
        username: "test-user",
        password: "wrong",
      })
    ).rejects.toMatchObject({
      response: {
        status: 401,
        data: {
          status: "error",
          message: "invalid credentials",
        },
      },
    });
  });

  it("obtains an access token from Keycloak using the password grant", async () => {
    interface KeycloakTokenResponse {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
      refresh_expires_in: number;
      scope?: string;
    }

    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("client_id", KEYCLOAK_CLIENT_ID);
    params.append("username", KEYCLOAK_USERNAME);
    params.append("password", KEYCLOAK_PASSWORD);

    const response: AxiosResponse<KeycloakTokenResponse> = await axios.post(
      TOKEN_ENDPOINT,
      params,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("access_token");
    expect(response.data).toHaveProperty("refresh_token");
    expect(response.data).toHaveProperty("token_type", "Bearer");
  });
});

async function waitForKeycloak(retries = 20, delayMs = 3000): Promise<void> {
  const discoveryUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await axios.get(discoveryUrl, {
        timeout: 2000,
        validateStatus: (status) => status >= 200 && status < 500,
      });

      if (response.status === 200) {
        return;
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.code !== "ECONNREFUSED" && axiosError.code !== "ECONNRESET") {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `Keycloak did not become ready at ${discoveryUrl}. ` +
      `Ensure the container is running via "yarn compose:up" before executing tests.`
  );
}
