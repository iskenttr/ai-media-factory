import { describe, it, expect } from "vitest";
import { composeMiddleware, commandMiddleware, timingMiddleware } from "./index";
import type { Middleware, MiddlewareContext } from "./index";

describe("middleware", () => {
  const createMockCtx = (command: string = "/test"): MiddlewareContext => ({
    msg: {
      message_id: 1,
      date: Date.now(),
      chat: { id: 1, type: "private" },
      from: { id: 1, is_bot: false, first_name: "Test" },
    },
    command,
    args: [],
  });

  describe("composeMiddleware", () => {
    it("executes middlewares in order", async () => {
      const order: string[] = [];

      const middleware1: Middleware = async (_ctx, next) => {
        order.push("1");
        await next();
        order.push("1-end");
      };

      const middleware2: Middleware = async (_ctx, next) => {
        order.push("2");
        await next();
        order.push("2-end");
      };

      const finalHandler = async () => {
        order.push("final");
      };

      const composed = composeMiddleware([middleware1, middleware2]);
      await composed(createMockCtx(), finalHandler);

      expect(order).toEqual(["1", "2", "final", "2-end", "1-end"]);
    });

    it("handles empty middleware array", async () => {
      let called = false;
      const composed = composeMiddleware([]);
      await composed(createMockCtx(), async () => {
        called = true;
      });

      expect(called).toBe(true);
    });

    it("short-circuits when middleware doesn't call next", async () => {
      let finalCalled = false;

      const blockingMiddleware: Middleware = async () => {
        // Does not call next
      };

      const composed = composeMiddleware([blockingMiddleware]);
      await composed(createMockCtx(), async () => {
        finalCalled = true;
      });

      expect(finalCalled).toBe(false);
    });
  });

  describe("commandMiddleware", () => {
    it("executes handler for matching command", async () => {
      let handlerCalled = false;

      const middleware = commandMiddleware("status", async (ctx) => {
        expect(ctx.command).toBe("status");
        handlerCalled = true;
      });

      await middleware(createMockCtx("status"), async () => {});

      expect(handlerCalled).toBe(true);
    });

    it("calls next for non-matching command", async () => {
      let nextCalled = false;

      const middleware = commandMiddleware("status", async () => {});

      await middleware(createMockCtx("help"), async () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });

  describe("timingMiddleware", () => {
    it("measures execution time", async () => {
      const middleware = timingMiddleware();
      let nextCalled = false;

      await middleware(createMockCtx(), async () => {
        nextCalled = true;
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(nextCalled).toBe(true);
    });
  });
});
