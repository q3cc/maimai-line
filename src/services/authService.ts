import { randomUUID } from "node:crypto";
import {
  badRequest,
  conflict,
  notFound,
  unauthorized
} from "../domain/errors";
import type { PublicUser, User } from "../domain/types";
import type { JsonDataStore } from "../store/jsonDataStore";
import { hashPassword, verifyPassword } from "../utils/passwords";
import { issueToken, verifyToken } from "../utils/tokens";

export interface RegisterInput {
  email?: string;
  username?: string;
  password?: string;
  nickname?: string;
}

export interface LoginInput {
  email?: string;
  username?: string;
  identifier?: string;
  login?: string;
  password?: string;
}

export interface AuthResult {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: string;
  user: PublicUser;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[\p{L}\p{N}_-]{3,32}$/u;
const MIN_PASSWORD_LENGTH = 6;

export class AuthService {
  constructor(
    private readonly store: JsonDataStore,
    private readonly tokenSecret = process.env.AUTH_TOKEN_SECRET ??
      "maimai-line-demo-dev-secret"
  ) {}

  register(input: RegisterInput): AuthResult {
    const email = normalizeEmail(input.email);
    const username = normalizeUsername(input.username);
    const password = input.password ?? "";
    const nickname = (input.nickname?.trim() || username).slice(0, 32);

    assertEmail(email);
    assertUsername(username);
    assertPassword(password);

    const user = this.store.update((data) => {
      if (data.users.some((item) => item.email.toLowerCase() === email)) {
        throw conflict("Email is already registered", "email_exists");
      }

      if (
        data.users.some(
          (item) => item.username.toLowerCase() === username.toLowerCase()
        )
      ) {
        throw conflict("Username is already registered", "username_exists");
      }

      const now = new Date().toISOString();
      const passwordHash = hashPassword(password);
      const createdUser: User = {
        id: `user_${randomUUID()}`,
        email,
        username,
        nickname,
        role: data.users.length === 0 ? "super_admin" : "user",
        passwordSalt: passwordHash.salt,
        passwordHash: passwordHash.hash,
        createdAt: now,
        updatedAt: now
      };

      data.users.push(createdUser);
      return createdUser;
    });

    return this.createAuthResult(this.toPublicUser(user));
  }

  login(input: LoginInput): AuthResult {
    const identifier = normalizeIdentifier(input);
    const password = input.password ?? "";

    if (!identifier) {
      throw badRequest("Email or username is required", "missing_identifier");
    }

    if (!password) {
      throw badRequest("Password is required", "missing_password");
    }

    const data = this.store.read();
    const user = data.users.find((item) =>
      identifier.includes("@")
        ? item.email.toLowerCase() === identifier.toLowerCase()
        : item.username.toLowerCase() === identifier.toLowerCase()
    );

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      throw unauthorized("Invalid email/username or password");
    }

    return this.createAuthResult(this.toPublicUser(user));
  }

  getPublicUserById(userId: string): PublicUser {
    const user = this.store.read().users.find((item) => item.id === userId);
    if (!user) {
      throw notFound("User not found");
    }
    return this.toPublicUser(user);
  }

  getUserFromToken(token: string): PublicUser {
    const payload = verifyToken(token, this.tokenSecret);
    if (!payload) {
      throw unauthorized("Invalid or expired token");
    }
    return this.getPublicUserById(payload.sub);
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  private createAuthResult(user: PublicUser): AuthResult {
    const issued = issueToken(user, this.tokenSecret);
    return {
      token: issued.token,
      tokenType: "Bearer",
      expiresIn: issued.expiresIn,
      expiresAt: issued.expiresAt,
      user
    };
  }
}

function normalizeEmail(email?: string): string {
  return (email ?? "").trim().toLowerCase();
}

function normalizeUsername(username?: string): string {
  return (username ?? "").trim();
}

function normalizeIdentifier(input: LoginInput): string {
  return (
    input.identifier ??
    input.login ??
    input.email ??
    input.username ??
    ""
  ).trim();
}

function assertEmail(email: string): void {
  if (!EMAIL_RE.test(email)) {
    throw badRequest("A valid email is required", "invalid_email");
  }
}

function assertUsername(username: string): void {
  if (!USERNAME_RE.test(username)) {
    throw badRequest(
      "Username must be 3-32 letters, numbers, underscores, or hyphens",
      "invalid_username"
    );
  }
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      "weak_password"
    );
  }
}
