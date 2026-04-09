import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Box } from "@mantine/core";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <Box style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      {children}
    </Box>
  );
}
