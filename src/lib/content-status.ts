import { ContentStatus } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Cambia lo stato di un Content e crea il record ContentStatusHistory.
 * OGNI cambio di stato DEVE passare da questa funzione.
 */
export async function changeContentStatus(params: {
  contentId: string;
  fromStatus: ContentStatus | null;
  toStatus: ContentStatus;
  changedById: string;
  note?: string;
}) {
  const { contentId, fromStatus, toStatus, changedById, note } = params;

  return prisma.$transaction([
    prisma.content.update({
      where: { id: contentId },
      data: {
        status: toStatus,
        updatedById: changedById,
        ...(toStatus === "PUBLISHED" ? { publishedAt: new Date() } : {}),
      },
    }),
    prisma.contentStatusHistory.create({
      data: {
        contentId,
        fromStatus,
        toStatus,
        changedById,
        note,
      },
    }),
  ]);
}
