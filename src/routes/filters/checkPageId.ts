// src/router/filters/checkPageId.ts
import { Context } from "./types";

export default () => (ctx: Context) => {
  // ctx.to.params.page sekarang valid
  const p = Number(ctx.to.params.page);
  if (isNaN(p) || p < 1 || p > 604) {
    // redirect ke 404 (catchAll akan menangani)
    return ctx.next("/error");
  }
  return ctx.next();
};
