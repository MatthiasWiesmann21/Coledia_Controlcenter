import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subdomainSchema } from "@/lib/schemas";

/**
 * GET /api/subdomain-check?s=<subdomain>
 * Availability check used by the onboarding wizard (debounced client-side).
 */
export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("s") ?? "";
  const parsed = subdomainSchema.safeParse(s.toLowerCase());
  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      reason: parsed.error.issues[0]?.message ?? "Invalid subdomain",
    });
  }

  const existing = await prisma.container.findUnique({
    where: { subdomain: parsed.data },
    select: { id: true },
  });

  return NextResponse.json({
    available: !existing,
    reason: existing ? "This subdomain is already taken" : undefined,
  });
}
