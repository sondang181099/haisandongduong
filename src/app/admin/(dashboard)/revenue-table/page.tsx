"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Title, Text, NumberFormatter, Card, Group,
  SimpleGrid, Center, Loader, Badge, Button,
} from "@mantine/core";
import { MonthPickerInput, DatePickerInput } from "@mantine/dates";
import { IconScreenShare } from "@tabler/icons-react";
import dayjs from "dayjs";

interface Transaction {
  _id: string;
  code: string;
  vehicleNumber: string;
  revenue: number;
}

export default function RevenueTableAdminPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) {
        params.set("paidDateFrom", dayjs(selectedDate).startOf("day").toISOString());
        params.set("paidDateTo", dayjs(selectedDate).endOf("day").toISOString());
      } else {
        params.set("paidDateFrom", dayjs().startOf("day").toISOString());
        params.set("paidDateTo", dayjs().endOf("day").toISOString());
      }
      
      const res = await fetch(`/api/revenue?${params}`);
      const data = await res.json();
      const txs: Transaction[] = (data.transactions || [])
        .sort((a: Transaction, b: Transaction) => (b.revenue || 0) - (a.revenue || 0));
      setTransactions(txs);
      setTotal(txs.reduce((sum: number, t: Transaction) => sum + (t.revenue || 0), 0));
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Split into 4 columns
  const columns: Transaction[][] = [[], [], [], []];
  transactions.forEach((t, i) => {
    columns[i % 4].push(t);
  });

  const parsedSelectedDate = selectedDate ? new Date(selectedDate) : null;

  const handleOpenPresentation = () => {
    const params = new URLSearchParams();
    if (selectedDate) {
      params.set("date", selectedDate.toISOString());
    }
    window.open(`/admin/presentation/revenue-table?${params.toString()}`, "_blank");
  };

  return (
    <Box>
      <Group justify="space-between" mb="lg" align="flex-start">
        <Box>
          <Group align="center" mb={4}>
            <Title order={3}>
              Bảng doanh thu {parsedSelectedDate ? `(Ngày ${dayjs(parsedSelectedDate).format("DD/MM/YYYY")})` : "(Hôm nay)"}
            </Title>
            <DatePickerInput
              placeholder="Chọn ngày"
              value={selectedDate}
              onChange={(val: any) => setSelectedDate(val)}
              size="xs"
              clearable
              style={{ width: 140 }}
            />
          </Group>
          <Group gap="sm">
            <Badge size="lg" variant="light" color="blue">
              {transactions.length} chuyến
            </Badge>
            <Badge size="lg" variant="light" color="green">
              Tổng: <NumberFormatter value={total} thousandSeparator="." decimalSeparator="," suffix=" đ" />
            </Badge>
          </Group>
        </Box>
        <Button 
          leftSection={<IconScreenShare size={18} />} 
          color="blue" 
          variant="filled"
          onClick={handleOpenPresentation}
        >
          Trình chiếu
        </Button>
      </Group>

      {loading ? (
        <Center py="xl"><Loader size="md" /></Center>
      ) : (
        <SimpleGrid cols={4} spacing="md">
          {columns.map((col: Transaction[], colIdx: number) => (
            <Card key={colIdx} shadow="xs" radius="md" p={0}>
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
                  {["Số đoàn", "Biển số", "Doanh thu"].map((h, i) => (
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
                      <NumberFormatter value={t.revenue} thousandSeparator="." decimalSeparator="," />
                    </Text>
                  </Box>
                </Box>
              ))}
              {col.length === 0 && (
                <Center py="md">
                  <Text size="xs" c="dimmed">Trống</Text>
                </Center>
              )}
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
