import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

/** Append an entry to a container's lifecycle event log (fire-and-forget safe). */
export async function logContainerEvent(opts: {
  containerId: string;
  type: string;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.containerEvent.create({
      data: {
        containerId: opts.containerId,
        type: opts.type,
        message: opts.message,
        metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error(`[events] failed to log ${opts.type} for ${opts.containerId}:`, err);
  }
}
