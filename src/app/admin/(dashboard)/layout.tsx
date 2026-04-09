"use client";

import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Box } from "@mantine/core";
import { useSession } from "next-auth/react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const userName = session?.user?.name || session?.user?.email || "Admin";

  return (
    <Box style={{ display: "flex", minHeight: "100vh", background: "#f8f9fa" }}>
      <Sidebar />
      <Box style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar userName={userName} />
        <Box
          style={{
            flex: 1,
            padding: 24,
            minWidth: 0,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
