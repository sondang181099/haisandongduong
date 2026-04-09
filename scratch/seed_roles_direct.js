const mongoose = require('mongoose');

const MONGODB_URI = "mongodb://admin:bEjK7ktDAT@pub-outsource-wdf8goti-9702647.dbaas.bfcplatform.vn:27017,14.225.36.53:27017/haisandongduong?authSource=haisandongduong";

const RoleSchema = new mongoose.Schema({
  name: String,
  key: String,
  description: String,
  permissions: [String],
  viewUnpaid: { type: Boolean, default: false },
  isSystem: Boolean
}, { timestamps: true });

const Role = mongoose.models.Role || mongoose.model('Role', RoleSchema);

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
    viewUnpaid: true
  },
  {
    name: "Root",
    key: "root",
    description: "Quyền root hệ thống.",
    isSystem: true,
    permissions: ["/admin/users", "/admin/revenue", "/admin/revenue-table", "/admin/settings", "/admin/settings/roles"],
    viewUnpaid: true
  },
  {
    name: "Quản lý",
    key: "manager",
    description: "Quản lý nhân sự và xem doanh thu.",
    permissions: ["/admin/users", "/admin/revenue", "/admin/revenue-table"],
    viewUnpaid: true
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

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected.");

    for (const roleData of defaultRoles) {
      await Role.findOneAndUpdate(
        { key: roleData.key },
        { $set: roleData },
        { upsert: true, new: true }
      );
      console.log(`Seeded role: ${roleData.key} (viewUnpaid: ${roleData.viewUnpaid || false})`);
    }

    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
}

seed();
