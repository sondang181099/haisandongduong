"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Box,
  NavLink,
  Stack,
  Text,
  Image,
  Center,
  Loader,
} from "@mantine/core";
import {
  IconUsers,
  IconCurrencyDong,
  IconTable,
  IconSettings,
  IconSearch,
} from "@tabler/icons-react";

const navItems = [
  {
    label: "Quản lý người dùng",
    href: "/admin/users",
    icon: IconUsers,
  },
  {
    label: "Quản lý doanh thu",
    href: "/admin/revenue",
    icon: IconCurrencyDong,
  },
  {
    label: "Tra cứu doanh thu",
    href: "/admin/revenue/search",
    icon: IconSearch,
    target: "_blank",
  },
  {
    label: "Bảng doanh thu",
    href: "/admin/revenue-table",
    icon: IconTable,
    target: "_blank",
  },
  {
    label: "Thiết lập",
    href: "/admin/settings",
    icon: IconSettings,
    children: [
      {
        label: "Thiết lập hoa hồng",
        href: "/admin/revenue/config",
      },
      {
        label: "Thiết lập đồng bộ",
        href: "/admin/settings/sync",
      },
      {
        label: "Thiết lập nhóm quyền",
        href: "/admin/settings/roles",
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!userRole) {
        setLoadingPermissions(false);
        return;
      }
      
      try {
        const res = await fetch("/api/roles");
        const data = await res.json();
        if (res.ok && data.roles) {
          const currentRole = data.roles.find((r: any) => r.key === userRole || r.name === userRole);
          if (currentRole) {
            setPermissions(currentRole.permissions || []);
          } else if (userRole === "admin") {
            // Fallback cho admin tối cao nếu chưa có trong DB
            setPermissions(navItems.flatMap(item => [item.href, ...(item.children?.map(c => c.href) || [])]));
          }
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
      } finally {
        setLoadingPermissions(false);
      }
    };

    fetchPermissions();
  }, [userRole]);

  const renderNavItem = (item: any) => {
    // Kiểm tra quyền truy cập dựa trên href
    const hasPermission = permissions.some(p => p === item.href || (item.children && item.children.some((c: any) => p === c.href)));
    
    // Luôn cho phép admin tối cao xem mọi thứ nếu permissions chưa tải xong hoặc rỗng
    if (!hasPermission && userRole !== "admin") {
      return null;
    }

    const hasChildren = item.children && item.children.length > 0;
    
    // Lọc con dựa trên quyền
    const visibleChildren = hasChildren 
      ? item.children.filter((child: any) => permissions.includes(child.href) || userRole === "admin")
      : [];

    if (hasChildren && visibleChildren.length === 0 && userRole !== "admin") {
      return null;
    }

    const isActive =
      item.href === "/admin/revenue"
        ? pathname === "/admin/revenue"
        : pathname.startsWith(item.href);

    const commonProps = {
      label: item.label,
      leftSection: item.icon ? <item.icon size={18} /> : null,
      active: isActive,
      defaultOpened: isActive,
      style: {
        borderRadius: 8,
        fontWeight: isActive ? 600 : 400,
      },
      styles: {
        root: {
          "&[dataActive]": {
            backgroundColor: "#e7f3ff",
            color: "#228be6",
          },
        },
      },
    };

    if (hasChildren) {
      return (
        <NavLink key={item.href} {...commonProps}>
          {visibleChildren.map((child: any) => (
            <NavLink
              key={child.href}
              component={Link}
              href={child.href}
              label={child.label}
              active={pathname === child.href}
              style={{ borderRadius: 8 }}
            />
          ))}
        </NavLink>
      );
    }

    return (
      <NavLink
        key={item.href}
        component={Link}
        href={item.href}
        target={item.target}
        {...commonProps}
      />
    );
  };

  if (loadingPermissions && userRole !== "admin") {
    return (
      <Box style={{ width: 240, height: "100vh", background: "white", borderRight: "1px solid #e9ecef" }}>
        <Center h="100%"><Loader size="sm" /></Center>
      </Box>
    );
  }

  return (
    <Box
      style={{
        width: 240,
        height: "100vh",
        position: "sticky",
        top: 0,
        background: "white",
        borderRight: "1px solid #e9ecef",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
        overflowY: "auto",
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <Box
        style={{
          padding: "20px 16px",
          borderBottom: "1px solid #e9ecef",
          background: "linear-gradient(135deg, #228be6 0%, #1971c2 100%)",
        }}
      >
        <Box style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Box
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image src="/logo.png" alt="Logo" w={36} h={36} fit="contain" />
          </Box>
          <Box>
            <Text size="sm" fw={700} c="white" lh={1.2}>
              Hải Sản
            </Text>
            <Text size="xs" c="rgba(255,255,255,0.8)" lh={1.2}>
              Đông Dương
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Navigation */}
      <Stack gap={4} p={8} style={{ flex: 1 }}>
        {navItems.map((item) => renderNavItem(item))}
      </Stack>
    </Box>
  );
}
