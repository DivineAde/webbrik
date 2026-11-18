import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { mergeMap } from "rxjs";
import { PERSISTENCE, type Persistence } from "./persistence";

/** With several API instances, a successful write request answers only after the database holds the change, so the next request (on any instance) sees it. */
@Injectable()
export class WriteThroughInterceptor implements NestInterceptor {
  constructor(@Inject(PERSISTENCE) private persistence: Persistence) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const method = ctx.switchToHttp().getRequest<{ method: string }>().method;
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return next.handle();
    return next.handle().pipe(mergeMap(async (value) => { await this.persistence.flush(); return value; }));
  }
}
