"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Button, Group, TextInput, Title, Table, Text, Badge,
  Card, ScrollArea, Loader, Center, Select, MultiSelect, Stack,
  NumberFormatter, Pagination, Switch, Modal, ActionIcon, NumberInput, SegmentedControl,
  SimpleGrid, Divider, Grid,
} from "@mantine/core";
import { useMediaQuery, useDisclosure } from "@mantine/hooks";
import { DatePickerInput } from "@mantine/dates";
import { BarChart } from "@mantine/charts";
import { notifications } from "@mantine/notifications";
import {
  IconSearch, IconRefresh, IconCurrencyDong, IconCalculator, IconTrash, IconArrowBackUp, IconFileSpreadsheet, IconEye, IconEyeOff, IconTable
} from "@tabler/icons-react";
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useSocket } from "@/hooks/useSocket";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Ho_Chi_Minh");

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { calculateProfit } from "@/lib/commission";
import { VEHICLE_TYPES } from "@/lib/constants";
import { getReducedRevenue, type ReductionRule, type ReductionConfig } from "@/lib/reduction";

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
  isCustomerDeleted?: boolean;
  isHidden?: boolean;
  childInvoices?: {
    code: string;
    purchaseDate: string;
    soldByName: string;
    total: number;
    mainProducts: string;
  }[];
  updatedAt?: string;
  revenueAtPayment?: number;
  reducedRevenueAtPayment?: number;
}

interface Totals {
  totalRevenue: number;
  totalExtraFee: number;
  totalProfit: number;
  totalCash: number;
  totalTransfer: number;
}


const PAYERS = ["Mai", "huyenbe", "admin", "xuxu", "itdd", "nhung", "thanh", "thao"];

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card 
      shadow="xs" 
      radius="md" 
      p="md" 
      style={{ 
        flex: 1, 
        minWidth: "max-content", 
        borderTop: `4px solid ${color}`,
        borderLeft: "1px solid #f1f3f5",
        borderRight: "1px solid #f1f3f5",
        borderBottom: "1px solid #f1f3f5"
      }}
    >
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.05em", whiteSpace: "nowrap" }} mb={4}>
        {label}
      </Text>
      <Text size="xl" fw={800} c={color}>
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
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (session?.user as any)?.role;
  const viewRevenueOverview = (session?.user as any)?.viewRevenueOverview;
  const canDeleteLocal = (session?.user as any)?.canDeleteLocal;
  const isDriverRole = (session?.user as any)?.isDriverRole === true;
  const SHOW_INTERNAL_STORAGE_KEY = "revenue.showInternal";
  const SHOW_ORIGINAL_REVENUE_KEY = "revenue.showOriginalRevenue";

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
  const [showOriginalRevenue, setShowOriginalRevenue] = useState(true);
  const [filtersReady, setFiltersReady] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<{ month: string; revenue: number }[]>([]);

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
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [extraRevenueModalOpen, setExtraRevenueModalOpen] = useState(false);
  const [newExtraRevenue, setNewExtraRevenue] = useState<number>(0);
  const [updatingExtra, setUpdatingExtra] = useState(false);
  const [reductionRules, setReductionRules] = useState<ReductionRule[] | ReductionConfig>([]);
  
  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, code: string, isLocal: boolean } | null>(null);

  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoTx, setInfoTx] = useState<Transaction | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      // ... (filters)
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
      if (!silent) setLoading(false);
    }
  }, [licensePlate, selectedGroups, status, paymentMethod, paidBy, paidDateAt, arrivalDate, showInternal]);

  const fetchMonthlyStats = useCallback(async () => {
    try {
      const res = await fetch("/api/revenue/stats");
      const data = await res.json();
      if (res.ok) setMonthlyStats(data);
    } catch (e) {
      console.error("Fetch monthly stats error:", e);
    }
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch("/api/revenue/config");
      const data = await res.json();
      if (res.ok) setProfitConfigs(data);
    } catch (e) {
      console.error("Fetch configs error:", e);
    }
  };

  const fetchReductionRules = async () => {
    try {
      const res = await fetch("/api/settings/reduction");
      if (res.ok) {
        const data = await res.json();
        setReductionRules(data);
      }
    } catch (e) {
      console.error("Fetch reduction rules error:", e);
    }
  };

  useEffect(() => {
    if (!filtersReady) return;
    fetchData();
    fetchConfigs();
    fetchMonthlyStats();
    fetchReductionRules();
  }, [fetchData, filtersReady, fetchMonthlyStats]);


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

    let nextValue = false;
    let nextOriginalValue = true;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SHOW_INTERNAL_STORAGE_KEY);
      if (stored !== null) nextValue = stored === "true";
      const storedOriginal = localStorage.getItem(SHOW_ORIGINAL_REVENUE_KEY);
      if (storedOriginal !== null) nextOriginalValue = storedOriginal === "true";
    }
    setShowInternal(nextValue);
    setShowOriginalRevenue(nextOriginalValue);
    setFiltersReady(true);
  }, [role, sessionStatus]);

  const { socket } = useSocket();

  useEffect(() => {
    if (socket) {
      socket.on("revenue-updated", () => {
        console.log("Revenue update received via WebSocket");
        fetchData(true); // Silent update
        fetchMonthlyStats();
      });
    }

    return () => {
      if (socket) {
        socket.off("revenue-updated");
      }
    };
  }, [socket, fetchData, fetchMonthlyStats]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!filtersReady) return;
    if (role !== "admin") return;
    if (typeof window === "undefined") return;
    localStorage.setItem(SHOW_INTERNAL_STORAGE_KEY, String(showInternal));
    localStorage.setItem(SHOW_ORIGINAL_REVENUE_KEY, String(showOriginalRevenue));
  }, [showInternal, showOriginalRevenue, role, filtersReady, sessionStatus]);

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
        body: JSON.stringify({ range: "1day" })
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
          profit: (newStatus === 1 || isCalcOnly || (newStatus === undefined && method !== undefined)) ? editProfit : undefined,
          reducedRevenue: (newStatus === 1 || isCalcOnly) ? getReducedRevenue(selectedTransaction?.revenue || 0, selectedTransaction?.groups || "", reductionRules) : undefined
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

  const handleDelete = (id: string, code: string, isLocal: boolean = false) => {
    setDeleteTarget({ id, code, isLocal });
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const { id, code, isLocal } = deleteTarget;

    setDeletingIds(prev => [...prev, id]);
    setDeleteModalOpen(false);
    
    try {
      const res = await fetch(`/api/revenue/${id}${isLocal ? "?local=true" : ""}`, {
        method: "DELETE",
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Lỗi khi xóa bản ghi");
      }

      notifications.show({ 
        title: "Thành công",
        message: isLocal ? `Đã ẩn khách hàng [${code}] thành công` : `Đã xóa đoàn xe [${code}] trên cả App và KiotViet`, 
        color: "green" 
      });
      fetchData(true);
    } catch (error: any) {
      notifications.show({ 
        title: "Lỗi",
        message: error.message || "Không thể xóa bản ghi", 
        color: "red" 
      });
    } finally {
      setDeletingIds(prev => prev.filter(item => item !== id));
      setDeleteTarget(null);
    }
  };

  const handleRestore = async (id: string, code: string) => {
    try {
      const res = await fetch(`/api/revenue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: false }),
      });
      
      if (!res.ok) throw new Error("Không thể khôi phục");

      notifications.show({ title: "Thành công", message: `Đã khôi phục hiển thị cho khách hàng [${code}]`, color: "green" });
      fetchData(true);
    } catch (error: any) {
      notifications.show({ title: "Lỗi", message: error.message, color: "red" });
    }
  };

  const handleUpdateExtraRevenue = async () => {
    if (!selectedTransaction) return;
    setUpdatingExtra(true);
    try {
      const res = await fetch(`/api/revenue/${selectedTransaction._id}/extra`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraRevenue: newExtraRevenue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

      notifications.show({ message: "Cập nhật phát sinh thành công!", color: "green" });
      setExtraRevenueModalOpen(false);
      fetchData();
    } catch (error: any) {
      notifications.show({ message: error.message || "Không thể cập nhật phát sinh", color: "red" });
    } finally {
      setUpdatingExtra(false);
    }
  };

  const openPaymentModal = (t: Transaction, calcOnly = false) => {
    setSelectedTransaction(t);
    const currentMethod = t.paymentMethod?.toString();
    setSelectedMethod(currentMethod === "1" || currentMethod === "2" ? currentMethod : "1");

    const reducedRevenue = getReducedRevenue(t.revenue || 0, t.groups || "", reductionRules);
    const freshProfit = calculateProfit(reducedRevenue, t.groups || "", profitConfigs, t.extraRevenue || 0);
    setEditProfit(freshProfit);
    setIsCalcOnly(calcOnly);
    setPaymentModalOpen(true);
  };

  const openInfoModal = (t: any) => {
    setInfoTx(t);
    setInvoiceDetails(t.childInvoices || []);
    setLoadingDetails(false);
    setInfoModalOpen(true);
  };

  const openExtraRevenueModal = (t: Transaction) => {
    setSelectedTransaction(t);
    setNewExtraRevenue(t.extraRevenue || 0);
    setExtraRevenueModalOpen(true);
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
      "Mã đoàn", "Mã hóa đơn", "Biển số xe", "Loại xe",
      ...(role === "admin" ? ["Doanh thu gốc"] : []),
      "DOANH THU", "Doanh thu phát sinh",
      "Hoa hồng", "Trạng thái", "Phương thức", "Ngày thanh toán", "Người thanh toán",
      "NV Cập nhật", "Ngày đến"
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
      const totalExtra = (t.extraRevenue || 0) + (t.extraFee || 0);
      const baseRevenue = (Number(t.status) === 1 && typeof t.revenueAtPayment === 'number') ? t.revenueAtPayment : (t.revenue || 0);

      const processedInvoiceCodes = (t.childInvoices || []).map((inv: any) => {
        const isLate = Number(t.status) === 1 && t.paidDateAt && dayjs(inv.purchaseDate).isAfter(dayjs(t.paidDateAt));
        return inv.code + (isLate ? "-s" : "");
      }).join(", ");

      const row = worksheet.addRow([
        t.code,
        processedInvoiceCodes,
        t.vehicleNumber || t.licensePlate,
        t.groups || "",
        ...(role === "admin" ? [t.revenue] : []),
        (Number(t.status) === 1 && typeof t.reducedRevenueAtPayment === 'number') ? t.reducedRevenueAtPayment : getReducedRevenue(baseRevenue, t.groups, reductionRules),
        totalExtra,
        t.profit,
        Number(t.status) === 1 ? "Đã thanh toán" : "Chưa thanh toán",
        Number(t.paymentMethod) === 1 ? "Tiền mặt" : Number(t.paymentMethod) === 2 ? "Chuyển khoản" : "Chưa rõ",
        t.paidDateAt ? dayjs(t.paidDateAt).tz().format("DD/MM/YYYY HH:mm") : "",
        t.paidBy || "",
        t.updatedBy || "",
        (t.arrivalDate || t.customerModifiedDate || t.updatedAt) ? dayjs(t.arrivalDate || t.customerModifiedDate || t.updatedAt).tz().format("DD/MM/YYYY HH:mm") : "",
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

    const widths = [15, 15, 15, 15, 20, 15, 20, 20, 20, 18, 15, 20];
    worksheet.columns.forEach((col, i) => {
      col.width = widths[i] || 15;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `Bao_cao_doanh_thu_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`);
  };

  const isMobile = useMediaQuery("(max-width: 48em)");
  const [filtersOpen, { toggle: toggleFilters }] = useDisclosure(false);

  return (
    <Box>
      {/* Header */}
      <Group justify="space-between" mb="md" wrap="nowrap" align="center">
        <Title order={3} style={{ fontSize: isMobile ? "1.1rem" : undefined }}>{title}</Title>
        <Group gap="xs" wrap="nowrap">
          {!isDriverRole && (isMobile ? (
            <>
              <ActionIcon size="lg" color="orange" variant="filled" onClick={syncKiotViet} loading={loading} title="Đồng bộ KiotViet">
                <IconRefresh size={18} />
              </ActionIcon>
              <ActionIcon size="lg" color="green" variant="outline" onClick={handleExportExcel} disabled={transactions.length === 0} title="Xuất Excel">
                <IconFileSpreadsheet size={18} />
              </ActionIcon>

            </>
          ) : (
            <>
              <Button leftSection={<IconRefresh size={16} />} color="orange" onClick={syncKiotViet} loading={loading} size="sm">
                Đồng bộ KiotViet
              </Button>
              <Button leftSection={<IconFileSpreadsheet size={16} />} variant="outline" color="green" onClick={handleExportExcel} disabled={transactions.length === 0} size="sm">
                Xuất Excel
              </Button>

            </>
          ))}
        </Group>
      </Group>

      {/* Summary Stats */}
      {(role === "admin" || viewRevenueOverview) && (
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
            <Stack gap="md" mb="md">
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 5 }} spacing="md">
                <StatCard label="Tổng doanh thu" value={totals.totalRevenue} color="#845ef7" />
                <StatCard label="Doanh thu phát sinh" value={totals.totalExtraFee} color="#d6336c" />
                <StatCard label="Tổng hoa hồng" value={totals.totalProfit} color="#228be6" />
                <StatCard label="Hoa hồng (Tiền mặt)" value={totals.totalCash} color="#f59f00" />
                <StatCard label="Hoa hồng (Chuyển khoản)" value={totals.totalTransfer} color="#40c057" />
              </SimpleGrid>

              <Card shadow="xs" radius="md" p="md" withBorder>
                <Text fw={700} mb="md">Biểu đồ doanh thu hàng tháng (Năm {dayjs().year()})</Text>
                <Box h={300}>
                  <BarChart
                    h={300}
                    data={monthlyStats}
                    dataKey="month"
                    series={[
                      { name: "revenue", color: "blue.6", label: "Doanh thu (Triệu VNĐ)" },
                    ]}
                    tickLine="none"
                    gridAxis="y"
                    barProps={{ radius: [6, 6, 0, 0], barSize: 35 }}
                    yAxisProps={{ 
                      tickFormatter: (value) => `${value} Tr`,
                      width: 60
                    }}
                    valueFormatter={(value) => `${new Intl.NumberFormat("vi-VN").format(value)} Triệu ₫`}
                    withTooltip
                  />
                </Box>
              </Card>
            </Stack>
          )}
        </>
      )}

      {/* Filters */}
      <Card shadow="xs" radius="md" mb="md" p="md">
        {isMobile ? (
          <Stack gap="xs">
            {/* Mobile: search + toggle */}
            <TextInput
              placeholder="Biển số hoặc mã đoàn..."
              leftSection={<IconSearch size={16} />}
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.currentTarget.value)}
            />
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              rightSection={filtersOpen ? "▲" : "▼"}
              onClick={toggleFilters}
              style={{ alignSelf: "flex-start", padding: "2px 8px" }}
            >
              {filtersOpen ? "Ẩn bộ lọc" : "Thêm bộ lọc"}
            </Button>
            {filtersOpen && (
              <SimpleGrid cols={2} spacing="xs">
                <MultiSelect
                  placeholder="Loại xe"
                  data={VEHICLE_TYPES}
                  value={selectedGroups}
                  onChange={setSelectedGroups}
                  clearable
                  size="xs"
                />
                <Select
                  placeholder="Trạng thái"
                  data={[
                    { value: "0", label: "Chưa TT" },
                    { value: "1", label: "Đã TT" },
                  ]}
                  value={status}
                  onChange={setStatus}
                  clearable
                  size="xs"
                />
                <Select
                  placeholder="Phương thức"
                  data={[
                    { value: "1", label: "Tiền mặt" },
                    { value: "2", label: "CK" },
                  ]}
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  clearable
                  size="xs"
                />
                <Select
                  placeholder="Người TT"
                  data={PAYERS}
                  value={paidBy}
                  onChange={setPaidBy}
                  clearable
                  searchable
                  size="xs"
                />
                <DatePickerInput
                  placeholder="Ngày TT"
                  value={paidDateAt ? new Date(paidDateAt) : null}
                  onChange={handlePaidDateChange}
                  clearable
                  size="xs"
                />
                <DatePickerInput
                  placeholder="Ngày đến"
                  value={arrivalDate ? new Date(arrivalDate) : null}
                  onChange={handleArrivalDateChange}
                  clearable
                  size="xs"
                />
                {role === "admin" && (
                  <>
                    <Box style={{ gridColumn: "span 2", display: "flex", alignItems: "center", paddingTop: 4 }}>
                      <Switch
                        label="Tất cả (NB & KL)"
                        checked={showInternal}
                        onChange={(event) => setShowInternal(event.currentTarget.checked)}
                        size="sm"
                        color="blue"
                      />
                    </Box>
                    <Box style={{ gridColumn: "span 2", display: "flex", alignItems: "center" }}>
                      <Switch
                        label="Control center"
                        checked={showOriginalRevenue}
                        onChange={(event) => setShowOriginalRevenue(event.currentTarget.checked)}
                        size="sm"
                        color="green"
                      />
                    </Box>
                  </>
                )}
              </SimpleGrid>
            )}
          </Stack>
        ) : (
          <Stack gap="sm">
            <Group grow wrap="wrap">
              <TextInput
                placeholder="Biển số hoặc mã đoàn..."
                leftSection={<IconSearch size={16} />}
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.currentTarget.value)}
                style={{ minWidth: 200 }}
              />
              <MultiSelect
                placeholder="Chọn loại xe..."
                data={VEHICLE_TYPES}
                value={selectedGroups}
                onChange={setSelectedGroups}
                clearable
                style={{ minWidth: 200 }}
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
                style={{ minWidth: 200 }}
              />
            </Group>
            <Group grow wrap="wrap">
              <Select
                placeholder="Phương thức thanh toán"
                data={[
                  { value: "1", label: "Tiền mặt" },
                  { value: "2", label: "Chuyển khoản" },
                ]}
                value={paymentMethod}
                onChange={setPaymentMethod}
                clearable
                style={{ minWidth: 200 }}
              />
              <Select
                placeholder="Người thanh toán"
                data={PAYERS}
                value={paidBy}
                onChange={setPaidBy}
                clearable
                searchable
                style={{ minWidth: 200 }}
              />
              <DatePickerInput
                placeholder="Ngày thanh toán"
                value={paidDateAt ? new Date(paidDateAt) : null}
                onChange={handlePaidDateChange}
                clearable
                style={{ minWidth: 200 }}
              />
              <DatePickerInput
                placeholder="Ngày đến"
                value={arrivalDate ? new Date(arrivalDate) : null}
                onChange={handleArrivalDateChange}
                clearable
                style={{ minWidth: 200 }}
              />
              {role === "admin" && (
                <>
                  <Box style={{ display: "flex", alignItems: "center", paddingLeft: 10, minWidth: 200 }}>
                    <Switch
                      label="Tất cả (NB & KL)"
                      checked={showInternal}
                      onChange={(event) => setShowInternal(event.currentTarget.checked)}
                      size="sm"
                      color="blue"
                    />
                  </Box>
                  <Box style={{ display: "flex", alignItems: "center", paddingLeft: 10, minWidth: 200 }}>
                    <Switch
                      label="Control center"
                      checked={showOriginalRevenue}
                      onChange={(event) => setShowOriginalRevenue(event.currentTarget.checked)}
                      size="sm"
                      color="green"
                    />
                  </Box>
                </>
              )}
            </Group>
          </Stack>
        )}
      </Card>

      {/* Table / Card List */}
      {isMobile ? (
        /* Mobile: Card list */
        <Stack gap="sm">
          {loading ? (
            <Center py="xl"><Loader size="md" /></Center>
          ) : paginatedTransactions.length === 0 ? (
            <Center py="xl">
              <Box ta="center">
                <IconCurrencyDong size={40} color="#adb5bd" />
                <Text c="dimmed" mt={8}>Không có dữ liệu</Text>
              </Box>
            </Center>
          ) : (
            paginatedTransactions.map((t) => (
              <Card key={t._id} shadow="xs" radius="md" p="md" withBorder
                style={{ 
                  borderLeft: `4px solid ${Number(t.status) === 1 ? "#40c057" : "#fa5252"}`,
                  filter: deletingIds.includes(t._id) ? "grayscale(1) opacity(0.6)" : "none",
                  transition: "filter 0.3s ease",
                  pointerEvents: deletingIds.includes(t._id) ? "none" : "auto"
                }}
              >
                <Group justify="space-between" align="flex-start" mb={8}>
                  <Box>
                    <Text 
                      fw={700} 
                      size="sm" 
                      c="blue" 
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => openInfoModal(t)}
                    >
                      {t.code}
                    </Text>
                    <Text size="xs" c="dimmed">{t.vehicleNumber || t.licensePlate} • {t.groups || "—"}</Text>
                  </Box>
                  <Group gap={6}>
                    {!isDriverRole && (
                      <>
                        <ActionIcon
                          size="sm" variant="filled" color="blue"
                          onClick={() => openPaymentModal(t, true)}
                          title="Tính toán hoa hồng"
                        >
                          <IconCalculator size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm" variant="filled" color="red"
                          disabled={deletingIds.includes(t._id) || t.isCustomerDeleted}
                          loading={deletingIds.includes(t._id)}
                          title={t.isCustomerDeleted ? "Khách hàng đã bị xóa trên KiotViet" : "Xóa vĩnh viễn (KiotViet)"}
                          onClick={() => handleDelete(t._id, t.code, false)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                        {(canDeleteLocal || role === "admin" || role === "root") && (
                          <ActionIcon 
                            size="sm"
                            variant={t.isHidden ? "filled" : "light"} 
                            color={t.isCustomerDeleted ? "gray" : (t.isHidden ? "gray" : "orange")} 
                            disabled={deletingIds.includes(t._id) || t.isCustomerDeleted} 
                            loading={deletingIds.includes(t._id)}
                            title={t.isCustomerDeleted ? "Khách hàng đã bị xóa trên KiotViet" : (t.isHidden ? "Khôi phục hiển thị" : "Ẩn khỏi bảng trình chiếu")}
                            onClick={() => t.isHidden ? handleRestore(t._id, t.code) : handleDelete(t._id, t.code, true)}
                          >
                            {t.isHidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                          </ActionIcon>
                        )}
                        <ActionIcon
                          size="sm"
                          variant="filled"
                          color={Number(t.status) === 1 ? "gray" : "green"}
                          disabled={Number(t.status) === 1 && role !== "admin"}
                          title={Number(t.status) === 1 ? "Mở lại" : "Thanh toán"}
                          onClick={() => {
                            if (Number(t.status) === 1 && role === "admin") handleUpdateStatus(t._id, 0);
                            else if (Number(t.status) === 0) openPaymentModal(t, false);
                          }}
                        >
                          {Number(t.status) === 1 ? <IconArrowBackUp size={14} /> : (
                            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M298.9 24.31c-14.9.3-25.6 3.2-32.7 8.4l-97.3 52.1-54.1 73.59c-11.4 17.6-3.3 51.6 32.3 29.8l39-51.4c49.5-42.69 150.5-23.1 102.6 62.6-23.5 49.6-12.5 73.8 17.8 84l13.8-46.4c23.9-53.8 68.5-63.5 66.7-106.9l107.2 7.7-1-112.09-194.3-1.4zM244.8 127.7c-17.4-.3-34.5 6.9-46.9 17.3l-39.1 51.4c10.7 8.5 21.5 3.9 32.2-6.4 12.6 6.4 22.4-3.5 30.4-23.3 3.3-13.5 8.2-23 23.4-39zm-79.6 96c-.4 0-.9 0-1.3.1-3.3.7-7.2 4.2-9.8 12.2-2.7 8-3.3 19.4-.9 31.6 2.4 12.1 7.4 22.4 13 28.8 5.4 6.3 10.4 8.1 13.7 7.4 3.4-.6 7.2-4.2 9.8-12.1 2.7-8 3.4-19.5 1-31.6-2.5-12.2-7.5-22.5-13-28.8-4.8-5.6-9.2-7.6-12.5-7.6zm82.6 106.8c-7.9.1-17.8 2.6-27.5 7.3-11.1 5.5-19.8 13.1-24.5 20.1-4.7 6.9-5.1 12.1-3.6 15.2 1.5 3 5.9 5.9 14.3 6.3 8.4.5 19.7-1.8 30.8-7.3 11.1-5.5 19.8-13 24.5-20 4.7-6.9 5.1-12.2 3.6-15.2-1.5-3.1-5.9-5.9-14.3-6.3-1.1-.1-2.1-.1-3.3-.1zm-97.6 95.6c-4.7.1-9 .8-12.8 1.9-8.5 2.5-13.4 7-15 12.3-1.7 5.4 0 11.8 5.7 18.7 5.8 6.8 15.5 13.3 27.5 16.9 11.9 3.6 23.5 3.5 32.1.9 8.6-2.5 13.5-7 15.1-12.3 1.6-5.4 0-11.8-5.8-18.7-5.7-6.8-15.4-13.3-27.4-16.9-6.8-2-13.4-2.9-19.4-2.8z"></path></svg>
                          )}
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                </Group>
                <Divider mb={8} />
                <SimpleGrid cols={2} spacing={4}>
                  {role === "admin" && showOriginalRevenue && (
                    <Box>
                      <Text size="xs" c="dimmed">Doanh thu gốc</Text>
                      <Stack gap={0}>
                        <Text size="sm" fw={600}>
                          <NumberFormatter value={t.revenue} thousandSeparator="." decimalSeparator="," suffix=" đ" />
                        </Text>
                        {Number(t.status) === 1 && typeof t.revenueAtPayment === 'number' && t.revenue > t.revenueAtPayment && (
                          <Text size="10px" c="green.7" fw={700}>
                            + <NumberFormatter value={t.revenue - t.revenueAtPayment} thousandSeparator="." decimalSeparator="," suffix=" đ" />
                          </Text>
                        )}
                      </Stack>
                    </Box>
                  )}
                  <Box>
                    <Text size="xs" c="dimmed">DOANH THU</Text>
                    <Text size="sm" fw={700} c="blue">
                      <NumberFormatter value={(Number(t.status) === 1 && typeof t.reducedRevenueAtPayment === 'number') ? t.reducedRevenueAtPayment : getReducedRevenue(t.revenue, t.groups, reductionRules)} thousandSeparator="." decimalSeparator="," suffix=" đ" />
                    </Text>
                  </Box>
                  <Box>
                    <Text size="xs" c="dimmed">Hoa hồng</Text>
                    <Stack gap={0}>
                      <Text size="sm" fw={700} c="blue">
                        <NumberFormatter value={t.profit} thousandSeparator="." decimalSeparator="," suffix=" đ" />
                      </Text>
                      {Number(t.extraRevenue) > 0 && (
                        <Text size="10px" c="dimmed" fw={500}>
                          Gốc: <NumberFormatter 
                                value={calculateProfit(getReducedRevenue(t.revenue || 0, t.groups || "", reductionRules), t.groups || "", profitConfigs, 0)} 
                                thousandSeparator="." 
                                decimalSeparator="," 
                                suffix=" đ" 
                              />
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </SimpleGrid>
                <Group mt={8} gap={6}>
                  <Badge
                    color={Number(t.status) === 1 ? "green" : "red"}
                    variant="light" size="sm"
                    style={{ textTransform: "none" }}
                  >
                    {Number(t.status) === 1 ? "Đã thanh toán" : "Chưa thanh toán"}
                  </Badge>
                  <Badge
                    color={Number(t.paymentMethod) === 1 ? "orange" : Number(t.paymentMethod) === 2 ? "blue" : "gray"}
                    variant="light" size="sm"
                    style={{ textTransform: "none" }}
                  >
                    {Number(t.paymentMethod) === 1 ? "Tiền mặt" : Number(t.paymentMethod) === 2 ? "Chuyển khoản" : "Chưa rõ"}
                  </Badge>
                  {t.isHidden && (
                    <Badge color="gray" variant="filled" size="xs" style={{ textTransform: "none" }}>
                      Đã ẩn
                    </Badge>
                  )}
                  {t.arrivalDate && (
                    <Text size="xs" c="dimmed">📅 {dayjs(t.arrivalDate).tz().format("DD/MM")}</Text>
                  )}
                </Group>
              </Card>
            ))
          )}
          {/* Mobile Pagination */}
          {totalPages > 1 && (
            <Center>
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            </Center>
          )}
          <Text size="xs" c="dimmed" ta="center">
            {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, transactions.length)} / {transactions.length} bản ghi
          </Text>
        </Stack>
      ) : (
        /* Desktop: Full table */
        <Card shadow="xs" radius="md" p={0} style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
          <Box style={{ overflowX: "auto", width: "100%", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>
            {loading ? (
              <Center py="xl"><Loader size="md" /></Center>
            ) : (
              <Table striped highlightOnHover style={{ minWidth: 1600, tableLayout: "auto" }}>
                <Table.Thead>
                  <Table.Tr style={{ background: "#f8f9fa", whiteSpace: "nowrap" }}>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Mã đoàn</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Biển số</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Loại xe</Table.Th>
                    {role === "admin" && showOriginalRevenue && <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Doanh thu gốc</Table.Th>}
                    <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>DOANH THU</Table.Th>
                    <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Phát sinh</Table.Th>
                    <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Hoa hồng</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Trạng thái</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Phương thức</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Thanh toán</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Người thanh toán</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>NV Cập nhật</Table.Th>
                    <Table.Th style={{ whiteSpace: "nowrap" }}>Ngày đến</Table.Th>
                    <Table.Th style={{ textAlign: "center", whiteSpace: "nowrap", position: "sticky", right: 0, background: "#f8f9fa", zIndex: 2, boxShadow: "-2px 0 5px rgba(0,0,0,0.05)" }}>
                      Thao tác
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {paginatedTransactions.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={13}>
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
                      <Table.Tr 
                        key={t._id}
                        style={{ 
                          filter: deletingIds.includes(t._id) ? "grayscale(1) opacity(0.5)" : "none",
                          transition: "filter 0.3s ease",
                          pointerEvents: deletingIds.includes(t._id) ? "none" : "auto",
                          backgroundColor: deletingIds.includes(t._id) ? "#f8f9fa" : "transparent"
                        }}
                      >
                        <Table.Td style={{ whiteSpace: "nowrap" }}>
                          <Text 
                            fw={600} 
                            size="sm" 
                            c="blue" 
                            style={{ cursor: "pointer", textDecoration: "underline" }}
                            onClick={() => openInfoModal(t)}
                          >
                            {t.code}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>{t.vehicleNumber || t.licensePlate}</Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>{t.groups || "—"}</Table.Td>
                        {role === "admin" && showOriginalRevenue && (
                          <Table.Td style={{ textAlign: "right" }}>
                            <Stack gap={0} align="flex-end">
                              <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                                <NumberFormatter value={t.revenue} thousandSeparator="." decimalSeparator="," />
                              </Text>
                              {Number(t.status) === 1 && typeof t.revenueAtPayment === 'number' && t.revenue > t.revenueAtPayment && (
                                <Text size="10px" c="green.7" fw={700}>
                                  + <NumberFormatter value={t.revenue - t.revenueAtPayment} thousandSeparator="." decimalSeparator="," />
                                </Text>
                              )}
                            </Stack>
                          </Table.Td>
                        )}
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" fw={600} c="blue.7" style={{ fontVariantNumeric: "tabular-nums" }}>
                            <NumberFormatter value={(Number(t.status) === 1 && typeof t.reducedRevenueAtPayment === 'number') ? t.reducedRevenueAtPayment : getReducedRevenue(t.revenue, t.groups, reductionRules)} thousandSeparator="." decimalSeparator="," />
                          </Text>
                        </Table.Td>
                        <Table.Td 
                          style={{ textAlign: "right", cursor: (!isDriverRole && Number(t.status) === 1) ? "pointer" : "default" }} 
                          className={(!isDriverRole && Number(t.status) === 1) ? "hover-cell" : ""}
                          onClick={() => !isDriverRole && Number(t.status) === 1 && openExtraRevenueModal(t)}
                          title={isDriverRole ? undefined : (Number(t.status) === 1 ? "Click để nhập doanh thu phát sinh" : "Cần thanh toán trước khi nhập phát sinh")}
                        >
                          <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <Text size="sm" fw={((t.extraRevenue || 0) + (t.extraFee || 0)) > 0 ? 600 : 400} c={((t.extraRevenue || 0) + (t.extraFee || 0)) > 0 ? "pink.7" : "inherit"} style={{ fontVariantNumeric: "tabular-nums" }}>
                              <NumberFormatter value={(t.extraRevenue || 0) + (t.extraFee || 0)} thousandSeparator="." decimalSeparator="," />
                            </Text>
                            {!isDriverRole && Number(t.status) === 1 && (
                              <Text size="10px" c="blue" fw={500} style={{ textDecoration: 'underline' }}>Sửa</Text>
                            )}
                          </Box>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Stack gap={0} align="flex-end">
                            <Text size="sm" fw={700} c="blue" style={{ fontVariantNumeric: "tabular-nums" }}>
                              <NumberFormatter value={t.profit} thousandSeparator="." decimalSeparator="," />
                            </Text>
                            {Number(t.extraRevenue) > 0 && (
                              <Text size="10px" c="dimmed" fw={500} style={{ fontVariantNumeric: "tabular-nums" }}>
                                Gốc: <NumberFormatter 
                                  value={calculateProfit(getReducedRevenue(t.revenue || 0, t.groups || "", reductionRules), t.groups || "", profitConfigs, 0)} 
                                  thousandSeparator="." 
                                  decimalSeparator="," 
                                />
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={Number(t.status) === 1 ? "green" : "red"} variant="light" size="md" style={{ textTransform: "none", fontSize: "13px", padding: "4px 8px", height: "auto", minHeight: "26px", lineHeight: "1.5", overflow: "visible", whiteSpace: "nowrap" }}>
                            {Number(t.status) === 1 ? "Đã thanh toán" : "Chưa thanh toán"}
                          </Badge>
                          {t.isHidden && (
                            <Badge color="gray" variant="filled" size="sm" ml={4} style={{ textTransform: "none" }}>
                              Đã ẩn
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={Number(t.paymentMethod) === 1 ? "orange" : Number(t.paymentMethod) === 2 ? "blue" : "gray"} variant="light" size="md" style={{ textTransform: "none", fontSize: "13px", padding: "4px 8px", height: "auto", minHeight: "26px", lineHeight: "1.5", overflow: "visible", whiteSpace: "nowrap" }}>
                            {Number(t.paymentMethod) === 1 ? "Tiền mặt" : Number(t.paymentMethod) === 2 ? "Chuyển khoản" : "Chưa rõ"}
                          </Badge>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>
                          <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>{t.paidDateAt ? dayjs(t.paidDateAt).tz().format("DD/MM/YYYY HH:mm") : "—"}</Text>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>{t.paidBy || "—"}</Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>{t.updatedBy || "—"}</Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap" }}>
                          <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {(t.arrivalDate || t.customerModifiedDate || t.updatedAt) ? dayjs(t.arrivalDate || t.customerModifiedDate || t.updatedAt).tz().format("DD/MM/YYYY HH:mm") : "—"}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: "nowrap", position: "sticky", right: 0, background: "white", zIndex: 1, boxShadow: "-2px 0 5px rgba(0,0,0,0.05)" }}>
                          {isDriverRole ? (
                            <Text size="sm" c="dimmed" ta="center">—</Text>
                          ) : (
                            <Group gap="xs" wrap="nowrap" align="center" justify="flex-start">
                              <ActionIcon variant="filled" color="blue" onClick={() => openPaymentModal(t, true)} title="Thông tin & Tính toán hoa hồng">
                                <IconCalculator size={18} />
                              </ActionIcon>
                              {(role === "admin" || role === "root" || role === "manager") && (
                                <ActionIcon 
                                  variant="filled" 
                                  color="red" 
                                  disabled={deletingIds.includes(t._id) || t.isCustomerDeleted} 
                                  loading={deletingIds.includes(t._id)}
                                  title={t.isCustomerDeleted ? "Khách hàng đã bị xóa trên KiotViet" : "Xóa vĩnh viễn (KiotViet)"}
                                  onClick={() => handleDelete(t._id, t.code, false)}
                                >
                                  <IconTrash size={18} />
                                </ActionIcon>
                              )}
                              {(canDeleteLocal || role === "admin" || role === "root") && (
                                <ActionIcon 
                                  variant={t.isHidden ? "filled" : "light"} 
                                  color={t.isCustomerDeleted ? "gray" : (t.isHidden ? "gray" : "orange")} 
                                  disabled={deletingIds.includes(t._id) || t.isCustomerDeleted} 
                                  loading={deletingIds.includes(t._id)}
                                  title={t.isCustomerDeleted ? "Khách hàng đã bị xóa trên KiotViet" : (t.isHidden ? "Khôi phục hiển thị (Hiện lại trên bảng trình chiếu)" : "Ẩn khỏi bảng trình chiếu")}
                                  onClick={() => t.isHidden ? handleRestore(t._id, t.code) : handleDelete(t._id, t.code, true)}
                                >
                                  {t.isHidden ? <IconEye size={18} /> : <IconEyeOff size={18} />}
                                </ActionIcon>
                              )}
                              <ActionIcon
                                variant="filled"
                                color={Number(t.status) === 1 ? "gray" : "green"}
                                disabled={Number(t.status) === 1 && role !== "admin"}
                                title={Number(t.status) === 1 ? "Mở lại (Admin)" : "Xác nhận Thanh toán"}
                                onClick={() => {
                                  if (Number(t.status) === 1 && role === "admin") handleUpdateStatus(t._id, 0);
                                  else if (Number(t.status) === 0) openPaymentModal(t, false);
                                }}
                              >
                                {Number(t.status) === 1 ? (
                                  <IconArrowBackUp size={18} />
                                ) : (
                                  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M298.9 24.31c-14.9.3-25.6 3.2-32.7 8.4l-97.3 52.1-54.1 73.59c-11.4 17.6-3.3 51.6 32.3 29.8l39-51.4c49.5-42.69 150.5-23.1 102.6 62.6-23.5 49.6-12.5 73.8 17.8 84l13.8-46.4c23.9-53.8 68.5-63.5 66.7-106.9l107.2 7.7-1-112.09-194.3-1.4zM244.8 127.7c-17.4-.3-34.5 6.9-46.9 17.3l-39.1 51.4c10.7 8.5 21.5 3.9 32.2-6.4 12.6 6.4 22.4-3.5 30.4-23.3 3.3-13.5 8.2-23 23.4-39zm-79.6 96c-.4 0-.9 0-1.3.1-3.3.7-7.2 4.2-9.8 12.2-2.7 8-3.3 19.4-.9 31.6 2.4 12.1 7.4 22.4 13 28.8 5.4 6.3 10.4 8.1 13.7 7.4 3.4-.6 7.2-4.2 9.8-12.1 2.7-8 3.4-19.5 1-31.6-2.5-12.2-7.5-22.5-13-28.8-4.8-5.6-9.2-7.6-12.5-7.6zm82.6 106.8c-7.9.1-17.8 2.6-27.5 7.3-11.1 5.5-19.8 13.1-24.5 20.1-4.7 6.9-5.1 12.1-3.6 15.2 1.5 3 5.9 5.9 14.3 6.3 8.4.5 19.7-1.8 30.8-7.3 11.1-5.5 19.8-13 24.5-20 4.7-6.9 5.1-12.2 3.6-15.2-1.5-3.1-5.9-5.9-14.3-6.3-1.1-.1-2.1-.1-3.3-.1zm-97.6 95.6c-4.7.1-9 .8-12.8 1.9-8.5 2.5-13.4 7-15 12.3-1.7 5.4 0 11.8 5.7 18.7 5.8 6.8 15.5 13.3 27.5 16.9 11.9 3.6 23.5 3.5 32.1.9 8.6-2.5 13.5-7 15.1-12.3 1.6-5.4 0-11.8-5.8-18.7-5.7-6.8-15.4-13.3-27.4-16.9-6.8-2-13.4-2.9-19.4-2.8z"></path></svg>
                                )}
                              </ActionIcon>
                            </Group>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            )}
          </Box>
          <Box px="md" py="xs" style={{ borderTop: "1px solid #f1f3f5" }}>
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Text size="xs" c="dimmed">
                Hiển thị {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, transactions.length)} / {transactions.length} bản ghi
              </Text>
              {totalPages > 1 && (
                <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
              )}
            </Group>
          </Box>
        </Card>
      )}

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

      <Modal
        opened={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        title={<Text fw={700} size="xl" c="gray.8" style={{ paddingLeft: '12px' }}>Thông tin giao dịch chi tiết</Text>}
        centered
        radius="lg"
        size="1100px"
        padding={0}
        styles={{
          header: {
            padding: '20px 24px',
            borderBottom: '1px solid #f1f3f5',
          },
          body: {
            padding: 0
          }
        }}
      >
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
          .hover-cell:hover {
            background-color: #f0f7ff !important;
          }
        `}</style>

        {infoTx && (
          <Box p="xl" bg="rgba(248, 249, 250, 0.8)">
            <Grid gap={40}>
              {/* Cột trái: TỔNG QUAN ĐOÀN (4/12) */}
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Stack gap="lg">
                  <Group gap="xs">
                    <Box w={6} h={20} bg="blue.6" style={{ borderRadius: 10 }} />
                    <Text fw={700} tt="uppercase" size="xs" c="gray.7" lts={1}>Tổng quan đoàn</Text>
                  </Group>
                  
                  <Card withBorder radius="lg" p={0} shadow="sm">
                    <Stack gap={0}>
                      <Group justify="space-between" align="center" p="md" style={{ borderBottom: "1px solid #f1f3f5" }} bg="gray.0">
                        <Text size="sm" c="dimmed" fw={500}>Mã đoàn</Text>
                        <Badge size="lg" radius="md" variant="light" color="blue" h={32} style={{ display: 'flex', alignItems: 'center' }}>
                          {infoTx.code}
                        </Badge>
                      </Group>
                      
                      <Group justify="space-between" align="center" p="md" style={{ borderBottom: "1px solid #f1f3f5" }}>
                        <Text size="sm" c="dimmed" fw={500}>Biển số / Xe</Text>
                        <Text size="sm" fw={600} c="gray.8">{infoTx.vehicleNumber || infoTx.licensePlate}</Text>
                      </Group>

                      <Group justify="space-between" align="center" p="md" style={{ borderBottom: "1px solid #f1f3f5" }}>
                        <Text size="sm" c="dimmed" fw={500}>Doanh thu giảm</Text>
                        <Text size="sm" fw={600} c="blue.7">
                          <NumberFormatter value={(Number(infoTx.status) === 1 && typeof infoTx.reducedRevenueAtPayment === 'number') ? infoTx.reducedRevenueAtPayment : getReducedRevenue(infoTx.revenue, infoTx.groups, reductionRules)} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Group>

                      <Group justify="space-between" align="center" p="md" style={{ borderBottom: "1px solid #f1f3f5" }}>
                        <Text size="sm" c="dimmed" fw={500}>Phát sinh</Text>
                        <Text size="sm" fw={600} c="gray.8">
                          <NumberFormatter value={(infoTx.extraRevenue || 0) + (infoTx.extraFee || 0)} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Group>

                      <Group justify="space-between" align="center" p="md" style={{ borderBottom: "1px solid #f1f3f5" }}>
                        <Text size="sm" c="dimmed" fw={500}>Hoa hồng</Text>
                        <Text size="sm" fw={600} c="gray.8">
                          <NumberFormatter value={infoTx.profit} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Group>

                      <Group justify="space-between" align="center" p="md">
                        <Text size="sm" c="dimmed" fw={500}>Ngày đến</Text>
                        <Text size="sm" fw={500} c="gray.6">
                          {dayjs(infoTx.arrivalDate || infoTx.customerModifiedDate || infoTx.updatedAt).tz().format("DD/MM/YYYY HH:mm")}
                        </Text>
                      </Group>
                    </Stack>
                  </Card>
                </Stack>
              </Grid.Col>

              {/* Cột phải: HÓA ĐƠN LẺ (8/12) */}
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Stack gap="lg">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Box w={6} h={20} bg="orange.5" style={{ borderRadius: 10 }} />
                      <Text fw={700} tt="uppercase" size="xs" c="gray.7" lts={1}>Hóa đơn lẻ từ KiotViet</Text>
                    </Group>
                    <Badge radius="xl" variant="light" color="blue" px="md" h={28} leftSection={<IconTable size={14} style={{ marginTop: -2 }} />}>
                      {invoiceDetails.length} HÓA ĐƠN
                    </Badge>
                  </Group>

                  <Card withBorder radius="lg" p={0} shadow="sm">
                    <Box className="custom-scrollbar" style={{ maxHeight: "450px", overflowY: "auto" }}>
                      <Table striped highlightOnHover stickyHeader verticalSpacing="md" horizontalSpacing="lg">
                        <Table.Thead>
                          <Table.Tr bg="gray.0">
                            <Table.Th style={{ whiteSpace: "nowrap" }}><Text fz="xs" tt="uppercase" fw={700} c="dimmed">Mã HĐ</Text></Table.Th>
                            <Table.Th style={{ whiteSpace: "nowrap" }}><Text fz="xs" tt="uppercase" fw={700} c="dimmed">Giờ bán</Text></Table.Th>
                            <Table.Th style={{ whiteSpace: "nowrap" }}><Text fz="xs" tt="uppercase" fw={700} c="dimmed">Nhân viên</Text></Table.Th>
                            <Table.Th style={{ whiteSpace: "nowrap" }}><Text fz="xs" tt="uppercase" fw={700} c="dimmed">Sản phẩm</Text></Table.Th>
                            <Table.Th style={{ textAlign: "right", whiteSpace: "nowrap" }}><Text fz="xs" tt="uppercase" fw={700} c="dimmed">Tổng tiền</Text></Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {loadingDetails ? (
                            <Table.Tr>
                              <Table.Td colSpan={5}>
                                <Center py="xl">
                                  <Stack align="center" gap="sm">
                                    <Loader size="md" variant="dots" />
                                    <Text size="sm" c="dimmed">Đang tải chi tiết...</Text>
                                  </Stack>
                                </Center>
                              </Table.Td>
                            </Table.Tr>
                          ) : invoiceDetails.length > 0 ? (
                            invoiceDetails.map((inv, idx) => (
                              <Table.Tr key={inv.code || idx}>
                                <Table.Td style={{ whiteSpace: "nowrap" }}>
                                  <Group gap={6} wrap="nowrap">
                                    <IconFileSpreadsheet size={16} color="#4dabf7" style={{ flexShrink: 0 }} />
                                    <Text size="sm" fw={600} c="blue.6" style={{ cursor: "pointer" }}>
                                      {inv.code}{infoTx.status === 1 && infoTx.paidDateAt && dayjs(inv.purchaseDate).isAfter(dayjs(infoTx.paidDateAt)) ? "-s" : ""}
                                    </Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td style={{ whiteSpace: "nowrap" }}><Text size="sm" fw={500} c="gray.7">{dayjs(inv.purchaseDate).format("HH:mm:ss")}</Text></Table.Td>
                                <Table.Td style={{ whiteSpace: "nowrap" }}><Text size="sm" c="gray.8" fw={500}>{inv.soldByName || "—"}</Text></Table.Td>
                                <Table.Td>
                                  <Text size="sm" c="gray.7" style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {inv.mainProducts || "—"}
                                  </Text>
                                </Table.Td>
                                <Table.Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                  <Text fw={700} size="sm" color="gray.9" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    <NumberFormatter value={inv.total} thousandSeparator="." decimalSeparator="," />
                                  </Text>
                                </Table.Td>
                              </Table.Tr>
                            ))
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={5}>
                                <Center py="xl">
                                  <Text size="sm" c="dimmed">Không tìm thấy hóa đơn lẻ trong ngày</Text>
                                </Center>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </Table>
                    </Box>
                  </Card>

                  {/* Summary Footer */}
                  {!loadingDetails && invoiceDetails.length > 0 && (
                    <Card withBorder radius="lg" p="md" bg="gray.0" shadow="xs">
                      <Group justify="flex-end" gap="xl">
                        <Text size="sm" fw={500} c="dimmed">
                          Tổng cộng ({invoiceDetails.length} hiển thị):
                        </Text>
                        <Text size="lg" fw={800} c="blue.7">
                          <NumberFormatter 
                            value={invoiceDetails.reduce((acc, curr) => acc + curr.total, 0)} 
                            thousandSeparator="." 
                            decimalSeparator="," 
                          /> đ
                        </Text>
                      </Group>
                    </Card>
                  )}
                </Stack>
              </Grid.Col>
            </Grid>
          </Box>
        )}

        <Group justify="flex-end" p="xl" pt={0}>
          <Button variant="subtle" color="gray" size="md" onClick={() => setInfoModalOpen(false)}>
            Đóng
          </Button>
        </Group>
      </Modal>

      {/* Modal Nhập doanh thu phát sinh */}
      <Modal
        opened={extraRevenueModalOpen}
        onClose={() => setExtraRevenueModalOpen(false)}
        title={<Text fw={700}>Nhập doanh thu phát sinh</Text>}
        centered
        radius="md"
        size="sm"
      >
        {selectedTransaction && (
          <Stack gap="md">
            <Box p="sm" bg="gray.0" style={{ borderRadius: '8px' }}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">Đoàn xe</Text>
              <Text fw={700} size="sm">{selectedTransaction.code} ({selectedTransaction.vehicleNumber || selectedTransaction.licensePlate})</Text>
            </Box>

            <NumberInput
              label="Số tiền phát sinh (VNĐ)"
              placeholder="Ví dụ: 1000000"
              value={newExtraRevenue}
              onChange={(val) => setNewExtraRevenue(Number(val))}
              thousandSeparator="."
              decimalSeparator=","
              suffix=" đ"
              min={0}
              hideControls
              autoFocus
              size="md"
            />

            <Box p="sm" bg="blue.0" style={{ borderRadius: '8px', border: '1px dashed #228be6' }}>
              {role === "admin" && (
                <>
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" c="dimmed">Doanh thu gốc:</Text>
                    <Text size="xs" fw={600}><NumberFormatter value={selectedTransaction.revenue} thousandSeparator="." decimalSeparator="," /> đ</Text>
                  </Group>
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" c="dimmed">Hoa hồng gốc:</Text>
                    <Text size="xs" fw={600}><NumberFormatter value={calculateProfit(getReducedRevenue(selectedTransaction.revenue || 0, selectedTransaction.groups || "", reductionRules), selectedTransaction.groups || "", profitConfigs, 0)} thousandSeparator="." decimalSeparator="," /> đ</Text>
                  </Group>
                </>
              )}
              {role !== "admin" && (
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">DOANH THU:</Text>
                  <Text size="xs" fw={600} c="blue"><NumberFormatter value={(Number(selectedTransaction.status) === 1 && typeof selectedTransaction.reducedRevenueAtPayment === 'number') ? selectedTransaction.reducedRevenueAtPayment : getReducedRevenue(selectedTransaction.revenue || 0, selectedTransaction.groups || "", reductionRules)} thousandSeparator="." decimalSeparator="," /> đ</Text>
                </Group>
              )}
              <Divider my={8} />
              <Group justify="space-between">
                <Text size="sm" fw={700}>Hoa hồng dự kiến mới:</Text>
                <Text size="sm" fw={800} c="blue">
                  <NumberFormatter 
                    value={calculateProfit((Number(selectedTransaction.status) === 1 && typeof selectedTransaction.reducedRevenueAtPayment === 'number') ? selectedTransaction.reducedRevenueAtPayment : getReducedRevenue((Number(selectedTransaction.status) === 1 && typeof selectedTransaction.revenueAtPayment === 'number') ? selectedTransaction.revenueAtPayment : (selectedTransaction.revenue || 0), selectedTransaction.groups || "", reductionRules), selectedTransaction.groups || "", profitConfigs, newExtraRevenue)} 
                    thousandSeparator="." 
                    decimalSeparator="," 
                    suffix=" đ" 
                  />
                </Text>
              </Group>
            </Box>

            <Group grow mt="md">
              <Button variant="light" color="gray" onClick={() => setExtraRevenueModalOpen(false)}>Hủy</Button>
              <Button 
                color="blue" 
                onClick={handleUpdateExtraRevenue} 
                loading={updatingExtra}
              >
                Cập nhật
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Modal Xác nhận xóa/ẩn */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={<Text fw={700} size="lg">{deleteTarget?.isLocal ? "Xác nhận Ẩn khách hàng" : "Xác nhận Xóa vĩnh viễn"}</Text>}
        centered
        radius="md"
        size="md"
      >
        <Stack>
          <Box p="md" bg={deleteTarget?.isLocal ? "orange.0" : "red.0"} style={{ borderRadius: '8px' }}>
            <Text size="sm" c={deleteTarget?.isLocal ? "orange.9" : "red.9"} fw={500}>
              {deleteTarget?.isLocal 
                ? `Bạn có chắc muốn xóa (Ẩn) khách hàng [${deleteTarget.code}] khỏi danh sách?`
                : `Bạn có chắc muốn xóa đoàn xe [${deleteTarget?.code}]?`
              }
            </Text>
            <Text size="xs" mt={4} c="dimmed">
              {deleteTarget?.isLocal 
                ? "Hành động này KHÔNG xóa trên KiotViet, chỉ ẩn khỏi phần mềm này."
                : "Hành động này sẽ xóa khách hàng tương ứng TRÊN KIOTVIET và không thể hoàn tác."
              }
            </Text>
          </Box>
          
          <Group grow mt="xs">
            <Button variant="light" color="gray" onClick={() => setDeleteModalOpen(false)}>Hủy bỏ</Button>
            <Button 
              color={deleteTarget?.isLocal ? "orange" : "red"} 
              leftSection={<IconTrash size={16} />}
              onClick={executeDelete}
            >
              {deleteTarget?.isLocal ? "Đồng ý Ẩn" : "Đồng ý Xóa"}
            </Button>
          </Group>
        </Stack>
      </Modal>

    </Box>
  );
}
