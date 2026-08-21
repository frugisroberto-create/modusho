-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERATOR', 'HOD', 'HOTEL_MANAGER', 'CORPORATE', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('SOP', 'DOCUMENT', 'MEMO', 'BRAND_BOOK', 'STANDARD_BOOK');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'REVIEW_HM', 'REVIEW_ADMIN', 'PUBLISHED', 'RETURNED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('APPROVED', 'RETURNED', 'FORWARDED');

-- CreateEnum
CREATE TYPE "StaticDocumentType" AS ENUM ('BRAND_BOOK', 'STANDARD_BOOK', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('ROLE', 'DEPARTMENT', 'USER');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "SopStatus" AS ENUM ('IN_LAVORAZIONE', 'PUBBLICATA', 'ARCHIVIATA');

-- CreateEnum
CREATE TYPE "SopEventType" AS ENUM ('DRAFT_CREATED', 'TEXT_SAVED', 'NOTE_ADDED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'ATTACHMENT_REPLACED', 'SUBMITTED_TO_C', 'SUBMITTED_TO_A', 'SUBMITTED_TO_C_AND_A', 'C_CONSULTATION_CONFIRMED', 'RETURNED_BY_A', 'APPROVED', 'PUBLISHED', 'REVIEW_DUE_DATE_CHANGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONTENT_PUBLISHED', 'TEXT_SAVED', 'NOTE_ADDED', 'SUBMITTED', 'ACK_REMINDER', 'ONBOARDING_ASSIGNED');

-- CreateEnum
CREATE TYPE "OnboardingSectionType" AS ENUM ('WELCOME', 'RULES', 'JOB_DESCRIPTION', 'DOCUMENT', 'SOP');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('ACTIVATION', 'RESET');

-- CreateEnum
CREATE TYPE "UserAuditAction" AS ENUM ('CREATED', 'ROLE_CHANGED', 'FLAG_CHANGED', 'EMAIL_CHANGED', 'DEACTIVATED', 'REACTIVATED', 'INVITE_SENT', 'RESET_SENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "targetDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "canCreateUsers" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContentPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,

    CONSTRAINT "UserContentPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tagline" TEXT,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "departmentId" TEXT,

    CONSTRAINT "PropertyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "propertyId" TEXT NOT NULL,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "submittedById" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredAt" TIMESTAMP(3),
    "featuredById" TEXT,
    "standardSource" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAcknowledgment" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContentAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReview" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentStatusHistory" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "fromStatus" "ContentStatus",
    "toStatus" "ContentStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ContentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRevision" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisedById" TEXT NOT NULL,
    "previousTitle" TEXT NOT NULL,
    "previousBody" TEXT NOT NULL,
    "newTitle" TEXT NOT NULL,
    "newBody" TEXT NOT NULL,
    "note" TEXT,
    "status" "ContentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentNote" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTarget" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetRole" "Role",
    "targetDepartmentId" TEXT,
    "targetUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaticDocument" (
    "id" TEXT NOT NULL,
    "type" "StaticDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "propertyId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaticDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopWorkflow" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "sopStatus" "SopStatus" NOT NULL DEFAULT 'IN_LAVORAZIONE',
    "responsibleId" TEXT NOT NULL,
    "consultedId" TEXT,
    "accountableId" TEXT NOT NULL,
    "submittedToC" BOOLEAN NOT NULL DEFAULT false,
    "submittedToCAt" TIMESTAMP(3),
    "submittedToCById" TEXT,
    "submittedToA" BOOLEAN NOT NULL DEFAULT false,
    "submittedToAAt" TIMESTAMP(3),
    "submittedToAById" TEXT,
    "consultedConfirmedAt" TIMESTAMP(3),
    "consultedConfirmedById" TEXT,
    "consultedConfirmedVersion" INTEGER,
    "consultedConfirmedNote" TEXT,
    "reviewDueDate" TIMESTAMP(3),
    "reviewDueDateSetById" TEXT,
    "reviewDueMonths" INTEGER NOT NULL DEFAULT 12,
    "lastSavedAt" TIMESTAMP(3),
    "lastSavedById" TEXT,
    "textVersionCount" INTEGER NOT NULL DEFAULT 0,
    "requiresNewAcknowledgment" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SopWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopTextVersion" (
    "id" TEXT NOT NULL,
    "sopWorkflowId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "savedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SopTextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopWorkflowEvent" (
    "id" TEXT NOT NULL,
    "sopWorkflowId" TEXT NOT NULL,
    "eventType" "SopEventType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SopWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopViewRecord" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "SopViewRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "UserAuditAction" NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "OnboardingSectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "fileUrl" TEXT,
    "contentId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "requiresAck" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingAssignedSection" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "type" "OnboardingSectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "fileUrl" TEXT,
    "contentId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "requiresAck" BOOLEAN NOT NULL DEFAULT true,
    "viewedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingAssignedSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserContentPermission_userId_idx" ON "UserContentPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserContentPermission_userId_contentType_key" ON "UserContentPermission"("userId", "contentType");

-- CreateIndex
CREATE UNIQUE INDEX "Property_code_key" ON "Property"("code");

-- CreateIndex
CREATE INDEX "Property_code_idx" ON "Property"("code");

-- CreateIndex
CREATE INDEX "Department_propertyId_idx" ON "Department"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_propertyId_code_key" ON "Department"("propertyId", "code");

-- CreateIndex
CREATE INDEX "PropertyAssignment_userId_idx" ON "PropertyAssignment"("userId");

-- CreateIndex
CREATE INDEX "PropertyAssignment_propertyId_idx" ON "PropertyAssignment"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyAssignment_departmentId_idx" ON "PropertyAssignment"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAssignment_userId_propertyId_departmentId_key" ON "PropertyAssignment"("userId", "propertyId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Content_code_key" ON "Content"("code");

-- CreateIndex
CREATE INDEX "Content_propertyId_idx" ON "Content"("propertyId");

-- CreateIndex
CREATE INDEX "Content_departmentId_idx" ON "Content"("departmentId");

-- CreateIndex
CREATE INDEX "Content_status_idx" ON "Content"("status");

-- CreateIndex
CREATE INDEX "Content_type_idx" ON "Content"("type");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");

-- CreateIndex
CREATE INDEX "Content_publishedAt_idx" ON "Content"("publishedAt");

-- CreateIndex
CREATE INDEX "Content_propertyId_status_idx" ON "Content"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Content_propertyId_departmentId_status_idx" ON "Content"("propertyId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "Content_propertyId_type_status_idx" ON "Content"("propertyId", "type", "status");

-- CreateIndex
CREATE INDEX "ContentAcknowledgment_contentId_idx" ON "ContentAcknowledgment"("contentId");

-- CreateIndex
CREATE INDEX "ContentAcknowledgment_userId_idx" ON "ContentAcknowledgment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAcknowledgment_contentId_userId_key" ON "ContentAcknowledgment"("contentId", "userId");

-- CreateIndex
CREATE INDEX "ContentReview_contentId_idx" ON "ContentReview"("contentId");

-- CreateIndex
CREATE INDEX "ContentReview_reviewerId_idx" ON "ContentReview"("reviewerId");

-- CreateIndex
CREATE INDEX "ContentStatusHistory_contentId_idx" ON "ContentStatusHistory"("contentId");

-- CreateIndex
CREATE INDEX "ContentStatusHistory_changedById_idx" ON "ContentStatusHistory"("changedById");

-- CreateIndex
CREATE INDEX "ContentStatusHistory_changedAt_idx" ON "ContentStatusHistory"("changedAt");

-- CreateIndex
CREATE INDEX "ContentRevision_contentId_createdAt_idx" ON "ContentRevision"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentNote_contentId_createdAt_idx" ON "ContentNote"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentNote_authorId_idx" ON "ContentNote"("authorId");

-- CreateIndex
CREATE INDEX "ContentTarget_contentId_idx" ON "ContentTarget"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_contentId_key" ON "Memo"("contentId");

-- CreateIndex
CREATE INDEX "Memo_propertyId_idx" ON "Memo"("propertyId");

-- CreateIndex
CREATE INDEX "Memo_expiresAt_idx" ON "Memo"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_contentId_idx" ON "Attachment"("contentId");

-- CreateIndex
CREATE INDEX "Attachment_contentType_idx" ON "Attachment"("contentType");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE INDEX "Attachment_createdAt_idx" ON "Attachment"("createdAt");

-- CreateIndex
CREATE INDEX "Attachment_contentId_kind_sortOrder_idx" ON "Attachment"("contentId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "StaticDocument_propertyId_idx" ON "StaticDocument"("propertyId");

-- CreateIndex
CREATE INDEX "StaticDocument_type_idx" ON "StaticDocument"("type");

-- CreateIndex
CREATE UNIQUE INDEX "SopWorkflow_contentId_key" ON "SopWorkflow"("contentId");

-- CreateIndex
CREATE INDEX "SopWorkflow_sopStatus_idx" ON "SopWorkflow"("sopStatus");

-- CreateIndex
CREATE INDEX "SopWorkflow_responsibleId_idx" ON "SopWorkflow"("responsibleId");

-- CreateIndex
CREATE INDEX "SopWorkflow_accountableId_idx" ON "SopWorkflow"("accountableId");

-- CreateIndex
CREATE INDEX "SopWorkflow_reviewDueDate_idx" ON "SopWorkflow"("reviewDueDate");

-- CreateIndex
CREATE INDEX "SopTextVersion_sopWorkflowId_createdAt_idx" ON "SopTextVersion"("sopWorkflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SopTextVersion_sopWorkflowId_versionNumber_key" ON "SopTextVersion"("sopWorkflowId", "versionNumber");

-- CreateIndex
CREATE INDEX "SopWorkflowEvent_sopWorkflowId_createdAt_idx" ON "SopWorkflowEvent"("sopWorkflowId", "createdAt");

-- CreateIndex
CREATE INDEX "SopWorkflowEvent_actorId_idx" ON "SopWorkflowEvent"("actorId");

-- CreateIndex
CREATE INDEX "SopViewRecord_contentId_idx" ON "SopViewRecord"("contentId");

-- CreateIndex
CREATE INDEX "SopViewRecord_userId_idx" ON "SopViewRecord"("userId");

-- CreateIndex
CREATE INDEX "SopViewRecord_contentId_contentVersion_idx" ON "SopViewRecord"("contentId", "contentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "SopViewRecord_contentId_userId_contentVersion_key" ON "SopViewRecord"("contentId", "userId", "contentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_type_createdAt_idx" ON "LoginAttempt"("key", "type", "createdAt");

-- CreateIndex
CREATE INDEX "UserAuditEvent_userId_idx" ON "UserAuditEvent"("userId");

-- CreateIndex
CREATE INDEX "UserAuditEvent_actorId_idx" ON "UserAuditEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- CreateIndex
CREATE INDEX "OnboardingTemplate_propertyId_idx" ON "OnboardingTemplate"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTemplate_propertyId_departmentId_key" ON "OnboardingTemplate"("propertyId", "departmentId");

-- CreateIndex
CREATE INDEX "OnboardingSection_templateId_sortOrder_idx" ON "OnboardingSection"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "OnboardingAssignment_userId_idx" ON "OnboardingAssignment"("userId");

-- CreateIndex
CREATE INDEX "OnboardingAssignment_propertyId_idx" ON "OnboardingAssignment"("propertyId");

-- CreateIndex
CREATE INDEX "OnboardingAssignment_assignedById_idx" ON "OnboardingAssignment"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingAssignment_userId_propertyId_key" ON "OnboardingAssignment"("userId", "propertyId");

-- CreateIndex
CREATE INDEX "OnboardingAssignedSection_assignmentId_sortOrder_idx" ON "OnboardingAssignedSection"("assignmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "OnboardingAssignedSection_contentId_idx" ON "OnboardingAssignedSection"("contentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContentPermission" ADD CONSTRAINT "UserContentPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAssignment" ADD CONSTRAINT "PropertyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAssignment" ADD CONSTRAINT "PropertyAssignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAssignment" ADD CONSTRAINT "PropertyAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_featuredById_fkey" FOREIGN KEY ("featuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAcknowledgment" ADD CONSTRAINT "ContentAcknowledgment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAcknowledgment" ADD CONSTRAINT "ContentAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStatusHistory" ADD CONSTRAINT "ContentStatusHistory_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentStatusHistory" ADD CONSTRAINT "ContentStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_revisedById_fkey" FOREIGN KEY ("revisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNote" ADD CONSTRAINT "ContentNote_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentNote" ADD CONSTRAINT "ContentNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTarget" ADD CONSTRAINT "ContentTarget_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTarget" ADD CONSTRAINT "ContentTarget_targetDepartmentId_fkey" FOREIGN KEY ("targetDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTarget" ADD CONSTRAINT "ContentTarget_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaticDocument" ADD CONSTRAINT "StaticDocument_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopWorkflow" ADD CONSTRAINT "SopWorkflow_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopWorkflow" ADD CONSTRAINT "SopWorkflow_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopWorkflow" ADD CONSTRAINT "SopWorkflow_consultedId_fkey" FOREIGN KEY ("consultedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopWorkflow" ADD CONSTRAINT "SopWorkflow_accountableId_fkey" FOREIGN KEY ("accountableId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopTextVersion" ADD CONSTRAINT "SopTextVersion_sopWorkflowId_fkey" FOREIGN KEY ("sopWorkflowId") REFERENCES "SopWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopTextVersion" ADD CONSTRAINT "SopTextVersion_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopWorkflowEvent" ADD CONSTRAINT "SopWorkflowEvent_sopWorkflowId_fkey" FOREIGN KEY ("sopWorkflowId") REFERENCES "SopWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopWorkflowEvent" ADD CONSTRAINT "SopWorkflowEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopViewRecord" ADD CONSTRAINT "SopViewRecord_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopViewRecord" ADD CONSTRAINT "SopViewRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditEvent" ADD CONSTRAINT "UserAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditEvent" ADD CONSTRAINT "UserAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSection" ADD CONSTRAINT "OnboardingSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSection" ADD CONSTRAINT "OnboardingSection_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAssignment" ADD CONSTRAINT "OnboardingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAssignment" ADD CONSTRAINT "OnboardingAssignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAssignment" ADD CONSTRAINT "OnboardingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAssignedSection" ADD CONSTRAINT "OnboardingAssignedSection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OnboardingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAssignedSection" ADD CONSTRAINT "OnboardingAssignedSection_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

