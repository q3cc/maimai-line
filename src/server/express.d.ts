import type { PublicUser } from "../domain/types";

declare global {
  namespace Express {
    interface Request {
      currentUser?: PublicUser;
    }
  }
}

export {};
