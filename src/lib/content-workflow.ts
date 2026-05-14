import { Role, ContentStatus, ContentType } from "@prisma/client";

export type SubmitAction = "sendToReview" | "publishDirectly";

/**
 * Tipo di contenuto che NON richiede workflow di approvazione
 * (HOD può pubblicare direttamente nel proprio perimetro).
 */
function isNoWorkflowType(contentType?: ContentType): boolean {
  return contentType === "MEMO" || contentType === "DOCUMENT";
}

export function getSubmitTargetStatus(
  role: Role,
  action: SubmitAction,
  contentType?: ContentType
): ContentStatus {
  if (action === "publishDirectly") {
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      return "PUBLISHED";
    }
    // CORPORATE con canApprove può pubblicare direttamente (come ADMIN nel suo perimetro)
    // La verifica canApprove è fatta a livello API, qui accettiamo il ruolo
    if (role === "CORPORATE") {
      return "PUBLISHED";
    }
    // HOTEL_MANAGER può pubblicare direttamente DOCUMENT/MEMO (non SOP)
    if (role === "HOTEL_MANAGER" && isNoWorkflowType(contentType)) {
      return "PUBLISHED";
    }
    // HOD può pubblicare direttamente DOCUMENT/MEMO (limitato al proprio reparto)
    if (role === "HOD" && isNoWorkflowType(contentType)) {
      return "PUBLISHED";
    }
    throw new Error(`Il ruolo ${role} non può pubblicare direttamente ${contentType ?? "questo contenuto"}`);
  }

  switch (role) {
    case "HOD":
      return "REVIEW_HM";
    case "HOTEL_MANAGER":
      return "REVIEW_ADMIN";
    case "CORPORATE":
      return "REVIEW_HM"; // Corporate invia a HM per consultazione
    case "ADMIN":
    case "SUPER_ADMIN":
      return "REVIEW_HM";
    default:
      throw new Error(`Il ruolo ${role} non può inviare contenuti`);
  }
}

export function getAvailableSubmitActions(
  role: Role,
  contentType?: ContentType,
  canPublishFlag?: boolean
): {
  canSendToReview: boolean;
  canPublishDirectly: boolean;
  reviewLabel: string;
} {
  const isNoWorkflow = isNoWorkflowType(contentType);
  const hasPublishRight = canPublishFlag ?? false;
  switch (role) {
    case "HOD":
      return {
        canSendToReview: !isNoWorkflow,
        canPublishDirectly: isNoWorkflow || hasPublishRight,
        reviewLabel: "Invia a Hotel Manager",
      };
    case "HOTEL_MANAGER":
      return {
        canSendToReview: !isNoWorkflow,
        canPublishDirectly: isNoWorkflow || hasPublishRight,
        reviewLabel: "Invia per approvazione finale",
      };
    case "CORPORATE":
      return {
        canSendToReview: true,
        canPublishDirectly: hasPublishRight,
        reviewLabel: "Invia a Hotel Manager",
      };
    case "ADMIN":
    case "SUPER_ADMIN":
      return { canSendToReview: true, canPublishDirectly: true, reviewLabel: "Invia a Hotel Manager" };
    default:
      return { canSendToReview: false, canPublishDirectly: false, reviewLabel: "" };
  }
}
