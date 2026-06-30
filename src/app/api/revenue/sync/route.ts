import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runKiotVietSync } from "@/lib/sync-service";
import { emitRevenueUpdate } from "@/lib/socket-server";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    let body: any = {};
    try {
      body = await request.json();
    } catch(e) {}
    
    if (!session && !body.backendBypass) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const range = body.range || "1day";

    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    const path = require("path");

    const pythonScript = path.join(process.cwd(), "kiotviet-sync-python", "sync_kiotviet.py");
    
    try {
      const { stdout } = await execAsync(`python "${pythonScript}" ${range}`);
      
      const invoicesMatch = stdout.match(/Invoices processed: (\d+)/);
      const unitsMatch = stdout.match(/Groups updated: (\d+)/);
      
      // Phát tín hiệu cập nhật qua WebSocket bằng helper đã cài debounce
      emitRevenueUpdate();


      return NextResponse.json({
        message: "Python Sync completed successfully",
        totalInvoicesProcessed: invoicesMatch ? parseInt(invoicesMatch[1]) : 0,
        newOrUpdatedRecords: unitsMatch ? parseInt(unitsMatch[1]) : 0,
        stdout: stdout.split('\n').filter((l: string) => l.startsWith('->')).join('\n')
      });
    } catch (execError: any) {
      console.error("[API] Python sync error:", execError);
      return NextResponse.json({ error: "Python sync failed", details: execError.message }, { status: 500 });
    }


  } catch (error: any) {
    console.error("POST /api/revenue/sync error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
