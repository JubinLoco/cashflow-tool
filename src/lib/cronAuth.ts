import type { NextRequest } from "next/server";

export function isCronAuthorized(request: NextRequest): boolean {
  return request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}
