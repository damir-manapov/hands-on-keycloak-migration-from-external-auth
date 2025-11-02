export interface LegacyUserSeed {
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  password: string;
}

export const LEGACY_USER_SEEDS: Record<string, LegacyUserSeed> = {
  "test-user": {
    username: "test-user",
    displayName: "Test User",
    email: "test.user@example.com",
    roles: ["researcher"],
    password: "password",
  },
  "api-reader": {
    username: "api-reader",
    displayName: "Reader Bot",
    email: "reader.bot@example.com",
    roles: ["reader"],
    password: "reader",
  },
  "analyst-mila": {
    username: "analyst-mila",
    displayName: "Mila Analyst",
    email: "mila.analyst@example.com",
    roles: ["analyst", "reporter"],
    password: "m1l@2024",
  },
  "ops-noah": {
    username: "ops-noah",
    displayName: "Noah Ops",
    email: "noah.ops@example.com",
    roles: ["ops", "researcher"],
    password: "0p5!check",
  },
  "legacy-admin": {
    username: "legacy-admin",
    displayName: "Legacy Admin",
    email: "legacy.admin@example.com",
    roles: ["admin"],
    password: "admin123",
  },
};
