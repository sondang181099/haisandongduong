import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { SystemSetting } from "@/models/SystemSetting";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const SETTING_KEY = "presentation_auto_update";

export async function GET() {
  try {
    // Presentation screen might not be authenticated, but let's check session if possible
    // Actually, presentation screen is usually a public or semi-public view
    // For now, let's allow GET without strict auth if needed, or check if it's the admin
    
    await connectDB();
    const setting = await SystemSetting.findOne({ key: SETTING_KEY });
    const layoutSetting = await SystemSetting.findOne({ key: "presentation_layout" });
    
    return NextResponse.json({ 
      autoUpdate: setting ? !!setting.value : true,
      layout: layoutSetting ? layoutSetting.value : "new"
    });
  } catch (error) {
    console.error("GET /api/settings/presentation error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { autoUpdate, layout } = await request.json();

    await connectDB();
    
    if (autoUpdate !== undefined) {
      await SystemSetting.findOneAndUpdate(
        { key: SETTING_KEY },
        { 
          value: !!autoUpdate,
          description: "Cấu hình tự động cập nhật cho màn hình trình chiếu" 
        },
        { upsert: true }
      );
    }

    if (layout !== undefined) {
      await SystemSetting.findOneAndUpdate(
        { key: "presentation_layout" },
        { 
          value: layout,
          description: "Giao diện trình chiếu: 'old' (cũ) hoặc 'new' (mới)" 
        },
        { upsert: true }
      );
    }

    // Phát tín hiệu cập nhật qua WebSocket cho màn hình trình chiếu
    if (global.io) {
      global.io.emit("revenue-updated");
    }

    return NextResponse.json({ 
      autoUpdate: autoUpdate !== undefined ? !!autoUpdate : undefined,
      layout: layout !== undefined ? layout : undefined
    });
  } catch (error) {
    console.error("POST /api/settings/presentation error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
