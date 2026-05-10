import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import path from "node:path";
import { isApiError, unauthorized } from "../domain/errors";
import { AuthService } from "../services/authService";
import { QueueService } from "../services/queueService";
import { JsonDataStore, type JsonDataStoreOptions } from "../store/jsonDataStore";

export interface CreateAppOptions extends JsonDataStoreOptions {}

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown> | unknown;

export function createApp(options: CreateAppOptions = {}) {
  const store = new JsonDataStore(options);
  const authService = new AuthService(store);
  const queueService = new QueueService(store);
  const app = express();
  const publicDir = path.resolve(__dirname, "../../public");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(attachAuth(authService));

  const api = express.Router();

  api.get("/health", (_req, res) => {
    res.json({
      ok: true,
      name: "maimai-line-demo",
      seeded: {
        arcade: "test机厅",
        machines: ["demo_1", "demo_2"]
      }
    });
  });

  api.post(
    "/auth/register",
    asyncHandler((req, res) => {
      const result = authService.register(req.body);
      res.status(201).json(result);
    })
  );

  api.post(
    "/auth/login",
    asyncHandler((req, res) => {
      res.json(authService.login(req.body));
    })
  );

  api.get(
    "/auth/me",
    requireAuth,
    asyncHandler((req, res) => {
      res.json({ user: req.currentUser });
    })
  );

  api.post("/auth/logout", requireAuth, (_req, res) => {
    res.json({ ok: true });
  });

  api.get(
    "/arcades",
    asyncHandler((req, res) => {
      res.json(
        queueService.listArcades({
          city: req.query.city?.toString(),
          keyword: req.query.keyword?.toString()
        })
      );
    })
  );

  api.get(
    "/arcades/:arcadeId",
    asyncHandler((req, res) => {
      res.json(queueService.getArcade(param(req, "arcadeId")));
    })
  );

  api.get(
    "/queues/:queueId",
    asyncHandler((req, res) => {
      res.json(queueService.getQueue(param(req, "queueId")));
    })
  );

  api.get(
    "/queues/:queueId/my-state",
    asyncHandler((req, res) => {
      res.json(queueService.getMyState(param(req, "queueId"), req.currentUser));
    })
  );

  api.post(
    "/queues/:queueId/entries",
    requireAuth,
    asyncHandler((req, res) => {
      res
        .status(201)
        .json(queueService.joinQueue(req.currentUser!, param(req, "queueId"), req.body));
    })
  );

  api.post(
    "/queues/:queueId/join",
    requireAuth,
    asyncHandler((req, res) => {
      res
        .status(201)
        .json(queueService.joinQueue(req.currentUser!, param(req, "queueId"), req.body));
    })
  );

  api.delete(
    "/queue-entries/:entryId",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.cancelEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.post(
    "/queue-entries/:entryId/cancel",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.cancelEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.patch(
    "/queue-entries/:entryId",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.updateEntry(req.currentUser!, param(req, "entryId"), req.body));
    })
  );

  api.post(
    "/queue-entries/:entryId/check-in",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.checkIn(req.currentUser!, param(req, "entryId"), req.body));
    })
  );

  api.post(
    "/queues/:queueId/call-next",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(
        queueService.callNext(
          req.currentUser!,
          param(req, "queueId"),
          req.body?.timeoutSeconds
        )
      );
    })
  );

  api.post(
    "/queue-entries/:entryId/start",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.startEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.post(
    "/queue-entries/:entryId/confirm-playing",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.startEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.post(
    "/queue-entries/:entryId/finish",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.finishEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.post(
    "/queue-entries/:entryId/skip",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.skipEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.post(
    "/queue-entries/:entryId/give-up",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.skipEntry(req.currentUser!, param(req, "entryId"), true));
    })
  );

  api.post(
    "/queue-entries/:entryId/restore",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.restoreEntry(req.currentUser!, param(req, "entryId")));
    })
  );

  api.post(
    "/queue-entries/:entryId/rejoin",
    requireAuth,
    asyncHandler((req, res) => {
      res
        .status(201)
        .json(queueService.rejoinEntry(req.currentUser!, param(req, "entryId"), req.body));
    })
  );

  api.get(
    "/quick-entry/resolve/:shortCode",
    asyncHandler((req, res) => {
      res.json(queueService.resolveQuickEntry(param(req, "shortCode")));
    })
  );

  api.post(
    "/admin/quick-links",
    requireAuth,
    asyncHandler((req, res) => {
      res.status(201).json(queueService.createQuickLink(req.currentUser!, req.body));
    })
  );

  api.post(
    "/admin/quick-links/:quickLinkId/qrcode",
    requireAuth,
    asyncHandler((req, res) => {
      res.json(queueService.qrcodePlaceholder(req.currentUser!, param(req, "quickLinkId")));
    })
  );

  app.use("/api/v1", api);

  app.get("/s/:shortCode", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
  app.use(express.static(publicDir));

  app.use((_req, _res, next) => {
    next(new Error("Not found"));
  });

  app.use(errorHandler);

  return app;
}

function attachAuth(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.header("authorization");
    if (!authHeader) {
      next();
      return;
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
      next(unauthorized("Authorization header must be Bearer <token>"));
      return;
    }

    try {
      req.currentUser = authService.getUserFromToken(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.currentUser) {
    next(unauthorized());
    return;
  }
  next();
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function asyncHandler(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (isApiError(error)) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  if (req.path.startsWith("/api/")) {
    const isNotFound =
      error instanceof Error && error.message.toLowerCase().includes("not found");
    res.status(isNotFound ? 404 : 500).json({
      error: {
        code: isNotFound ? "not_found" : "internal_error",
        message: isNotFound ? "Not found" : "Internal server error"
      }
    });
    return;
  }

  res.status(404).send("Not found");
}
