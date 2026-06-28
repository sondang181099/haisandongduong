import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Revenue } from "@/models/Revenue";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emitRevenueUpdate } from "@/lib/socket-server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { status, paymentMethod, profit, reducedRevenue } = body;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userRole = (session.user as any)?.role || "Sale";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const username = (session.user as any)?.username || "Hệ thống";

    await connectDB();

    let transaction;
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
      
      const { Invoice } = await import("@/models/Invoice");
      const invoices = await Invoice.find({
        customerCode: code,
        createdDate: { $gte: startOfDay, $lte: endOfDay },
        status: 1
      });
      const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const invoicePlate = invoices.length > 0 ? (invoices[0].customerName || dbCustomer?.licensePlate) : dbCustomer?.licensePlate;
      
      transaction = await Revenue.create({
        code: code,
        invoiceCode: invoiceCode,
        arrivalDate: startOfDay,
        customerModifiedDate: startOfDay,
        licensePlate: invoicePlate || "Chưa xác định",
        vehicleNumber: invoicePlate || "Chưa xác định",
        groups: dbCustomer?.groups || "Khách lẻ.",
        revenue: totalRevenue,
        profit: 0,
        status: 0,
        paymentMethod: 0,
        customerId: dbCustomer?.customerId
      });
    } else {
      transaction = await Revenue.findById(id);
    }

    if (!transaction) {
      return NextResponse.json({ error: "Giao dịch không tồn tại" }, { status: 404 });
    }

    // 1. Cập nhật Status & Metadata liên quan
    const displayName = session.user?.name || (session.user as any)?.username || "Hệ thống";

    if (status !== undefined) {
      if (userRole !== "admin") {
        // Sale: Chỉ được quyền đổi status = 1 (Thanh toán)
        if (status !== 1) {
          return NextResponse.json({ error: "Không có quyền thực hiện thao tác ngoài việc thanh toán" }, { status: 403 });
        }
        transaction.status = 1;
        transaction.paidDateAt = new Date();
        transaction.paidBy = displayName;
        transaction.revenueAtPayment = transaction.revenue;
        if (reducedRevenue !== undefined) {
          transaction.reducedRevenueAtPayment = Number(reducedRevenue);
        }
      } else {
        // Admin: Quyền Re-open (chuyển status = 0) hoặc tuỳ ý sửa
        transaction.status = status;
        if (status === 1) {
          // Luôn cập nhật hoặc gán mới khi Admin nhấn thanh toán
          transaction.paidDateAt = new Date();
          transaction.paidBy = displayName;
          transaction.revenueAtPayment = transaction.revenue;
          if (reducedRevenue !== undefined) {
            transaction.reducedRevenueAtPayment = Number(reducedRevenue);
          }
        } else if (status === 0) {
          // Khi mở lại: Xóa dấu vết thanh toán cũ, đưa phương thức và hoa hồng về 0
          transaction.paidDateAt = undefined;
          transaction.paidBy = undefined;
          transaction.paymentMethod = 0;
          transaction.profit = 0;
          transaction.revenueAtPayment = undefined;
          transaction.reducedRevenueAtPayment = undefined;
          transaction.markModified("paymentMethod");
        }
      }
    }

    // 2. Cập nhật Phương thức thanh toán (Tách biệt để đảm bảo luôn lưu)
    if (paymentMethod !== undefined) {
      transaction.paymentMethod = Number(paymentMethod);
      transaction.markModified("paymentMethod"); // Quan trọng vì là Schema.Types.Mixed
    }

    // 3. Cập nhật Lợi nhuận (Bỏ qua nếu là lệnh Mở lại để đảm bảo profit = 0)
    if (profit !== undefined && status !== 0) {
      transaction.profit = Number(profit);
    }

    // Đảm bảo các trường bắt buộc luôn có giá trị
    if (!transaction.vehicleNumber) {
      transaction.vehicleNumber = transaction.licensePlate || "Chưa xác định";
    }

    transaction.updatedBy = username;
    await transaction.save();

    // Phát tín hiệu WebSocket để các màn hình cập nhật dữ liệu
    emitRevenueUpdate();

    return NextResponse.json({ message: "Cập nhật thành công", transaction });
  } catch (error) {
    console.error("PUT /api/revenue/[id]/status error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
