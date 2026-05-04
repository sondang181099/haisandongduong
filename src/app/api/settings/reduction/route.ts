import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SystemSetting } from "@/models/SystemSetting";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DEFAULT_REDUCTION_RULES } from "@/lib/reduction";

const REDUCTION_SETTING_KEY = "revenue_reduction_rules";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const setting = await SystemSetting.findOne({ key: REDUCTION_SETTING_KEY });
    
    // Return the value directly (could be an array or the new object structure)
    return NextResponse.json(setting?.value || DEFAULT_REDUCTION_RULES);
  } catch (error) {
    console.error("GET /api/settings/reduction error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any).role;
    if (userRole !== "admin" && userRole !== "root") {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const config = await request.json();

    if (!Array.isArray(config) && typeof config !== "object") {
      return NextResponse.json({ error: "Invalid configuration format" }, { status: 400 });
    }

    await connectDB();
    
    const setting = await SystemSetting.findOneAndUpdate(
      { key: REDUCTION_SETTING_KEY },
      { 
        value: config,
        description: "Cấu hình các mốc giảm trừ doanh thu hiển thị" 
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(setting.value);
  } catch (error) {
    console.error("POST /api/settings/reduction error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
