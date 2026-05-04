import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Providers } from "./providers";
import { ColorSchemeInitializer } from "./ColorSchemeInitializer";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/charts/styles.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Hệ thống Admin",
  description: "Hệ thống quản lý nội bộ",
};

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" {...mantineHtmlProps} suppressHydrationWarning>
      <head>
        <ColorSchemeInitializer />
      </head>
      <body className={inter.className}>
        <MantineProvider theme={theme}>
          <Notifications position="top-right" />
          <Providers>{children}</Providers>
        </MantineProvider>
      </body>
    </html>
  );
}
