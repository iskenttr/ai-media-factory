import type { Message } from "node-telegram-bot-api";

export interface MiddlewareContext {
  msg: Message;
  args: string[];
  command: string;
}

export type Middleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

export function composeMiddleware(middlewares: Middleware[]): Middleware {
  return async (ctx, next) => {
    let index = 0;

    const dispatch = async (): Promise<void> => {
      if (index >= middlewares.length) {
        await next();
        return;
      }

      const middleware = middlewares[index++];
      await middleware(ctx, dispatch);
    };

    await dispatch();
  };
}

export function commandMiddleware(
  command: string,
  handler: (ctx: MiddlewareContext) => Promise<void>
): Middleware {
  return async (ctx, next) => {
    if (ctx.command === command) {
      await handler(ctx);
    } else {
      await next();
    }
  };
}

export function timingMiddleware(): Middleware {
  return async (_ctx, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`Command execution took ${duration}ms`);
  };
}
