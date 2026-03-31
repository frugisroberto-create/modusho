import { Role } from "@prisma/client";

export type { Role, ContentType, ContentStatus, ReviewAction, StaticDocumentType, AttachmentKind, SopStatus, SopEventType } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      canView: boolean;
      canEdit: boolean;
      canApprove: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
    canView: boolean;
    canEdit: boolean;
    canApprove: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    role: Role;
    canView: boolean;
    canEdit: boolean;
    canApprove: boolean;
  }
}
