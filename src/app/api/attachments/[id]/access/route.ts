/**
 * GET /api/attachments/[id]/access
 *
 * Indirizzo firmato, a vita breve, per far arrivare il file all'utente: i byte
 * vanno dal bucket al browser senza passare dal server.
 *
 * Il permesso non è dell'allegato, è del contenuto a cui appartiene, e lo
 * decide `loadAccessibleAttachment` — lo stesso che usa la vista a schermo.
 *
 * PDF e immagini arrivano con disposizione "inline": il browser li mostra
 * invece di scaricarli, e sono quelli che la pagina incornicia nel riquadro di
 * lettura. Word ed Excel restano "attachment", perché il browser non saprebbe
 * che farsene: per leggerli a schermo c'è `/api/attachments/[id]/view`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadAccessibleAttachment } from "@/lib/attachments/access-db";
import { getPresignedDownloadUrl } from "@/lib/attachments/storage";
import { getViewMode } from "@/lib/attachments/viewable";

const PRESIGNED_TTL = 30; // secondi

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id: attachmentId } = await params;
  const access = await loadAccessibleAttachment(attachmentId, {
    id: session.user.id,
    role: session.user.role,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { attachment } = access;
  // `?download=1` forza il salvataggio anche per PDF e immagini: la vista a
  // schermo li mostra già nella pagina, e chi chiede «Scarica» vuole il file,
  // non un'altra scheda aperta.
  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const disposition =
    !forceDownload && getViewMode(attachment.mimeType) === "file" ? "inline" : "attachment";

  try {
    const url = await getPresignedDownloadUrl(
      attachment.storageKey,
      PRESIGNED_TTL,
      disposition,
      attachment.originalFileName
    );

    return NextResponse.json({
      data: {
        url,
        fileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        kind: attachment.kind,
        expiresIn: PRESIGNED_TTL,
      },
    });
  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    return NextResponse.json({ error: "File non disponibile" }, { status: 500 });
  }
}
