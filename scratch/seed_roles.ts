import mongoose from 'mongoose';
import { connectDB } from './src/lib/mongodb';
import { Role } from './src/models/Role';

async function seed() {
  await connectDB();
  const defaultRoles = [
      {
        name: "Quản trị viên",
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
        ]
      },
      {
        name: "Quản lý",
        key: "manager",
        description: "Quản lý nhân sự và xem doanh thu.",
        permissions: [
          "/admin/users",
          "/admin/revenue",
          "/admin/revenue-table"
        ]
      },
      {
        name: "Kế toán",
        key: "accountant",
        description: "Kiểm tra doanh thu và báo cáo.",
        permissions: [
          "/admin/revenue",
          "/admin/revenue-table"
        ]
      },
      {
        name: "Xem doanh thu",
        key: "viewer",
        description: "Chỉ xem bảng doanh thu.",
        permissions: [
          "/admin/revenue-table"
        ]
      },
      {
        name: "Tài xế",
        key: "driver",
        description: "Xem doanh thu cá nhân.",
        permissions: [
          "/admin/revenue"
        ]
      }
    ];

    for (const roleData of defaultRoles) {
      await Role.findOneAndUpdate(
        { key: roleData.key },
        { $set: roleData },
        { upsert: true, new: true }
      );
      console.log(`Seeded role: ${roleData.name}`);
    }
    console.log('Done');
    process.exit(0);
}

seed();
