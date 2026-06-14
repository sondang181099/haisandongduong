"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box, Text, NumberFormatter, Table,
  SimpleGrid, Image, Title, Center, Stack,
} from "@mantine/core";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import { useSocket } from "@/hooks/useSocket";
import { getReducedRevenue, ReductionRule, type ReductionConfig } from "@/lib/reduction";

interface Transaction {
  _id: string;
  code: string;
  vehicleNumber: string;
  groups: string;
  revenue: number;
  arrivalDate?: string | Date;
  customerModifiedDate?: string | Date;
  createdAt?: string | Date;
  status?: number;
  reducedRevenueAtPayment?: number;
  isFrozen?: boolean;
  frozenRevenue?: number;
}

// Hằng số layout (px)
const PADDING_V = 12;         // padding top + bottom của trang (mỗi bên)
const TABLE_HEADER_H = 44;    // chiều cao header của bảng
const ROW_H = 46;             // chiều cao mỗi hàng dữ liệu
const GRID_GAP = 10;          // khoảng cách giữa các cột

export default function PresentationPage() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reductionRules, setReductionRules] = useState<ReductionRule[] | ReductionConfig>([]);
  const [layout, setLayout] = useState<"new" | "old">("new");
  const [origin, setOrigin] = useState("http://techinfom.com");

  // Chiều cao viewport thực tế (tính toán để không scroll)
  const [viewportH, setViewportH] = useState(768);
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  // Tính số hàng tối đa có thể hiển thị trong 1 màn hình của giao diện mới
  const maxRowsPerCol = useMemo(() => {
    const availableH = viewportH - PADDING_V * 2 - TABLE_HEADER_H;
    return Math.max(1, Math.floor(availableH / ROW_H));
  }, [viewportH]);

  // Lấy ngày từ params
  const dateParam = searchParams.get("date");
  const parsedSelectedDate = useMemo(() => {
    return dateParam ? new Date(dateParam) : new Date();
  }, [dateParam]);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (parsedSelectedDate) {
        params.set("arrivalDate", dayjs(parsedSelectedDate).format("YYYY-MM-DD"));
      }
      params.set("presentationMode", "true");
      const res = await fetch(`/api/revenue?${params}`);
      const data = await res.json();
      const txs: Transaction[] = (data.transactions || [])
        .sort((a: Transaction, b: Transaction) => {
          const dateA = new Date(a.arrivalDate || a.customerModifiedDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.arrivalDate || b.customerModifiedDate || b.createdAt || 0).getTime();
          return dateA - dateB;
        });
      setTransactions(txs);
    } catch (e) {
      console.error("Fetch error:", e);
    }
  }, [parsedSelectedDate]);

  const { socket } = useSocket();

  useEffect(() => {
    fetch("/api/settings/reduction")
      .then(res => res.json())
      .then(data => {
        setReductionRules(data);
        fetchData();
      })
      .catch(() => fetchData());

    fetch("/api/settings/presentation")
      .then(res => res.json())
      .then(setting => {
        setLayout(setting.layout || "new");
      })
      .catch(() => {});

    if (socket) {
      socket.on("revenue-updated", async () => {
        try {
          const res = await fetch("/api/settings/presentation");
          const setting = await res.json();
          setLayout(setting.layout || "new");
          if (setting.autoUpdate !== false) {
            fetchData();
          }
        } catch {
          fetchData();
        }
      });
    }
    return () => {
      if (socket) socket.off("revenue-updated");
    };
  }, [fetchData, socket]);

  // Chia transactions cho giao diện mới
  const columnsNew = useMemo(() => {
    if (transactions.length === 0) {
      return [[], [], []] as Transaction[][];
    }
    const chunks: Transaction[][] = [];
    for (let i = 0; i < transactions.length; i += maxRowsPerCol) {
      chunks.push(transactions.slice(i, i + maxRowsPerCol));
    }
    while (chunks.length < 3) chunks.push([]);
    return chunks;
  }, [transactions, maxRowsPerCol]);

  // Chia transactions cho giao diện cũ (cố định 20 dòng mỗi cột, 4 cột)
  const columnsOld = useMemo(() => {
    const chunks: Transaction[][] = [[], [], [], []];
    transactions.forEach((t, i) => {
      const colIdx = Math.floor(i / 20);
      if (colIdx < 4) {
        chunks[colIdx].push(t);
      } else {
        if (!chunks[colIdx]) chunks[colIdx] = [];
        chunks[colIdx].push(t);
      }
    });
    while (chunks.length < 4) chunks.push([]);
    return chunks;
  }, [transactions]);

  // Xác định layout thực tế từ URL hoặc State
  const urlLayout = searchParams.get("layout");
  const activeLayout = urlLayout === "old" || urlLayout === "new" ? urlLayout : layout;

  const numCols = activeLayout === "old" ? columnsOld.length : columnsNew.length;
  const columns = activeLayout === "old" ? columnsOld : columnsNew;

  // Cấu hình font và kích thước cột cho giao diện mới
  const fontScale = numCols <= 3 ? 1 : numCols <= 5 ? 0.82 : numCols <= 7 ? 0.70 : 0.60;
  const dynFontSm = `${(0.88 * fontScale).toFixed(2)}rem`;
  const dynFontMd = `${(0.9 * fontScale).toFixed(2)}rem`;
  const dynFontLg = `${(1.0 * fontScale).toFixed(2)}rem`;
  const dynHeaderH = numCols <= 3 ? TABLE_HEADER_H : Math.max(28, Math.round(TABLE_HEADER_H * fontScale));
  const dynRowH    = numCols <= 3 ? ROW_H          : Math.max(24, Math.round(ROW_H * fontScale));

  // Hàm chọn màu doanh thu cho giao diện cũ
  const getOldColColor = (colIdx: number) => {
    const idx = colIdx % 4;
    if (idx === 0) return "var(--mantine-color-green-6)";
    if (idx === 1) return "var(--mantine-color-red-6)";
    if (idx === 2) return "var(--mantine-color-indigo-6)";
    return "var(--mantine-color-orange-6)";
  };

  if (activeLayout === "old") {
    // ===== GIAO DIỆN CŨ (likakaka.com) =====
    return (
      <Box
        style={{
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "var(--mantine-spacing-xl)",
          backgroundImage: "url('https://likakaka.com/assets/background-z5ptBPsy.jpeg')",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          width: "100%",
          minHeight: "100vh",
          display: "flex",
          boxSizing: "border-box",
          position: "relative",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        {/* Logo bên trái */}
        <Image
          src="/logo-old.png"
          alt="Logo"
          style={{
            top: "40px",
            left: "20px",
            width: "calc(9.375rem * var(--mantine-scale))",
            height: "calc(9.375rem * var(--mantine-scale))",
            position: "absolute",
          }}
        />

        {/* Mã QR bên phải */}
        <Stack
          gap="md"
          style={{
            top: "40px",
            right: "20px",
            position: "absolute",
            zIndex: 2,
          }}
        >
          <Center>
            <Image
              src={`https://api.qrserver.com/v1/create-qr-code/?size=150&data=${encodeURIComponent(origin + "/admin/revenue-table")}`}
              alt="Qr"
              style={{
                width: "calc(9.375rem * var(--mantine-scale))",
                height: "calc(9.375rem * var(--mantine-scale))",
              }}
            />
          </Center>
          <Center>
            <Title
              order={4}
              style={{
                whiteSpace: "nowrap",
                color: "var(--mantine-color-brand-text, #0058e4)",
                fontWeight: "bold",
              }}
            >
              Quét để kiểm tra doanh thu đoàn
            </Title>
          </Center>
        </Stack>

        {/* Tiêu đề ở giữa */}
        <Center style={{ marginTop: "var(--mantine-spacing-xl)", width: "100%", zIndex: 1 }}>
          <Title
            order={2}
            style={{
              marginBlock: "calc(2.5rem * var(--mantine-scale))",
              color: "var(--mantine-color-brand-6, #0063ff)",
              fontSize: "calc(2.5rem * var(--mantine-scale))",
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            ĐẦU MỐI HẢI SẢN ĐÔNG DƯƠNG KÍNH CHÀO QUÝ KHÁCH!
          </Title>
        </Center>

        {/* Nội dung chính: Grid 4 bảng */}
        <SimpleGrid
          cols={{ base: 1, md: 2, lg: 3, xl: 4 }}
          spacing="xl"
          style={{ zIndex: 1, flex: 1, alignItems: "stretch" }}
        >
            {columns.map((col: Transaction[], colIdx: number) => (
              <Box
                key={colIdx}
                style={{
                  background: "white",
                  borderRadius: "4px",
                  overflow: "hidden",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <Table
                  verticalSpacing={7}
                  withColumnBorders
                  withRowBorders
                  style={{ flex: 1, tableLayout: "fixed", width: "100%" }}
                >
                  <Table.Thead>
                    <Table.Tr style={{ height: "37px" }}>
                      <Table.Th
                        style={{
                          background: "#3884fe",
                          color: "white",
                          width: "90px",
                          textAlign: "center",
                          padding: "0 4px",
                        }}
                      >
                        <Text fw="bold" size="sm" style={{ textAlign: "center" }}>Số đoàn</Text>
                      </Table.Th>
                      <Table.Th
                        style={{
                          background: "#3884fe",
                          color: "white",
                          width: "150px",
                          textAlign: "center",
                          padding: "0 4px",
                        }}
                      >
                        <Text fw="bold" size="sm" style={{ textAlign: "center" }}>Biển số</Text>
                      </Table.Th>
                      <Table.Th
                        style={{
                          background: "#3884fe",
                          color: "white",
                          textAlign: "right",
                          padding: "0 6px",
                        }}
                      >
                        <Text fw="bold" size="sm" style={{ textAlign: "right" }}>Doanh thu</Text>
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {col.map((t) => (
                      <Table.Tr
                        key={t._id}
                        style={{ height: "37px" }}
                      >
                        <Table.Td style={{ padding: "0 4px" }}>
                          <Text style={{ textAlign: "center", fontSize: "0.88rem" }} lineClamp={1}>
                            {t.code}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ padding: "0 4px" }}>
                          <Text style={{ textAlign: "center", fontSize: "0.88rem" }} lineClamp={1}>
                            {t.vehicleNumber || "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ color: getOldColColor(colIdx), padding: "0 6px" }}>
                          <Text fw="bold" style={{ textAlign: "right", fontSize: "0.95rem" }} lineClamp={1}>
                            <NumberFormatter
                              value={(Number(t.status) === 1 && typeof t.reducedRevenueAtPayment === 'number') ? t.reducedRevenueAtPayment : getReducedRevenue(t.isFrozen ? (t.frozenRevenue ?? t.revenue) : t.revenue, t.groups, reductionRules)}
                              thousandSeparator=","
                              decimalSeparator="."
                              suffix=" ₫"
                            />
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {/* Hàng trống lấp đầy đến đúng 20 hàng */}
                    {Array.from({ length: Math.max(0, 20 - col.length) }).map((_, i) => (
                      <Table.Tr key={`empty-${i}`} style={{ height: "37px", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                        <Table.Td style={{ padding: "0 4px" }}></Table.Td>
                        <Table.Td style={{ padding: "0 4px" }}></Table.Td>
                        <Table.Td style={{ padding: "0 4px" }}></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            ))}
          </SimpleGrid>
      </Box>
    );
  }

  // ===== GIAO DIỆN MỚI (Mặc định) =====
  return (
    <Box
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2000&auto=format&fit=crop')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        display: "flex",
        flexDirection: "column",
        padding: PADDING_V,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Overlay tối */}
      <Box style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.25)", zIndex: 0,
      }} />

      {/* Nội dung chính */}
      <Box style={{
        position: "relative",
        zIndex: 1,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        gap: GRID_GAP,
      }}>
        {/* Grid bảng - chiếm toàn bộ chiều cao còn lại */}
        <SimpleGrid
          cols={numCols}
          spacing={GRID_GAP}
          style={{ flex: 1, overflow: "hidden", alignItems: "stretch" }}
        >
          {columns.slice(0, numCols).map((col: Transaction[], colIdx: number) => (
            <Box
              key={colIdx}
              style={{
                background: "rgba(255, 255, 255, 0.93)",
                borderRadius: "6px",
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <Table
                verticalSpacing={0}
                withTableBorder
                withColumnBorders
                withRowBorders
                style={{ flex: 1, tableLayout: "fixed", width: "100%" }}
              >
                <Table.Thead style={{ background: "#3b82f6" }}>
                  <Table.Tr style={{ height: dynHeaderH }}>
                    <Table.Th style={{ color: "white", fontSize: dynFontMd, textAlign: "center", width: "25%", padding: "0 3px" }}>Mã đoàn</Table.Th>
                    <Table.Th style={{ color: "white", fontSize: dynFontMd, textAlign: "center", width: "35%", padding: "0 3px" }}>Mã vận chuyển</Table.Th>
                    <Table.Th style={{ color: "white", fontSize: dynFontMd, textAlign: "center", width: "40%", padding: "0 3px" }}>Giá trị</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {col.map((t) => (
                    <Table.Tr
                      key={t._id}
                      style={{ background: "white", height: dynRowH }}
                    >
                      <Table.Td style={{ fontWeight: 700, textAlign: "center", fontSize: dynFontSm, padding: "0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.code}
                      </Table.Td>
                      <Table.Td style={{ fontWeight: 700, textAlign: "center", fontSize: dynFontSm, padding: "0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.vehicleNumber || "—"}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right", padding: "0 4px" }}>
                        <Text fw={900} c="green.7" fz={dynFontLg} style={{ whiteSpace: "nowrap" }}>
                          <NumberFormatter
                            value={(Number(t.status) === 1 && typeof t.reducedRevenueAtPayment === 'number') ? t.reducedRevenueAtPayment : getReducedRevenue(t.isFrozen ? (t.frozenRevenue ?? t.revenue) : t.revenue, t.groups, reductionRules)}
                            thousandSeparator="."
                            decimalSeparator=","
                            suffix=" đ"
                          />
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {/* Hàng trống lấp đầy đến maxRowsPerCol */}
                  {Array.from({ length: Math.max(0, maxRowsPerCol - col.length) }).map((_, i) => (
                    <Table.Tr key={`empty-${i}`} style={{ background: i % 2 === 0 ? "white" : "#fafafa", height: dynRowH }}>
                      <Table.Td style={{ padding: "0 3px" }}></Table.Td>
                      <Table.Td style={{ padding: "0 3px" }}></Table.Td>
                      <Table.Td style={{ padding: "0 3px" }}></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          ))}
        </SimpleGrid>
      </Box>
    </Box>
  );
}
