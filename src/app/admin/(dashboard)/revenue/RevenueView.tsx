"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Button, Group, TextInput, Title, Table, Text, Badge,
  Card, ScrollArea, Loader, Center, Select, MultiSelect, Stack,
  NumberFormatter, Pagination, Switch, Modal, ActionIcon, NumberInput, SegmentedControl,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconSearch, IconRefresh, IconCurrencyDong, IconCalculator, IconTrash, IconArrowBackUp, IconFileSpreadsheet, IconEye, IconEyeOff, IconTable
} from "@tabler/icons-react";
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Ho_Chi_Minh");

import { useSession } from "next-auth/react";
import { calculateProfit } from "@/lib/commission";

interface Transaction {
  _id: string;
  code: string;
  licensePlate: string;
  vehicleNumber?: string;
  groups: string;
  revenue: number;
  extraFee: number;
  extraRevenue?: number;
  profit: number;
  status: number; // 0/1
  paymentMethod: number; // 0/1/2
  paidDateAt?: string;
  paidBy?: string;
  updatedBy?: string;
  arrivalDate?: string;
  customerModifiedDate?: string;
  updatedAt?: string;
}

interface Totals {
  totalRevenue: number;
  totalExtraFee: number;
  totalProfit: number;
  totalCash: number;
  totalTransfer: number;
}

const VEHICLE_TYPES = [
  "4 chỗ", "7 chỗ", "16 chỗ", "29 chỗ", "35 chỗ", "45 chỗ",
  "Taxi", "Khách lẻ", "Xe đạp", "Khác",
];

const PAYERS = ["Mai", "huyenbe", "admin", "xuxu", "itdd", "nhung", "thanh", "thao"];

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card shadow="xs" radius="md" p="md" style={{ flex: 1, minWidth: "max-content", borderTop: `3px solid ${color}` }}>
      <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em", whiteSpace: "nowrap" }} mb={4}>
        {label}
      </Text>
      <Text size="xl" fw={700} c={color}>
        <NumberFormatter value={value} thousandSeparator="." decimalSeparator="," suffix=" đ" />
      </Text>
    </Card>
  );
}

interface RevenueViewProps {
  title: string;
}

export function RevenueView({ title }: RevenueViewProps) {
  const { data: session, status: sessionStatus } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session?.user as any)?.role;
  const SHOW_INTERNAL_STORAGE_KEY = "revenue.showInternal";

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totals, setTotals] = useState<Totals>({ 
    totalRevenue: 0, 
    totalExtraFee: 0, 
    totalProfit: 0, 
    totalCash: 0, 
    totalTransfer: 0 
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Filters
  const [licensePlate, setLicensePlate] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [paidDateAt, setPaidDateAt] = useState<string | null>(null);
  const [arrivalDate, setArrivalDate] = useState<string | null>(null);
  const [showInternal, setShowInternal] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);

  // Toggle stats state
  const [showStatsInternal, setShowStatsInternal] = useState(false);

  // Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("1");
  const [editProfit, setEditProfit] = useState<number>(0);
  const [isCalcOnly, setIsCalcOnly] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [profitConfigs, setProfitConfigs] = useState<any[]>([]);

  const handlePaidDateChange = (value: any) => {
    if (!value) return setPaidDateAt(null);
    const date = value instanceof Date ? value : new Date(value);
    setPaidDateAt(date.toISOString());
  };

  const handleArrivalDateChange = (value: any) => {
    if (!value) return setArrivalDate(null);
    const date = value instanceof Date ? value : new Date(value);
    setArrivalDate(date.toISOString());
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (licensePlate) params.set("licensePlate", licensePlate);
      if (selectedGroups.length > 0) params.set("groups", selectedGroups.join(","));
      if (status) params.set("status", status);
      if (paymentMethod) params.set("paymentMethod", paymentMethod);
      if (paidBy) params.set("paidBy", paidBy);
      if (paidDateAt) params.set("paidDateAt", dayjs(paidDateAt).format("YYYY-MM-DD"));
      if (arrivalDate) params.set("arrivalDate", dayjs(arrivalDate).format("YYYY-MM-DD"));
      if (showInternal) params.set("showInternal", "true");

      const res = await fetch(`/api/revenue?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotals(data.totals || { totalRevenue: 0, totalExtraFee: 0, totalProfit: 0, totalCash: 0, totalTransfer: 0 });
    } catch {
      notifications.show({ message: "Không thể tải dữ liệu", color: "red" });
    } finally {
      setLoading(false);
    }
  }, [licensePlate, selectedGroups, status, paymentMethod, paidBy, paidDateAt, arrivalDate, showInternal]);

  const fetchConfigs = async () => {
    try {
      const res = await fetch("/api/revenue/config");
      const data = await res.json();
      if (res.ok) setProfitConfigs(data);
    } catch (e) {
      console.error("Fetch configs error:", e);
    }
  };

  useEffect(() => { 
    if (!filtersReady) return;
    fetchData(); 
    fetchConfigs();
  }, [fetchData, filtersReady]);

  // Tự động đồng bộ mỗi 5 phút (lấy dữ liệu 1 ngày)
  useEffect(() => {
    if (sessionStatus === "loading" || role !== "admin") return;

    const autoSync = async () => {
      try {
        await fetch("/api/revenue/sync", { 
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ range: "1day" })
        });
        fetchData(); // Tải lại dữ liệu sau khi đồng bộ ngầm
      } catch (e) {
        console.error("Auto-sync error:", e);
      }
    };

    const interval = setInterval(autoSync, 5 * 60 * 1000); 
    
    return () => clearInterval(interval);
  }, [role, sessionStatus, fetchData]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (role !== "admin") {
      setShowInternal(false);
      setFiltersReady(true);
      if (typeof window !== "undefined") {
        localStorage.removeItem(SHOW_INTERNAL_STORAGE_KEY);
      }
      return;
    }

    let nextValue = true;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SHOW_INTERNAL_STORAGE_KEY);
      if (stored !== null) nextValue = stored === "true";
    }
    setShowInternal(nextValue);
    setFiltersReady(true);
  }, [role, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!filtersReady) return;
    if (role !== "admin") return;
    if (typeof window === "undefined") return;
    localStorage.setItem(SHOW_INTERNAL_STORAGE_KEY, String(showInternal));
  }, [showInternal, role, filtersReady, sessionStatus]);

  useEffect(() => {
    setPage(1);
  }, [licensePlate, selectedGroups, status, paymentMethod, paidBy, paidDateAt, arrivalDate, showInternal]);

  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = transactions.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const syncKiotViet = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/revenue/sync", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: "7days" }) 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi đồng bộ");
      notifications.show({ message: `Đồng bộ thành công ${data.newOrUpdatedRecords} hóa đơn!`, color: "green" });
      fetchData(); 
    } catch (error: any) {
      notifications.show({ message: error.message || "Không thể đồng bộ KiotViet", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus?: number, method?: number) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/revenue/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: newStatus, 
          paymentMethod: method, 
          profit: (newStatus === 1 || isCalcOnly || (newStatus === undefined && method !== undefined)) ? editProfit : undefined 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");
      
      notifications.show({ message: data.message || "Thao tác thành công!", color: "green" });
      setPaymentModalOpen(false);
      fetchData();
    } catch (error: any) {
      notifications.show({ message: error.message || "Không thể cập nhật trạng thái", color: "red" });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openPaymentModal = (t: Transaction, calcOnly = false) => {
    setSelectedTransaction(t);
    const currentMethod = t.paymentMethod?.toString();
    setSelectedMethod(currentMethod === "1" || currentMethod === "2" ? currentMethod : "1");
    
    const freshProfit = calculateProfit(t.revenue || 0, t.groups || "", profitConfigs);
    setEditProfit(freshProfit);
    setIsCalcOnly(calcOnly);
    setPaymentModalOpen(true);
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Doanh thu");

    worksheet.getCell("A1").value = "Tổng hoa hồng:";
    worksheet.getCell("B1").value = totals.totalProfit;
    worksheet.getCell("C1").value = "Tổng hoa hồng (Tiền mặt):";
    worksheet.getCell("D1").value = totals.totalCash;
    worksheet.getCell("E1").value = "Tổng hoa hồng (Chuyển khoản):";
    worksheet.getCell("F1").value = totals.totalTransfer;

    worksheet.getCell("A2").value = "Tổng doanh thu:";
    worksheet.getCell("B2").value = totals.totalRevenue;
    worksheet.getCell("C2").value = "Doanh thu phát sinh:";
    worksheet.getCell("D2").value = totals.totalExtraFee;

    [1, 2].forEach(rowNum => {
      const row = worksheet.getRow(rowNum);
      row.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        if (colNumber % 2 === 0) {
          cell.numFmt = "#,##0";
          cell.font = { bold: true, color: { argb: "FF008000" } };
        }
      });
    });

    const headerRow = worksheet.getRow(4);
    const headers = [
      "Mã đoàn", "Biển số xe", "Loại xe", "Doanh thu", "Doanh thu phát sinh", 
      "Hoa hồng", "Trạng thái", "Phương thức", "Ngày thanh toán", "Người thanh toán", 
      "Ngày cập nhật", "NV Cập nhật", "Ngày đến"
    ];
    headerRow.values = headers;
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" }
      };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      };
    });

    transactions.forEach((t) => {
      const row = worksheet.addRow([
        t.code,
        t.vehicleNumber || t.licensePlate,
        t.groups || "",
        t.revenue,
        (t.extraRevenue || 0) + (t.extraFee || 0),
        t.profit,
        Number(t.status) === 1 ? "Đã thanh toán" : "Chưa thanh toán",
        Number(t.paymentMethod) === 1 ? "Tiền mặt" : Number(t.paymentMethod) === 2 ? "Chuyển khoản" : "Chưa rõ",
        t.paidDateAt ? dayjs(t.paidDateAt).tz().format("DD/MM/YYYY HH:mm") : "",
        t.paidBy || "",
        t.updatedAt ? dayjs(t.updatedAt).tz().format("DD/MM/YYYY HH:mm") : "",
        t.updatedBy || "",
        (t.updatedAt || t.arrivalDate) ? dayjs(t.updatedAt || t.arrivalDate).tz().format("DD/MM/YYYY HH:mm") : "",
      ]);

      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" }
        };
        if (colNumber >= 4 && colNumber <= 6) {
          cell.numFmt = "#,##0";
        }
      });
    });

    const widths = [15, 15, 15, 15, 20, 15, 20, 20, 20, 18, 20, 15, 20];
    worksheet.columns.forEach((col, i) => {
      col.width = widths[i] || 15;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `Bao_cao_doanh_thu_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`);
  };

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Title order={3}>{title}</Title>
        <Group>
          <Button
              leftSection={<IconRefresh size={16} />}
              color="orange"
              onClick={syncKiotViet}
              loading={loading}
            >
              Đồng bộ KiotViet
            </Button>
          <Button
            leftSection={<IconFileSpreadsheet size={16} />}
            variant="outline"
            color="green"
            onClick={handleExportExcel}
            disabled={transactions.length === 0}
          >
            Xuất Excel
          </Button>
          <Button
            leftSection={<IconTable size={16} />}
            variant="outline"
            color="blue"
            onClick={() => window.open("/admin/revenue-table", "_blank")}
          >
            Bảng trình chiếu
          </Button>
        </Group>
      </Group>

      {/* Summary Stats */}
      {role === "admin" && (
        <>
          <Group mb="md" justify="space-between">
            <Text fw={600} size="sm" c="dimmed">Tổng quan doanh thu</Text>
            <ActionIcon
              variant="subtle"
              color="blue"
              onClick={() => setShowStatsInternal(!showStatsInternal)}
              title={showStatsInternal ? "Ẩn thống kê" : "Hiển thị thống kê"}
            >
              {showStatsInternal ? <IconEye size={20} /> : <IconEyeOff size={20} />}
            </ActionIcon>
          </Group>
          {showStatsInternal && (
            <Group mb="md" grow wrap="wrap" style={{ alignItems: "stretch" }}>
              <StatCard label="Tổng doanh thu" value={totals.totalRevenue} color="#845ef7" />
              <StatCard label="Doanh thu phát sinh" value={totals.totalExtraFee} color="#d6336c" />
              <StatCard label="Tổng hoa hồng" value={totals.totalProfit} color="#228be6" />
              <StatCard label="Hoa hồng (Tiền mặt)" value={totals.totalCash} color="#f59f00" />
              <StatCard label="Hoa hồng (Chuyển khoản)" value={totals.totalTransfer} color="#40c057" />
            </Group>
          )}
        </>
      )}

      {/* Filters */}
      <Card shadow="xs" radius="md" mb="md" p="md">
        <Stack gap="sm">
          <Group grow>
            <TextInput
              placeholder="Biển số hoặc mã đoàn..."
              leftSection={<IconSearch size={16} />}
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.currentTarget.value)}
            />
            <MultiSelect
              placeholder="Chọn loại xe..."
              data={VEHICLE_TYPES}
              value={selectedGroups}
              onChange={setSelectedGroups}
              clearable
            />
            <Select
              placeholder="Trạng thái thanh toán"
              data={[
                { value: "0", label: "Chưa thanh toán" },
                { value: "1", label: "Đã thanh toán" },
              ]}
              value={status}
              onChange={setStatus}
              clearable
            />
          </Group>
          <Group grow>
            <Select
              placeholder="Phương thức thanh toán"
              data={[
                { value: "1", label: "Tiền mặt" },
                { value: "2", label: "Chuyển khoản" },
              ]}
              value={paymentMethod}
              onChange={setPaymentMethod}
              clearable
            />
            <Select
              placeholder="Người thanh toán"
              data={PAYERS}
              value={paidBy}
              onChange={setPaidBy}
              clearable
              searchable
            />
            <DatePickerInput
              placeholder="Ngày thanh toán"
              value={paidDateAt ? new Date(paidDateAt) : null}
              onChange={handlePaidDateChange}
              clearable
            />
            <DatePickerInput
              placeholder="Ngày đến"
              value={arrivalDate ? new Date(arrivalDate) : null}
              onChange={handleArrivalDateChange}
              clearable
            />
            {role === "admin" && (
              <Box style={{ display: "flex", alignItems: "center", paddingLeft: 10 }}>
                <Switch
                  label="Hiển thị xe nội bộ"
                  checked={showInternal}
                  onChange={(event) => setShowInternal(event.currentTarget.checked)}
                  size="sm"
                  color="blue"
                />
              </Box>
            )}
          </Group>
        </Stack>
      </Card>

      {/* Table */}
      <Card shadow="xs" radius="md" p={0} style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
        <Box style={{ 
          overflowX: "auto", 
          width: "100%", 
          maxWidth: "100%",
          WebkitOverflowScrolling: "touch"
        }}>
          {loading ? (
            <Center py="xl"><Loader size="md" /></Center>
          ) : (
            <Table striped highlightOnHover style={{ minWidth: 1600, tableLayout: "auto" }}>
              <Table.Thead>
                <Table.Tr style={{ background: "#f8f9fa", whiteSpace: "nowrap" }}>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Mã đoàn</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Biển số</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Loại xe</Table.Th>
                  <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Doanh thu</Table.Th>
                  <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Phát sinh</Table.Th>
                  <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Hoa hồng</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Trạng thái</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Phương thức</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Thanh toán</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Người thanh toán</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Cập nhật</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>NV Cập nhật</Table.Th>
                  <Table.Th style={{ whiteSpace: "nowrap" }}>Ngày đến</Table.Th>
                  <Table.Th style={{ 
                    textAlign: "center", 
                    whiteSpace: "nowrap",
                    position: "sticky",
                    right: 0,
                    background: "#f8f9fa",
                    zIndex: 2,
                    boxShadow: "-2px 0 5px rgba(0,0,0,0.05)"
                  }}>
                    Thao tác
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginatedTransactions.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={11}>
                      <Center py="xl">
                        <Box ta="center">
                          <IconCurrencyDong size={40} color="#adb5bd" />
                          <Text c="dimmed" mt={8}>Không có dữ liệu</Text>
                        </Box>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginatedTransactions.map((t) => (
                    <Table.Tr key={t._id}>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        <Text fw={500} size="sm">{t.code}</Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{t.vehicleNumber || t.licensePlate}</Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{t.groups || "—"}</Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                          <NumberFormatter value={t.revenue} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                          <NumberFormatter value={(t.extraRevenue || 0) + (t.extraFee || 0)} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text size="sm" fw={600} c="blue" style={{ fontVariantNumeric: "tabular-nums" }}>
                          <NumberFormatter value={t.profit} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={Number(t.status) === 1 ? "green" : "red"}
                          variant="light"
                          size="md"
                          style={{ textTransform: "none", fontSize: "13px", padding: "4px 8px", height: "auto", minHeight: "26px", lineHeight: "1.5", overflow: "visible", whiteSpace: "nowrap" }}
                        >
                          {Number(t.status) === 1 ? "Đã thanh toán" : "Chưa thanh toán"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={Number(t.paymentMethod) === 1 ? "orange" : Number(t.paymentMethod) === 2 ? "blue" : "gray"}
                          variant="light"
                          size="md"
                          style={{ textTransform: "none", fontSize: "13px", padding: "4px 8px", height: "auto", minHeight: "26px", lineHeight: "1.5", overflow: "visible", whiteSpace: "nowrap" }}
                        >
                          {Number(t.paymentMethod) === 1 ? "Tiền mặt" : Number(t.paymentMethod) === 2 ? "Chuyển khoản" : "Chưa rõ"}
                        </Badge>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {t.paidDateAt ? dayjs(t.paidDateAt).tz().format("DD/MM/YYYY HH:mm") : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{t.paidBy || "—"}</Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        <Text size="sm" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {t.updatedAt ? dayjs(t.updatedAt).tz().format("DD/MM/YYYY HH:mm") : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{t.updatedBy || "—"}</Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>
                        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {(t.updatedAt || t.arrivalDate) ? dayjs(t.updatedAt || t.arrivalDate).tz().format("DD/MM/YYYY HH:mm") : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ 
                        whiteSpace: "nowrap",
                        position: "sticky",
                        right: 0,
                        background: "white",
                        zIndex: 1,
                        boxShadow: "-2px 0 5px rgba(0,0,0,0.05)"
                      }}>
                        <Group gap="xs" wrap="nowrap" align="center" justify="flex-start">
                          <ActionIcon 
                            variant="filled" 
                            color="blue" 
                            onClick={() => openPaymentModal(t, true)}
                            title="Thông tin & Tính toán hoa hồng"
                          >
                            <IconCalculator size={18} />
                          </ActionIcon>
                          <>
                              <ActionIcon 
                                variant="filled" 
                                color="red" 
                                disabled={role !== "admin"}
                                title="Xóa bản ghi"
                              >
                                <IconTrash size={18} />
                              </ActionIcon>
                              <ActionIcon 
                                variant="filled" 
                                color={Number(t.status) === 1 ? "gray" : "green"} 
                                disabled={Number(t.status) === 1 && role !== "admin"} 
                                title={Number(t.status) === 1 ? "Mở lại (Admin)" : "Xác nhận Thanh toán"}
                                onClick={() => {
                                  if (Number(t.status) === 1 && role === "admin") {
                                    handleUpdateStatus(t._id, 0); 
                                  } else if (Number(t.status) === 0) {
                                    openPaymentModal(t, false); 
                                  }
                                }}
                              >
                                {Number(t.status) === 1 ? (
                                  <IconArrowBackUp size={18} />
                                ) : (
                                  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M298.9 24.31c-14.9.3-25.6 3.2-32.7 8.4l-97.3 52.1-54.1 73.59c-11.4 17.6-3.3 51.6 32.3 29.8l39-51.4c49.5-42.69 150.5-23.1 102.6 62.6-23.5 49.6-12.5 73.8 17.8 84l13.8-46.4c23.9-53.8 68.5-63.5 66.7-106.9l107.2 7.7-1-112.09-194.3-1.4zM244.8 127.7c-17.4-.3-34.5 6.9-46.9 17.3l-39.1 51.4c10.7 8.5 21.5 3.9 32.2-6.4 12.6 6.4 22.4-3.5 30.4-23.3 3.3-13.5 8.2-23 23.4-39zm-79.6 96c-.4 0-.9 0-1.3.1-3.3.7-7.2 4.2-9.8 12.2-2.7 8-3.3 19.4-.9 31.6 2.4 12.1 7.4 22.4 13 28.8 5.4 6.3 10.4 8.1 13.7 7.4 3.4-.6 7.2-4.2 9.8-12.1 2.7-8 3.4-19.5 1-31.6-2.5-12.2-7.5-22.5-13-28.8-4.8-5.6-9.2-7.6-12.5-7.6zm82.6 106.8c-7.9.1-17.8 2.6-27.5 7.3-11.1 5.5-19.8 13.1-24.5 20.1-4.7 6.9-5.1 12.1-3.6 15.2 1.5 3 5.9 5.9 14.3 6.3 8.4.5 19.7-1.8 30.8-7.3 11.1-5.5 19.8-13 24.5-20 4.7-6.9 5.1-12.2 3.6-15.2-1.5-3.1-5.9-5.9-14.3-6.3-1.1-.1-2.1-.1-3.3-.1zm-97.6 95.6c-4.7.1-9 .8-12.8 1.9-8.5 2.5-13.4 7-15 12.3-1.7 5.4 0 11.8 5.7 18.7 5.8 6.8 15.5 13.3 27.5 16.9 11.9 3.6 23.5 3.5 32.1.9 8.6-2.5 13.5-7 15.1-12.3 1.6-5.4 0-11.8-5.8-18.7-5.7-6.8-15.4-13.3-27.4-16.9-6.8-2-13.4-2.9-19.4-2.8z"></path></svg>
                                )}
                              </ActionIcon>
                            </>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          )}
        </Box>
        <Box px="md" py="xs" style={{ borderTop: "1px solid #f1f3f5" }}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Hiển thị {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, transactions.length)} / {transactions.length} bản ghi
            </Text>
            {totalPages > 1 && (
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            )}
          </Group>
        </Box>
      </Card>

      <Modal 
        opened={paymentModalOpen} 
        onClose={() => setPaymentModalOpen(false)} 
        title={<Text fw={700}>{isCalcOnly ? "Thông tin tính toán hoa hồng" : "Xác nhận thanh toán"}</Text>}
        centered
        radius="md"
      >
        {selectedTransaction && (
          <Stack gap="md">
            <Text size="sm">Thanh toán hoa hồng cho đoàn: <b>{selectedTransaction.code}</b></Text>
            
            <Box 
              p="md" 
              style={{ 
                backgroundColor: "#e7f5ff", 
                borderRadius: "8px", 
                border: "2px solid #339af0",
                textAlign: "center"
              }}
            >
              <Text size="xs" c="blue" fw={600} tt="uppercase" mb={4}>Số tiền hoa hồng</Text>
              <Text size="2rem" fw={800} c="blue" style={{ lineHeight: 1 }}>
                <NumberFormatter value={editProfit} thousandSeparator="." decimalSeparator="," suffix=" đ" />
              </Text>
            </Box>
            
            {!isCalcOnly && (
              <Stack gap={4} mt="xs">
                <Text size="sm" fw={700} c="blue">Phương thức thanh toán:</Text>
                <SegmentedControl
                  fullWidth
                  value={selectedMethod}
                  onChange={setSelectedMethod}
                  data={[
                    { label: "Tiền mặt", value: "1" },
                    { label: "Chuyển khoản", value: "2" },
                  ]}
                  color="blue"
                />
              </Stack>
            )}

            <Text size="xs" c="dimmed" fs="italic" mt={isCalcOnly ? 0 : -8}>
              * Tự động tính dựa trên cấu hình loại xe: <b>{selectedTransaction.groups || "Chưa rõ"}</b>
            </Text>

            {isCalcOnly ? (
              <Group grow mt="md">
                <Button
                  color="gray"
                  variant="light"
                  size="md"
                  onClick={() => setPaymentModalOpen(false)}
                >
                  Đóng
                </Button>
                <Button
                  color="blue"
                  size="md"
                  onClick={() => handleUpdateStatus(selectedTransaction._id, undefined, undefined)}
                  loading={updatingStatus}
                >
                  Xác nhận & Lưu
                </Button>
              </Group>
            ) : (
              <Button
                color="blue"
                size="lg"
                fullWidth
                mt="md"
                onClick={() => handleUpdateStatus(selectedTransaction._id, 1, Number(selectedMethod))}
                loading={updatingStatus}
              >
                Hoàn tất thanh toán
              </Button>
            )}
          </Stack>
        )}
      </Modal>

    </Box>
  );
}
