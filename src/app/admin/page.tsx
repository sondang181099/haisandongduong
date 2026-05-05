"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Center, Loader } from "@mantine/core";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const res = await fetch("/api/roles/my-permissions");
        const data = await res.json();
        
        if (res.ok) {
          if (data.isAdmin) {
            router.replace("/admin/revenue");
            return;
          }

          const perms = data.permissions || [];
          if (perms.includes("/admin/revenue")) {
            router.replace("/admin/revenue");
          } else if (perms.includes("/admin/revenue-table")) {
            router.replace("/admin/revenue-table");
          } else if (perms.includes("/admin/users")) {
            router.replace("/admin/users");
          } else if (perms.includes("/admin/settings")) {
            router.replace("/admin/settings");
          } else if (perms.length > 0) {
            router.replace(perms[0]);
          } else {
            // Không có quyền nào
            // TODO: Hiển thị giao diện báo lỗi hoặc đẩy ra ngoài
          }
        }
      } catch (e) {
        console.error("Error checking permissions", e);
      }
    };

    checkPermissions();
  }, [router]);

  return (
    <Center style={{ minHeight: "60vh" }}>
      <Loader size="md" />
    </Center>
  );
}
