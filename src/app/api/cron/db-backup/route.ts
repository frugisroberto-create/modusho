import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/db-backup
 *
 * Cron job: esporta tutte le tabelle principali in JSON e salva su R2/S3.
 * Eseguito 3 volte al giorno (06:00, 13:00, 21:00 CET).
 *
 * Il backup è un JSON con tutte le entità critiche.
 * Nomefile: backups/modusho-YYYY-MM-DD-HHmm.json
 *
 * Protetto da CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const start = Date.now();

    // Esporta tutte le tabelle critiche in parallelo
    const [
      users,
      properties,
      departments,
      propertyAssignments,
      userContentPermissions,
      contents,
      contentTargets,
      contentAcknowledgments,
      contentReviews,
      contentStatusHistory,
      contentRevisions,
      contentNotes,
      sopWorkflows,
      sopWorkflowEvents,
      sopTextVersions,
      sopViewRecords,
      memos,
      attachments,
      notifications,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, canView: true, canEdit: true, canApprove: true, isActive: true, createdAt: true, updatedAt: true, lastLoginAt: true } }),
      prisma.property.findMany(),
      prisma.department.findMany(),
      prisma.propertyAssignment.findMany(),
      prisma.userContentPermission.findMany(),
      prisma.content.findMany({ select: { id: true, type: true, code: true, title: true, body: true, status: true, version: true, propertyId: true, departmentId: true, createdById: true, updatedById: true, submittedById: true, publishedAt: true, isDeleted: true, deletedAt: true, deletedById: true, isFeatured: true, createdAt: true, updatedAt: true } }),
      prisma.contentTarget.findMany(),
      prisma.contentAcknowledgment.findMany(),
      prisma.contentReview.findMany(),
      prisma.contentStatusHistory.findMany(),
      prisma.contentRevision.findMany(),
      prisma.contentNote.findMany(),
      prisma.sopWorkflow.findMany(),
      prisma.sopWorkflowEvent.findMany(),
      prisma.sopTextVersion.findMany({ select: { id: true, sopWorkflowId: true, versionNumber: true, title: true, savedById: true, createdAt: true } }),
      prisma.sopViewRecord.findMany(),
      prisma.memo.findMany(),
      prisma.attachment.findMany({ select: { id: true, contentId: true, contentType: true, kind: true, originalFileName: true, storedFileName: true, mimeType: true, fileSize: true, storageKey: true, storageBucket: true, uploadedById: true, sortOrder: true, isInline: true, caption: true, createdAt: true } }),
      prisma.notification.findMany({ select: { id: true, userId: true, type: true, title: true, body: true, url: true, readAt: true, createdAt: true } }),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      tables: {
        users: { count: users.length, data: users },
        properties: { count: properties.length, data: properties },
        departments: { count: departments.length, data: departments },
        propertyAssignments: { count: propertyAssignments.length, data: propertyAssignments },
        userContentPermissions: { count: userContentPermissions.length, data: userContentPermissions },
        contents: { count: contents.length, data: contents },
        contentTargets: { count: contentTargets.length, data: contentTargets },
        contentAcknowledgments: { count: contentAcknowledgments.length, data: contentAcknowledgments },
        contentReviews: { count: contentReviews.length, data: contentReviews },
        contentStatusHistory: { count: contentStatusHistory.length, data: contentStatusHistory },
        contentRevisions: { count: contentRevisions.length, data: contentRevisions },
        contentNotes: { count: contentNotes.length, data: contentNotes },
        sopWorkflows: { count: sopWorkflows.length, data: sopWorkflows },
        sopWorkflowEvents: { count: sopWorkflowEvents.length, data: sopWorkflowEvents },
        sopTextVersions: { count: sopTextVersions.length, data: sopTextVersions },
        sopViewRecords: { count: sopViewRecords.length, data: sopViewRecords },
        memos: { count: memos.length, data: memos },
        attachments: { count: attachments.length, data: attachments },
        notifications: { count: notifications.length, data: notifications },
      },
    };

    const json = JSON.stringify(backup);

    // Upload su R2/S3
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 16); // YYYY-MM-DDTHH-MM
    const key = `backups/modusho-${timestamp}.json`;

    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });

    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: json,
      ContentType: "application/json",
    }));

    const durationMs = Date.now() - start;
    const sizeMb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);

    console.log(`[db-backup] OK: ${key} (${sizeMb} MB, ${durationMs}ms, ${Object.keys(backup.tables).length} tables)`);

    return NextResponse.json({
      success: true,
      key,
      sizeMb,
      durationMs,
      tables: Object.fromEntries(
        Object.entries(backup.tables).map(([k, v]) => [k, v.count])
      ),
    });
  } catch (err) {
    console.error("[db-backup] FAILED:", err);
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}
