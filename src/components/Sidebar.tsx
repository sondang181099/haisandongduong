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
    label: "Doanh thu chi tiết",
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
  },
  {
    label: "Thiết lập",
    href: "/admin/settings",
    icon: IconSettings,
    children: [
      {
        label: "Thiết lập hiển thị giảm",
        href: "/admin/settings/reduction",
      },
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

export function Sidebar({ onMobileClose }: { onMobileClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (!userRole) {
      setLoadingPermissions(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        const res = await fetch("/api/roles/my-permissions");
        const data = await res.json();
        if (res.ok) {
          if (data.isAdmin) {
            // Admin tối cao thấy tất cả menu
            setIsAdmin(true);
            setPermissions(navItems.flatMap(item => [item.href, ...(item.children?.map(c => c.href) || [])]));
          } else {
            setIsAdmin(false);
            setPermissions(data.permissions || []);
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
    const hasPermission = isAdmin || permissions.includes(item.href) ||
      (item.children && item.children.some((c: any) => permissions.includes(c.href)));

    // Không có quyền → ẩn menu
    if (!hasPermission) {
      return null;
    }

    const hasChildren = item.children && item.children.length > 0;

    // Lọc menu con dựa trên quyền
    const visibleChildren = hasChildren
      ? item.children.filter((child: any) => isAdmin || permissions.includes(child.href))
      : [];

    if (hasChildren && visibleChildren.length === 0) {
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
      onClick: onMobileClose, // Đóng menu trên mobile khi click
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
              onClick={onMobileClose} // Đóng menu trên mobile khi click
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

  if (loadingPermissions) {
    return (
      <Box style={{ width: "100%", height: "100%", background: "white" }}>
        <Center h="100%"><Loader size="sm" /></Center>
      </Box>
    );
  }

  return (
    <Box
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "white",
        overflowY: "auto",
      }}
    >
      {/* Logo */}
      <Box
        style={{
          padding: "20px 16px",
          borderBottom: "1px solid #e9ecef",
          background: "white",
        }}
      >
        <Box style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Box
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#efaf33",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            <Image src="/logo.png" alt="Logo" w={48} h={48} fit="contain" />
          </Box>
          <Box>
            <Text size="sm" fw={700} c="dark" lh={1.2}>
              Hệ thống
            </Text>
            <Text size="xs" c="dimmed" lh={1.2}>
              Quản trị admin
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
