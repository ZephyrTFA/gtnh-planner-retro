import { APP_VERSION } from "@/lib/version";

/**
 * The version this build serves, written as a static file. A tab left open
 * across a deploy reads it to offer a reload (use-deployed-version.ts).
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({ version: APP_VERSION });
}
