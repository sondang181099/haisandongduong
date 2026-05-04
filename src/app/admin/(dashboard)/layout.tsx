"use client";

import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { AppShell, Box } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useSession } from "next-auth/react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [opened, { toggle, close }] = useDisclosure();
  const userName = session?.user?.name || session?.user?.email || "Admin";

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
      styles={{ main: { background: "#f8f9fa" } }}
    >
      <AppShell.Header>
        <Topbar userName={userName} opened={opened} toggle={toggle} />
      </AppShell.Header>

      <AppShell.Navbar p="0">
        <Sidebar onMobileClose={close} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box style={{ minHeight: "calc(100vh - 100px)" }}>
          {children}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
