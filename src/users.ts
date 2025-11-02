import type { LegacyUserSeed } from "./data/legacyUsers";
import { LEGACY_USER_SEEDS } from "./data/legacyUsers";

export type StoredUser = LegacyUserSeed & { lastLoginAt?: Date };

export interface PublicUserProfile {
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  lastLoginAt?: string;
}

const USERS: Record<string, StoredUser> = Object.fromEntries(
  Object.entries(LEGACY_USER_SEEDS).map(([username, seed]) => [username, { ...seed }])
);

function toPublicProfile(record: StoredUser): PublicUserProfile {
  return {
    username: record.username,
    displayName: record.displayName,
    email: record.email,
    roles: [...record.roles],
    lastLoginAt: record.lastLoginAt?.toISOString(),
  };
}

export function validateCredentials(username: string, password: string): boolean {
  const user = USERS[username];
  return Boolean(user && user.password === password);
}

export function markUserLogin(username: string): void {
  const user = USERS[username];
  if (user) {
    user.lastLoginAt = new Date();
  }
}

export function listPublicUsers(): PublicUserProfile[] {
  return Object.values(USERS).map((record) => toPublicProfile(record));
}

export function getPublicUser(username: string): PublicUserProfile | undefined {
  const record = USERS[username];
  return record ? toPublicProfile(record) : undefined;
}

export function getUsernames(): string[] {
  return Object.keys(USERS);
}

export function getStoredUser(username: string): StoredUser | undefined {
  return USERS[username];
}
