import axios, { AxiosError } from "axios";
import type { AxiosResponse } from "axios";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../../src/server";
import type { AuthSuccessResponse, PublicUserProfile } from "../../src/server";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "research";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "research-rest-client";
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

describe("User export APIs", () => {
  it("exports user profiles without passwords for migration", async () => {
    await axios.post<AuthSuccessResponse>(`${baseUrl}/login`, {
      username: "test-user",
      password: "password",
    });

    const response = await axios.get<PublicUserProfile[]>(`${baseUrl}/users`);

    expect(response.status).toBe(200);
    const usernames = response.data.map((user) => user.username);
    expect(usernames).toEqual(
      expect.arrayContaining([
        "test-user",
        "api-reader",
        "analyst-mila",
        "ops-noah",
        "legacy-admin",
      ])
    );

    const testUserProfile = response.data.find((user) => user.username === "test-user");
    expect(testUserProfile).toBeDefined();
    expect(testUserProfile).not.toHaveProperty("password");
    expect(testUserProfile?.lastLoginAt).toBeDefined();
  });

  it("provides individual user snapshots without passwords", async () => {
    const response = await axios.get<PublicUserProfile>(`${baseUrl}/users/legacy-admin`);

    expect(response.status).toBe(200);
    expect(response.data.username).toBe("legacy-admin");
    expect(response.data.roles).toEqual(["admin"]);
    expect(response.data).not.toHaveProperty("password");
  });

  it("returns 404 when exporting an unknown user", async () => {
    await expect(axios.get(`${baseUrl}/users/unknown-person`)).rejects.toMatchObject({
      response: {
        status: 404,
        data: {
          status: "error",
          message: "user not found",
        },
      },
    });
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
