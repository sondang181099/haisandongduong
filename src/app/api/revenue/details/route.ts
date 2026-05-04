import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInvoicesByCustomerCode } from "@/lib/sync-service";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing customer code" }, { status: 400 });
    }

    const invoices = await getInvoicesByCustomerCode(code);

    return NextResponse.json({
      success: true,
      invoices: invoices
    });

  } catch (error: any) {
    console.error("GET /api/revenue/details error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
