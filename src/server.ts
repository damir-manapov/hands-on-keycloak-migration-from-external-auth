import express, { Request, Response } from "express";
import crypto from "crypto";
import type { Server } from "http";

export interface AuthRequestBody {
  username?: string;
  password?: string;
}

export interface AuthSuccessResponse {
  status: "success";
  token: string;
  username: string;
}

export interface AuthErrorResponse {
  status: "error";
  message: string;
}

interface UserRecord {
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  password: string;
}

export interface PublicUserProfile {
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  lastLoginAt?: string;
}

const USERS: Record<string, UserRecord & { lastLoginAt?: Date }> = {
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

function toPublicProfile(record: UserRecord & { lastLoginAt?: Date }): PublicUserProfile {
  const { password, lastLoginAt, ...profile } = record;
  void password;
  return { ...profile, lastLoginAt: lastLoginAt?.toISOString() };
}

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/login", (req: Request, res: Response<AuthSuccessResponse | AuthErrorResponse>) => {
    const { username, password } = req.body as AuthRequestBody;

    if (!username || !password) {
      return res
        .status(400)
        .json({ status: "error", message: "username and password are required" });
    }

    const user = USERS[username];
    if (!user || user.password !== password) {
      return res.status(401).json({ status: "error", message: "invalid credentials" });
    }

    USERS[username].lastLoginAt = new Date();

    const token = crypto.randomBytes(24).toString("hex");
    return res.json({ status: "success", token, username });
  });

  app.get("/users", (_req: Request, res: Response<PublicUserProfile[]>) => {
    const payload = Object.values(USERS).map<PublicUserProfile>((record) =>
      toPublicProfile(record)
    );
    res.json(payload);
  });

  app.get(
    "/users/:username",
    (req: Request, res: Response<PublicUserProfile | AuthErrorResponse>) => {
      const { username } = req.params;
      const record = USERS[username];

      if (!record) {
        return res.status(404).json({ status: "error", message: "user not found" });
      }

      res.json(toPublicProfile(record));
    }
  );

  return app;
}

export function startServer(port: number): Server {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`Auth server listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  startServer(port);
}
