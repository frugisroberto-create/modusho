import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAvailableSubmitActions } from "@/lib/content-workflow";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const actions = getAvailableSubmitActions(session.user.role);
  return NextResponse.json({ data: actions });
}
