import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/http";

@Controller("health")
export class HealthController {
  @Public() @Get() check() {
    return { ok: true, time: new Date().toISOString() };
  }
}
