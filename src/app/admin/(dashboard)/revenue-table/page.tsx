"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Title, Text, NumberFormatter, Card, Group,
  SimpleGrid, Center, Loader, Button, Switch, SegmentedControl, Stack, Badge,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconScreenShare } from "@tabler/icons-react";
import dayjs from "dayjs";
import { getReducedRevenue, ReductionRule, type ReductionConfig } from "@/lib/reduction";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useSocket } from "@/hooks/useSocket";

interface Transaction {
  _id: string;
  code: string;
  vehicleNumber: string;
  groups: string;
  revenue: number;
  arrivalDate?: string | Date;
  customerModifiedDate?: string | Date;
  createdAt?: string | Date;
  isFrozen?: boolean;
  frozenRevenue?: number;
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
  const [presentationLayout, setPresentationLayout] = useState<string>("new");
  const [updatingLayout, setUpdatingLayout] = useState(false);

  // Định nghĩa 3 ngày gần nhất (Hôm nay, Hôm qua, Hôm kia)
  const today = dayjs().startOf("day").toDate();
  const yesterday = dayjs().subtract(1, "day").startOf("day").toDate();
  const dayBeforeYesterday = dayjs().subtract(2, "day").startOf("day").toDate();

  const isSameDay = (d1: Date | null, d2: Date) => {
    if (!d1) return false;
    return dayjs(d1).isSame(dayjs(d2), "day");
  };

  let activeSegment = "today";
  if (isSameDay(selectedDate, yesterday)) {
    activeSegment = "yesterday";
  } else if (isSameDay(selectedDate, dayBeforeYesterday)) {
    activeSegment = "beforeYesterday";
  }

  useEffect(() => {
    fetch("/api/settings/reduction").then(res => res.json()).then(data => setReductionRules(data)).catch(() => {});
    fetch("/api/settings/presentation")
      .then(res => res.json())
      .then(data => {
        setAutoUpdate(data.autoUpdate);
        setPresentationLayout(data.layout || "new");
      })
      .catch(() => {});
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

  const handleToggleLayout = async (val: string) => {
    setUpdatingLayout(true);
    try {
      const res = await fetch("/api/settings/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: val }),
      });
      if (res.ok) {
        setPresentationLayout(val);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingLayout(false);
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
      params.set("_t", Date.now().toString()); // Chống cache trình duyệt
      
      const res = await fetch(`/api/revenue?${params}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
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
        const reduced = getReducedRevenue(t.isFrozen ? (t.frozenRevenue ?? t.revenue) : (t.revenue || 0), t.groups || "", reductionRules);
        return sum + reduced;
      }, 0);
      setTotal(reducedTotal);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const { socket } = useSocket();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (socket) {
      socket.on("revenue-updated", async () => {
        try {
          const res = await fetch(`/api/settings/presentation?_t=${Date.now()}`, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              "Pragma": "no-cache"
            }
          });
          const setting = await res.json();
          setPresentationLayout(setting.layout || "new");
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

  // Split into columns with 15 rows each
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

  // 3 ô chọn ngày dùng chung cho mobile
  const dayOptions = [
    { label: "Hôm nay", date: today, value: "today", sub: dayjs(today).format("DD/MM") },
    { label: "Hôm qua", date: yesterday, value: "yesterday", sub: dayjs(yesterday).format("DD/MM") },
    { label: "Hôm kia", date: dayBeforeYesterday, value: "beforeYesterday", sub: dayjs(dayBeforeYesterday).format("DD/MM") },
  ];

  return (
    <Box>
      {isMobile ? (
        /* ===== MOBILE LAYOUT ===== */
        <Box>
          {/* Header mobile compact */}
          <Group justify="space-between" align="center" mb="md">
            <Box>
              <Text size="xs" c="dimmed" fw={500} mb={1} style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Bảng doanh thu
              </Text>
              <Text size="lg" fw={800} c="dark">
                {parsedSelectedDate ? dayjs(parsedSelectedDate).format("DD/MM/YYYY") : dayjs().format("DD/MM/YYYY")}
              </Text>
            </Box>
            <Group gap="xs" align="center">
              <Switch
                checked={presentationLayout === "old"}
                onChange={(e) => handleToggleLayout(e.currentTarget.checked ? "old" : "new")}
                disabled={updatingLayout}
                color="orange"
                size="sm"
                title="Giao diện"
              />
              <Switch
                checked={autoUpdate}
                onChange={(e) => handleToggleAutoUpdate(e.currentTarget.checked)}
                disabled={updatingAutoUpdate}
                color="green"
                size="sm"
                title="Tự động cập nhật trình chiếu"
              />
              <Button
                leftSection={<IconScreenShare size={14} />}
                color="blue"
                variant="filled"
                onClick={handleOpenPresentation}
                size="xs"
                radius="xl"
                px="sm"
              >
                Trình chiếu
              </Button>
            </Group>
          </Group>

          {/* 3 ô chọn ngày lớn dễ bấm */}
          <Box style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            {dayOptions.map(({ label, date, value, sub }) => {
              const isActive = activeSegment === value;
              return (
                <Box
                  key={value}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    background: isActive
                      ? "linear-gradient(135deg, #228be6, #1864ab)"
                      : "white",
                    border: `2px solid ${isActive ? "#1864ab" : "#dee2e6"}`,
                    borderRadius: "14px",
                    padding: "12px 6px",
                    textAlign: "center",
                    cursor: "pointer",
                    boxShadow: isActive
                      ? "0 4px 14px rgba(34,139,230,0.35)"
                      : "0 1px 4px rgba(0,0,0,0.06)",
                    transition: "all 0.18s ease",
                    userSelect: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Text size="sm" fw={700} c={isActive ? "white" : "dark"} lh={1.2}>{label}</Text>
                  <Text size="xs" fw={500} c={isActive ? "rgba(255,255,255,0.75)" : "dimmed"} mt={2}>{sub}</Text>
                </Box>
              );
            })}
          </Box>

          {/* Bảng dữ liệu mobile */}
          {loading ? (
            <Center py="xl"><Loader size="md" /></Center>
          ) : (
            <Card shadow="sm" radius="md" p={0} style={{ overflow: "hidden", border: "1px solid #e9ecef" }}>
              {/* Header bảng */}
              <Box style={{ background: "linear-gradient(135deg, #228be6, #1971c2)", padding: "12px 16px" }}>
                <Box style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gap: "8px", alignItems: "center" }}>
                  {(["Mã đoàn", "Mã vận chuyển", "Giá trị"] as const).map((h, i) => (
                    <Text
                      key={h}
                      size="xs"
                      c="white"
                      fw={700}
                      ta={i === 2 ? "right" : i === 1 ? "center" : "left"}
                      style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
                    >
                      {h}
                    </Text>
                  ))}
                </Box>
              </Box>

              {/* Danh sách giao dịch */}
              {transactions.length === 0 ? (
                <Center py="xl">
                  <Stack align="center" gap="xs">
                    <Text size="xl">📭</Text>
                    <Text size="sm" c="dimmed" fw={500}>Không có dữ liệu ngày này</Text>
                  </Stack>
                </Center>
              ) : (
                transactions.map((t, idx) => (
                  <Box
                    key={t._id}
                    style={{
                      padding: "12px 16px",
                      background: idx % 2 === 0 ? "white" : "#f8f9fa",
                      borderBottom: "1px solid #f1f3f5",
                    }}
                  >
                    <Box style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gap: "8px", alignItems: "center" }}>
                      <Text size="sm" fw={700} c="dark">{t.code}</Text>
                      <Text size="sm" c="dimmed" ta="center">{t.vehicleNumber || "—"}</Text>
                      <Text component="div" size="sm" fw={700} c="blue.7" ta="right" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                        <NumberFormatter value={getReducedRevenue(t.isFrozen ? (t.frozenRevenue ?? t.revenue) : t.revenue, t.groups, reductionRules)} thousandSeparator="." decimalSeparator="," />
                        {t.isFrozen && (
                          <Badge color="red" variant="light" size="xs" style={{ textTransform: "none" }}>Dừng</Badge>
                        )}
                      </Text>
                    </Box>
                  </Box>
                ))
              )}

              {/* Footer tổng doanh thu */}
              {transactions.length > 0 && (
                <Box style={{
                  background: "linear-gradient(135deg, #1c7ed6, #1864ab)",
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <Text size="sm" fw={600} c="white">{transactions.length} đoàn xe</Text>
                  <Text size="sm" fw={800} c="white">
                    Tổng: <NumberFormatter value={total} thousandSeparator="." decimalSeparator="," suffix=" đ" />
                  </Text>
                </Box>
              )}
            </Card>
          )}
        </Box>
      ) : (
        /* ===== DESKTOP LAYOUT ===== */
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
                label="Giao diện"
                checked={presentationLayout === "old"}
                onChange={(event) => handleToggleLayout(event.currentTarget.checked ? "old" : "new")}
                disabled={updatingLayout}
                color="orange"
                size="md"
              />
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
              >
                Trình chiếu
              </Button>
            </Group>
          </Group>

          {/* Bộ chọn 3 ngày gần nhất – Desktop */}
          <Card shadow="sm" radius="md" p="md" mb="xl" withBorder style={{
            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 249, 250, 0.95))",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.03)",
          }}>
            <Group gap="md" align="center" justify="space-between" wrap="wrap">
              <Group gap="sm" align="center" wrap="wrap" style={{ flex: 1 }}>
                <Text size="sm" fw={600} c="gray.7" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "16px" }}>📅</span> Chọn ngày xem:
                </Text>
                <SegmentedControl
                  value={activeSegment}
                  onChange={(value) => {
                    if (value === "today") setSelectedDate(today);
                    else if (value === "yesterday") setSelectedDate(yesterday);
                    else if (value === "beforeYesterday") setSelectedDate(dayBeforeYesterday);
                  }}
                  data={[
                    { label: `Hôm nay (${dayjs(today).format("DD/MM")})`, value: "today" },
                    { label: `Hôm qua (${dayjs(yesterday).format("DD/MM")})`, value: "yesterday" },
                    { label: `Hôm kia (${dayjs(dayBeforeYesterday).format("DD/MM")})`, value: "beforeYesterday" },
                  ]}
                  color="blue"
                  size="sm"
                  style={{ borderRadius: "8px", padding: "3px", background: "#f1f3f5" }}
                />
              </Group>
            </Group>
          </Card>

          {loading ? (
            <Center py="xl"><Loader size="md" /></Center>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: Math.min(columns.length, 2), md: Math.min(columns.length, 3), lg: Math.min(columns.length, 4) }} spacing="md">
              {columns.map((col: Transaction[], colIdx: number) => (
                <Card key={colIdx} shadow="xs" radius="md" p={0} visibleFrom={transactions.length > 0 && col.length === 0 ? "lg" : undefined}>
                  <Box style={{ background: "linear-gradient(135deg, #228be6, #1971c2)", padding: "10px 12px" }}>
                    <Box style={{ display: "grid", gridTemplateColumns: "70px 1.2fr 1fr", gap: "12px", alignItems: "center" }}>
                      {["Mã đoàn", "Mã vận chuyển", "Giá trị"].map((h, i) => (
                        <Text key={h} size="xs" c="white" fw={600} style={{ letterSpacing: "0.05em" }} ta={i === 2 ? "right" : i === 1 ? "center" : "left"}>
                          {h}
                        </Text>
                      ))}
                    </Box>
                  </Box>
                  {col.map((t, idx) => (
                    <Box key={t._id} style={{ padding: "8px 12px", background: idx % 2 === 0 ? "white" : "#f8f9fa", borderBottom: "1px solid #f1f3f5" }}>
                      <Box style={{ display: "grid", gridTemplateColumns: "70px 1.2fr 1fr", gap: "12px", alignItems: "center" }}>
                        <Text size="xs" fw={500}>{t.code}</Text>
                        <Text size="xs" c="dimmed" ta="center">{t.vehicleNumber || "-"}</Text>
                        <Text component="div" size="xs" fw={600} c="blue" ta="right" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                          <NumberFormatter value={getReducedRevenue(t.isFrozen ? (t.frozenRevenue ?? t.revenue) : t.revenue, t.groups, reductionRules)} thousandSeparator="." decimalSeparator="," />
                          {t.isFrozen && (
                            <Badge color="red" variant="light" size="xs" style={{ textTransform: "none" }}>Dừng</Badge>
                          )}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                  {/* Hàng trống để lấp đầy đến 15 hàng */}
                  {Array.from({ length: Math.max(0, 15 - col.length) }).map((_, i) => (
                    <Box key={`empty-${i}`} style={{ padding: "8px 12px", background: (col.length + i) % 2 === 0 ? "white" : "#f8f9fa", borderBottom: "1px solid #f1f3f5", height: "37px" }}>
                      <Box style={{ display: "grid", gridTemplateColumns: "70px 1.2fr 1fr", gap: "12px", alignItems: "center" }}>
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
      )}
    </Box>
  );
}
