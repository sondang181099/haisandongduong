"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Box, Text, NumberFormatter, Table,
  SimpleGrid,
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
}

// Hằng số layout (px)
const HEADER_HEIGHT = 0;      // Không có header trên cùng nữa
const PADDING_V = 12;         // padding top + bottom của trang (mỗi bên)
const TABLE_HEADER_H = 44;    // chiều cao header của bảng
const ROW_H = 46;             // chiều cao mỗi hàng dữ liệu
const GRID_GAP = 10;          // khoảng cách giữa các cột

export default function PresentationPage() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reductionRules, setReductionRules] = useState<ReductionRule[] | ReductionConfig>([]);

  // Chiều cao viewport thực tế (tính toán để không scroll)
  const [viewportH, setViewportH] = useState(768);
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Tính số hàng tối đa có thể hiển thị trong 1 màn hình
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

    if (socket) {
      socket.on("revenue-updated", async () => {
        try {
          const res = await fetch("/api/settings/presentation");
          const setting = await res.json();
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

  // Chia transactions thành các cột, mỗi cột tối đa maxRowsPerCol hàng
  const columns = useMemo(() => {
    if (transactions.length === 0) {
      // Luôn hiển thị ít nhất 3 cột rỗng
      return [[], [], []] as Transaction[][];
    }
    const chunks: Transaction[][] = [];
    for (let i = 0; i < transactions.length; i += maxRowsPerCol) {
      chunks.push(transactions.slice(i, i + maxRowsPerCol));
    }
    // Đảm bảo ít nhất 3 cột
    while (chunks.length < 3) chunks.push([]);
    return chunks;
  }, [transactions, maxRowsPerCol]);

  // Hiển thị tất cả cột, không giới hạn – font tự thu nhỏ theo số cột
  const numCols = columns.length;
  // Khi nhiều cột, tự động giảm font và padding để vừa màn hình
  const fontScale = numCols <= 3 ? 1 : numCols <= 5 ? 0.82 : numCols <= 7 ? 0.70 : 0.60;
  const dynFontSm = `${(0.88 * fontScale).toFixed(2)}rem`;
  const dynFontMd = `${(0.9 * fontScale).toFixed(2)}rem`;
  const dynFontLg = `${(1.0 * fontScale).toFixed(2)}rem`;
  const dynHeaderH = numCols <= 3 ? TABLE_HEADER_H : Math.max(28, Math.round(TABLE_HEADER_H * fontScale));
  const dynRowH    = numCols <= 3 ? ROW_H          : Math.max(24, Math.round(ROW_H * fontScale));

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
                            value={(Number(t.status) === 1 && typeof t.reducedRevenueAtPayment === 'number') ? t.reducedRevenueAtPayment : getReducedRevenue(t.revenue, t.groups, reductionRules)}
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
