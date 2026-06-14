import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Transaction } from "@/models/Transaction";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteKiotVietCustomer } from "@/lib/sync-service";
import { emitRevenueUpdate } from "@/lib/socket-server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any)?.role || "Sale";
    
    await connectDB();
    const { Role } = await import("@/models/Role");
    const roleData = await Role.findOne({ key: userRole });
    const canDeleteLocal = roleData ? !!roleData.canDeleteLocal : false;
    const isFullAccess = userRole === "admin" || userRole === "root" || userRole === "manager";

    const { searchParams } = new URL(request.url);
    const isLocalDelete = searchParams.get("local") === "true";

    if (!isFullAccess && !canDeleteLocal) {
      return NextResponse.json({ error: "Bạn không có quyền xóa khách hàng" }, { status: 403 });
    }

    const { id } = await params;
    
    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
    }

    if (isLocalDelete) {
      // CHỈ ẨN CỤC BỘ (Yêu cầu người dùng)
      await Transaction.findByIdAndUpdate(id, { isHidden: true });
      emitRevenueUpdate();
      return NextResponse.json({ message: "Đã ẩn khách hàng thành công" });
    }

    // XÓA VĨNH VIỄN (Chỉ dành cho Admin/Root/Manager)
    if (!isFullAccess) {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền xóa vĩnh viễn trên KiotViet" }, { status: 403 });
    }

    // 1. Nếu có customerId, thực hiện xóa trên KiotViet trước
    if (transaction.customerId) {
        try {
            console.log(`[API] Đang xóa khách hàng ${transaction.customerId} trên KiotViet...`);
            await deleteKiotVietCustomer(transaction.customerId);
        } catch (kvError: any) {
            console.error("[API] Lỗi khi xóa trên KiotViet:", kvError);
            // Nếu KiotViet không cho xóa (thường do đã có hóa đơn), chúng ta báo lỗi và dừng lại
            return NextResponse.json({ 
                error: "KiotViet từ chối xóa khách hàng này. Có thể khách hàng đã có lịch sử hóa đơn.",
                details: kvError.message 
            }, { status: 400 });
        }
    }

    // 2. Cập nhật trạng thái trong App Database (không xóa hẳn bản ghi)
    await Transaction.findByIdAndUpdate(id, { isCustomerDeleted: true });

    // 3. Phát tín hiệu cập nhật qua WebSocket
    emitRevenueUpdate();

    return NextResponse.json({ message: "Xóa thành công" });
  } catch (error: any) {
    console.error("DELETE /api/revenue/[id] error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any)?.role || "Sale";
    const isAdmin = userRole === "admin" || userRole === "root";

    if (body.isFrozen === true && !isAdmin) {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền dừng đồng bộ doanh thu" }, { status: 403 });
    }
    
    await connectDB();
    await Transaction.findByIdAndUpdate(id, body);
    
    const socketId = request.headers.get("x-socket-id") || undefined;
    emitRevenueUpdate(socketId);
    return NextResponse.json({ message: "Cập nhật thành công" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
