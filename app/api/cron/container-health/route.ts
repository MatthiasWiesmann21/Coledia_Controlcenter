import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkContainerHealth } from "@/lib/provisioning";
import { CONTAINER_STATUS } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * Cron endpoint — the container health "listener".
 *
 * Iterates containers waiting for provisioning (`pending_provisioning`, plus
 * ones stuck in `seeding`), verifies their tenant state in the app DB and
 * probes the public URL. When a container is confirmed live it is marked
 * `active` and the customer notifications go out — see checkContainerHealth().
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Schedule it externally, e.g.
 * a Dokploy scheduled task or cron-job.org hitting this URL every ~5 min:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<controlcenter-domain>/api/cron/container-health
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(token).digest();
  if (token.length === 0 || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const containers = await prisma.container.findMany({
    where: {
      status: {
        in: [CONTAINER_STATUS.SEEDING, CONTAINER_STATUS.PENDING_PROVISIONING],
      },
    },
    select: { id: true, subdomain: true },
  });

  const results = [];
  for (const c of containers) {
    try {
      const report = await checkContainerHealth(c.id);
      results.push({
        containerId: c.id,
        subdomain: c.subdomain,
        reachable: report.reachable,
        appVerified: report.appVerified,
        tenantFound: report.tenantFound,
        issues: report.issues,
        statusChanged: report.statusChanged ?? null,
      });
    } catch (err) {
      results.push({ containerId: c.id, error: String(err) });
    }
  }

  return NextResponse.json({ checked: results.length, results });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
