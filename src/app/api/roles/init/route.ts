import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Role } from "@/models/Role";

export async function GET() {
  try {
    await connectDB();

    const defaultRoles = [
      {
        name: "Quản trị tối cao",
        key: "admin",
        description: "Toàn quyền quản trị hệ thống.",
        isSystem: true,
        permissions: [
          "/admin/users",
          "/admin/revenue",
          "/admin/revenue-table",
          "/admin/settings",
          "/admin/revenue/config",
          "/admin/settings/sync",
          "/admin/settings/roles"
        ],
        viewUnpaid: true,
        viewPaid: true,
        viewRevenueOverview: true
      },
      {
        name: "Root",
        key: "root",
        description: "Quyền root hệ thống.",
        isSystem: true,
        permissions: ["/admin/users", "/admin/revenue", "/admin/revenue-table", "/admin/settings", "/admin/settings/roles"],
        viewUnpaid: true,
        viewPaid: true,
        viewRevenueOverview: true
      },
      {
        name: "Quản lý",
        key: "manager",
        description: "Quản lý nhân sự và xem doanh thu.",
        permissions: ["/admin/users", "/admin/revenue", "/admin/revenue-table"],
        viewUnpaid: true,
        viewPaid: true,
        viewRevenueOverview: true
      },
      {
        name: "Nhân viên",
        key: "employee",
        description: "Nhân viên vận hành.",
        permissions: ["/admin/revenue"]
      },
      {
        name: "Tài xế (VN)",
        key: "Tài xế",
        description: "Tài xế đăng nhập.",
        permissions: ["/admin/revenue"]
      },
      {
        name: "Driver (Global)",
        key: "driver",
        description: "Driver account.",
        permissions: ["/admin/revenue"]
      },
      {
        name: "Kế toán",
        key: "accountant",
        description: "Chỉ quản lý các đơn hàng chưa thanh toán.",
        permissions: ["/admin/revenue", "/admin/revenue/search"],
        viewUnpaid: true
      },
      {
        name: "Xem doanh thu",
        key: "view_revenue",
        description: "Chỉ xem báo cáo doanh thu.",
        permissions: ["/admin/revenue-table"]
      }
    ];

    for (const roleData of defaultRoles) {
      await Role.findOneAndUpdate(
        { key: roleData.key },
        { $set: roleData },
        { upsert: true, returnDocument: 'after' }
      );
    }

    return NextResponse.json({ message: "Đã khởi tạo danh sách quyền thành công" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
