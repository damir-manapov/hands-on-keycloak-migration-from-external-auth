import express, { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import type { Server } from "http";
import {
  getPublicUser,
  listPublicUsers,
  markUserLogin,
  PublicUserProfile,
  validateCredentials,
} from "./users";

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

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const correlationId = crypto.randomBytes(8).toString("hex");
    console.log(
      `[${new Date(startedAt).toISOString()}] [${correlationId}] ${req.method} ${req.originalUrl}`
    );

    res.once("finish", () => {
      const duration = Date.now() - startedAt;
      console.log(
        `[${new Date().toISOString()}] [${correlationId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
      );
    });

    next();
  });

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

    const isValid = validateCredentials(username, password);
    if (!isValid) {
      return res.status(401).json({ status: "error", message: "invalid credentials" });
    }

    markUserLogin(username);

    const token = crypto.randomBytes(24).toString("hex");
    return res.json({ status: "success", token, username });
  });

  app.get("/users", (_req: Request, res: Response<PublicUserProfile[]>) => {
    res.json(listPublicUsers());
  });

  app.get(
    "/users/:username",
    (req: Request, res: Response<PublicUserProfile | AuthErrorResponse>) => {
      const { username } = req.params;
      const profile = getPublicUser(username);

      if (!profile) {
        return res.status(404).json({ status: "error", message: "user not found" });
      }

      res.json(profile);
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
