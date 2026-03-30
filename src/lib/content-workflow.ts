import { Role, ContentStatus } from "@prisma/client";

export type SubmitAction = "sendToReview" | "publishDirectly";

export function getSubmitTargetStatus(
  role: Role,
  action: SubmitAction
): ContentStatus {
  if (action === "publishDirectly") {
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      return "PUBLISHED";
    }
    throw new Error(`Il ruolo ${role} non può pubblicare direttamente`);
  }

  switch (role) {
    case "HOD":
      return "REVIEW_HM";
    case "HOTEL_MANAGER":
      return "REVIEW_ADMIN";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "REVIEW_HM";
    default:
      throw new Error(`Il ruolo ${role} non può inviare contenuti`);
  }
}

export function getAvailableSubmitActions(role: Role): {
  canSendToReview: boolean;
  canPublishDirectly: boolean;
  reviewLabel: string;
} {
  switch (role) {
    case "HOD":
      return { canSendToReview: true, canPublishDirectly: false, reviewLabel: "Invia a Hotel Manager" };
    case "HOTEL_MANAGER":
      return { canSendToReview: true, canPublishDirectly: false, reviewLabel: "Invia per approvazione finale" };
    case "ADMIN":
    case "SUPER_ADMIN":
      return { canSendToReview: true, canPublishDirectly: true, reviewLabel: "Invia a Hotel Manager" };
    default:
      return { canSendToReview: false, canPublishDirectly: false, reviewLabel: "" };
  }
}
