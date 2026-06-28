import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Revenue } from "@/models/Revenue";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteKiotVietCustomer } from "@/lib/sync-service";
import { emitRevenueUpdate } from "@/lib/socket-server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

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
    
    if (id.startsWith("virtual_")) {
      const parts = id.replace("virtual_", "").split("_");
      const code = parts[0];
      const dateKey = parts[1] || dayjs().tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD");

      const { Customer } = await import("@/models/Customer");
      const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const dbCustomer = await Customer.findOne({
        code: { $regex: `^${escapedCode}$`, $options: "i" }
      });
      if (!dbCustomer) {
        return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
      }

      if (isLocalDelete) {
        const startOfDay = dayjs.tz(dateKey, "Asia/Ho_Chi_Minh").startOf("day").toDate();
        await Revenue.create({
          code: dbCustomer.code,
          licensePlate: dbCustomer.name || "Chưa xác định",
          vehicleNumber: dbCustomer.name || "Chưa xác định",
          groups: dbCustomer.groups || "Khách lẻ.",
          arrivalDate: startOfDay,
          customerModifiedDate: startOfDay,
          revenue: 0,
          profit: 0,
          status: 0,
          paymentMethod: 0,
          customerId: dbCustomer.customerId,
          isHidden: true
        });
        emitRevenueUpdate();
        return NextResponse.json({ message: "Đã ẩn khách hàng thành công" });
      }

      // Xóa vĩnh viễn (Chỉ dành cho Admin/Root/Manager)
      if (!isFullAccess) {
        return NextResponse.json({ error: "Chỉ Admin mới có quyền xóa vĩnh viễn trên KiotViet" }, { status: 403 });
      }

      if (dbCustomer.customerId) {
        try {
          console.log(`[API] Đang xóa khách hàng ${dbCustomer.customerId} trên KiotViet...`);
          await deleteKiotVietCustomer(dbCustomer.customerId);
        } catch (kvError: any) {
          console.error("[API] Lỗi khi xóa trên KiotViet:", kvError);
          return NextResponse.json({ 
              error: "KiotViet từ chối xóa khách hàng này. Có thể khách hàng đã có lịch sử hóa đơn.",
              details: kvError.message 
          }, { status: 400 });
        }
      }

      await Customer.findByIdAndUpdate(dbCustomer._id, { isDeleted: true });
      emitRevenueUpdate();
      return NextResponse.json({ message: "Xóa thành công" });
    }

    const transaction = await Revenue.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
    }

    if (isLocalDelete) {
      // CHỈ ẨN CỤC BỘ (Yêu cầu người dùng)
      await Revenue.findByIdAndUpdate(id, { isHidden: true });
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
    await Revenue.findByIdAndUpdate(id, { isCustomerDeleted: true });

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
    let updatedTx;
    if (id.startsWith("virtual_")) {
      const parts = id.replace("virtual_", "").split("_");
      const code = parts[0];
      const dateKey = parts[1];
      const invoiceCode = parts[2] || undefined;
      
      const { Customer } = await import("@/models/Customer");
      const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const dbCustomer = await Customer.findOne({
        code: { $regex: `^${escapedCode}$`, $options: "i" }
      });
      
      const startOfDay = dayjs.tz(dateKey, "Asia/Ho_Chi_Minh").startOf("day").toDate();
      const endOfDay = dayjs.tz(dateKey, "Asia/Ho_Chi_Minh").endOf("day").toDate();
      
      // Kiểm tra xem đã có bản ghi nào cho đoàn này trong ngày chưa để cập nhật thay vì tạo trùng lặp
      const existing = await Revenue.findOne({
        code: code,
        arrivalDate: { $gte: startOfDay, $lte: endOfDay },
        ...(invoiceCode ? { invoiceCode } : {})
      });

      if (existing) {
        updatedTx = await Revenue.findByIdAndUpdate(existing._id, body, { new: true });
      } else {
        const { Invoice } = await import("@/models/Invoice");
        const invoices = await Invoice.find({
          customerCode: code,
          createdDate: { $gte: startOfDay, $lte: endOfDay },
          status: 1
        });
        const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
        const invoicePlate = invoices.length > 0 ? (invoices[0].customerName || dbCustomer?.licensePlate) : dbCustomer?.licensePlate;
        
        updatedTx = await Revenue.create({
          code: code,
          invoiceCode: invoiceCode,
          arrivalDate: startOfDay,
          customerModifiedDate: startOfDay,
          licensePlate: body.licensePlate || invoicePlate || "Chưa xác định",
          vehicleNumber: body.licensePlate || invoicePlate || "Chưa xác định",
          groups: body.groups || dbCustomer?.groups || "Khách lẻ.",
          revenue: totalRevenue,
          profit: 0,
          status: body.status || 0,
          paymentMethod: body.paymentMethod || 0,
          customerId: dbCustomer?.customerId,
          ...body
        });
      }
    } else {
      updatedTx = await Revenue.findByIdAndUpdate(id, body, { new: true });
    }
    
    // Đồng bộ về bảng Customers nếu có thay đổi biển số hoặc nhóm xe
    if (updatedTx && updatedTx.code && (body.licensePlate !== undefined || body.groups !== undefined)) {
      const { Customer } = await import("@/models/Customer");
      const escapedCode = updatedTx.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      
      const lastCust = await Customer.findOne(
        { code: { $regex: `^${escapedCode}$`, $options: "i" } }
      ).sort({ createdAt: -1 });

      await Customer.create({
        customerId: lastCust?.customerId || 0,
        code: updatedTx.code,
        name: lastCust?.name || updatedTx.customerName || updatedTx.code,
        licensePlate: body.licensePlate !== undefined ? body.licensePlate : lastCust?.licensePlate,
        groups: body.groups !== undefined ? body.groups : lastCust?.groups,
        creatorName: lastCust?.creatorName || "Hệ thống (Web UI)",
        isDeleted: false,
      });
    }
    
    const socketId = request.headers.get("x-socket-id") || undefined;
    emitRevenueUpdate(socketId);
    return NextResponse.json({ message: "Cập nhật thành công" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
