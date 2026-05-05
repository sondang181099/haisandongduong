"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Title, Text, NumberFormatter, Card, Group,
  SimpleGrid, Center, Loader, Badge, Button, Switch,
} from "@mantine/core";
import { MonthPickerInput, DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { IconScreenShare } from "@tabler/icons-react";
import dayjs from "dayjs";
import { getReducedRevenue, ReductionRule, type ReductionConfig } from "@/lib/reduction";
import { usePagePermission } from "@/hooks/usePagePermission";

interface Transaction {
  _id: string;
  code: string;
  vehicleNumber: string;
  groups: string;
  revenue: number;
  arrivalDate?: string | Date;
  customerModifiedDate?: string | Date;
  createdAt?: string | Date;
}

export default function RevenueTableAdminPage() {
  // Kiểm tra quyền truy cập trang – nếu không có quyền sẽ tự redirect về /admin
  const { allowed } = usePagePermission("/admin/revenue-table");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [reductionRules, setReductionRules] = useState<ReductionRule[] | ReductionConfig>([]);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updatingAutoUpdate, setUpdatingAutoUpdate] = useState(false);

  useEffect(() => {
    fetch("/api/settings/reduction").then(res => res.json()).then(data => setReductionRules(data)).catch(() => {});
    fetch("/api/settings/presentation").then(res => res.json()).then(data => setAutoUpdate(data.autoUpdate)).catch(() => {});
  }, []);

  const handleToggleAutoUpdate = async (val: boolean) => {
    setUpdatingAutoUpdate(true);
    try {
      const res = await fetch("/api/settings/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoUpdate: val }),
      });
      if (res.ok) {
        setAutoUpdate(val);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingAutoUpdate(false);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) {
        params.set("arrivalDate", dayjs(selectedDate).format("YYYY-MM-DD"));
      } else {
        params.set("arrivalDate", dayjs().format("YYYY-MM-DD"));
      }
      params.set("presentationMode", "true"); // Chỉ lấy xe đoàn (bỏ khách lẻ, nội bộ)
      
      const res = await fetch(`/api/revenue?${params}`);
      const data = await res.json();
      const txs: Transaction[] = (data.transactions || [])
        .sort((a: Transaction, b: Transaction) => {
          const dateA = new Date(a.arrivalDate || a.customerModifiedDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.arrivalDate || b.customerModifiedDate || b.createdAt || 0).getTime();
          return dateA - dateB; // Sắp xếp từ cũ đến mới (theo trình tự đến)
        });
      setTransactions(txs);
      
      // Calculate total with reduced revenue
      const reducedTotal = txs.reduce((sum: number, t: Transaction) => {
        const reduced = getReducedRevenue(t.revenue || 0, t.groups || "", reductionRules);
        return sum + reduced;
      }, 0);
      setTotal(reducedTotal);
    } finally {

      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Split into columns with 20 rows each
  const columns: Transaction[][] = [];
  for (let i = 0; i < transactions.length; i += 15) {
    columns.push(transactions.slice(i, i + 15));
  }
  // Luôn hiển thị ít nhất 4 cột như yêu cầu
  while (columns.length < 4) {
    columns.push([]);
  }

  const parsedSelectedDate = selectedDate ? new Date(selectedDate) : null;

  const handleOpenPresentation = () => {
    const params = new URLSearchParams();
    if (selectedDate) {
      params.set("date", dayjs(selectedDate).toISOString());
    }
    window.open(`/admin/presentation/revenue-table?${params.toString()}`, "_blank");
  };

  const isMobile = useMediaQuery("(max-width: 48em)");

  // Trong khi kiểm tra quyền → hiển thị loader, tránh flash nội dung
  if (allowed === null) {
    return <Center style={{ minHeight: "60vh" }}><Loader size="md" /></Center>;
  }

  // Không có quyền (đã redirect) → không render gì cả
  if (allowed === false) {
    return null;
  }

  return (
    <Box>
      <Group justify="space-between" mb="lg" align="flex-start" wrap="wrap" gap="md">
        <Box style={{ flex: 1, minWidth: 280 }}>
          <Group align="center" gap="sm">
            <Title order={3}>
              Bảng doanh thu {parsedSelectedDate ? `(Ngày ${dayjs(parsedSelectedDate).format("DD/MM/YYYY")})` : "(Hôm nay)"}
            </Title>
          </Group>
        </Box>
        <Group align="center" gap="xl">
          <Switch 
            label="Tự động cập nhật trình chiếu" 
            checked={autoUpdate} 
            onChange={(event) => handleToggleAutoUpdate(event.currentTarget.checked)}
            disabled={updatingAutoUpdate}
            color="green"
            size="md"
          />
          <Button 
            leftSection={<IconScreenShare size={18} />} 
            color="blue" 
            variant="filled"
            onClick={handleOpenPresentation}
            fullWidth={isMobile}
          >
            Trình chiếu
          </Button>
        </Group>
      </Group>

      {loading ? (
        <Center py="xl"><Loader size="md" /></Center>
      ) : isMobile ? (
        /* Mobile: Render 1 Card for all transactions to avoid repeating headers */
        <Card shadow="xs" radius="md" p={0}>
          <Box style={{ background: "linear-gradient(135deg, #228be6, #1971c2)", padding: "10px 12px" }}>
            <Box style={{ display: "grid", gridTemplateColumns: "70px 1.2fr 1fr", gap: "12px", alignItems: "center" }}>
              {["Mã đoàn", "Mã vận chuyển", "Giá trị"].map((h, i) => (
                <Text key={h} size="xs" c="white" fw={600} ta={i === 2 ? "right" : i === 1 ? "center" : "left"}>
                  {h}
                </Text>
              ))}
            </Box>
          </Box>
          {transactions.map((t, idx) => (
            <Box key={t._id} style={{ padding: "8px 12px", background: idx % 2 === 0 ? "white" : "#f8f9fa", borderBottom: "1px solid #f1f3f5" }}>
              <Box style={{ display: "grid", gridTemplateColumns: "70px 1.2fr 1fr", gap: "12px", alignItems: "center" }}>
                <Text size="xs" fw={500}>{t.code}</Text>
                <Text size="xs" c="dimmed" ta="center">{t.vehicleNumber || "-"}</Text>
                <Text size="xs" fw={600} c="blue" ta="right">
                  <NumberFormatter value={getReducedRevenue(t.revenue, t.groups, reductionRules)} thousandSeparator="." decimalSeparator="," />
                </Text>
              </Box>
            </Box>
          ))}
          {transactions.length === 0 && (
            <Center py="md"><Text size="xs" c="dimmed">Trống</Text></Center>
          )}
        </Card>
      ) : (
        /* Desktop/Tablet: Split into columns as before */
        <SimpleGrid cols={{ base: 1, sm: Math.min(columns.length, 2), md: Math.min(columns.length, 3), lg: Math.min(columns.length, 4) }} spacing="md">
          {columns.map((col: Transaction[], colIdx: number) => (
            <Card key={colIdx} shadow="xs" radius="md" p={0} visibleFrom={transactions.length > 0 && col.length === 0 ? "lg" : undefined}>
              <Box
                style={{
                  background: "linear-gradient(135deg, #228be6, #1971c2)",
                  padding: "10px 12px",
                }}
              >
                <Box
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1.2fr 1fr",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  {["Mã đoàn", "Mã vận chuyển", "Giá trị"].map((h, i) => (
                    <Text 
                      key={h} 
                      size="xs" 
                      c="white" 
                      fw={600} 
                      style={{ letterSpacing: "0.05em" }}
                      ta={i === 2 ? "right" : i === 1 ? "center" : "left"}
                    >
                      {h}
                    </Text>
                  ))}
                </Box>
              </Box>
              {col.map((t, idx) => (
                <Box
                  key={t._id}
                  style={{
                    padding: "8px 12px",
                    background: idx % 2 === 0 ? "white" : "#f8f9fa",
                    borderBottom: "1px solid #f1f3f5",
                  }}
                >
                  <Box
                    style={{
                      display: "grid",
                      gridTemplateColumns: "70px 1.2fr 1fr",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <Text size="xs" fw={500}>{t.code}</Text>
                    <Text size="xs" c="dimmed" ta="center">{t.vehicleNumber || "-"}</Text>
                    <Text size="xs" fw={600} c="blue" ta="right">
                      <NumberFormatter value={getReducedRevenue(t.revenue, t.groups, reductionRules)} thousandSeparator="." decimalSeparator="," />
                    </Text>
                  </Box>
                </Box>
              ))}
              {/* Thêm hàng trống để lấp đầy đến 15 hàng */}
              {Array.from({ length: Math.max(0, 15 - col.length) }).map((_, i) => (
                <Box
                  key={`empty-${i}`}
                  style={{
                    padding: "8px 12px",
                    background: (col.length + i) % 2 === 0 ? "white" : "#f8f9fa",
                    borderBottom: "1px solid #f1f3f5",
                    height: "37px", // Khớp với chiều cao hàng có dữ liệu
                  }}
                >
                  <Box
                    style={{
                      display: "grid",
                      gridTemplateColumns: "70px 1.2fr 1fr",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <Text size="xs">&nbsp;</Text>
                    <Text size="xs">&nbsp;</Text>
                    <Text size="xs">&nbsp;</Text>
                  </Box>
                </Box>
              ))}
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
