"use client";

import { signOut } from "next-auth/react";
import { Box, Group, Text, Avatar, Menu, ActionIcon, Burger } from "@mantine/core";
import { IconLogout, IconChevronDown } from "@tabler/icons-react";

interface TopbarProps {
  userName?: string | null;
  opened?: boolean;
  toggle?: () => void;
}

export function Topbar({ userName, opened, toggle }: TopbarProps) {
  return (
    <Box
      style={{
        height: "100%",
        background: "white",
        borderBottom: "1px solid #e9ecef",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <Group>
        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
      </Group>
      <Menu shadow="md" width={180} position="bottom-end">
        <Menu.Target>
          <Box
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 8,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#f8f9fa";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <Avatar
              size={34}
              radius="xl"
              color="blue"
              style={{
                background: "linear-gradient(135deg, #228be6, #1971c2)",
              }}
            >
              {userName?.charAt(0)?.toUpperCase() || "U"}
            </Avatar>
            <Group gap={4}>
              <Text size="sm" fw={500} c="dark.7">
                {userName || "Admin"}
              </Text>
              <ActionIcon variant="transparent" size="xs" c="dimmed">
                <IconChevronDown size={14} />
              </ActionIcon>
            </Group>
          </Box>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconLogout size={14} />}
            color="red"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Đăng xuất
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
