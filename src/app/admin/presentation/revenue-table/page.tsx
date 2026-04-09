"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Box, Title, Text, NumberFormatter, Card, Group,
  SimpleGrid, Image,
} from "@mantine/core";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";

interface Transaction {
  _id: string;
  code: string;
  vehicleNumber: string;
  revenue: number;
}

export default function PresentationPage() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lấy ngày từ params nếu có
  const dateParam = searchParams.get("date");
  const parsedSelectedDate = dateParam ? new Date(dateParam) : new Date();

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (parsedSelectedDate) {
        params.set("paidDateFrom", dayjs(parsedSelectedDate).startOf("day").toISOString());
        params.set("paidDateTo", dayjs(parsedSelectedDate).endOf("day").toISOString());
      }
      
      const res = await fetch(`/api/revenue?${params}`);
      const data = await res.json();
      const txs: Transaction[] = (data.transactions || [])
        .sort((a: Transaction, b: Transaction) => (b.revenue || 0) - (a.revenue || 0));
      setTransactions(txs);
      setTotal(txs.reduce((sum: number, t: Transaction) => sum + (t.revenue || 0), 0));
    } catch (e) {
      console.error("Fetch error:", e);
    }
  }, [parsedSelectedDate]);

  useEffect(() => { 
    setMounted(true);
    fetchData(); 
    const interval = setInterval(fetchData, 60000); // Làm mới mỗi phút
    return () => clearInterval(interval);
  }, [fetchData]);

  // Tự động cuộn
  useEffect(() => {
    if (!scrollRef.current) return;
    const element = scrollRef.current;
    const scrollInterval = setInterval(() => {
      if (element.scrollHeight <= element.clientHeight) return;
      element.scrollTop += 1;
      if (element.scrollTop + element.clientHeight >= element.scrollHeight - 1) {
        setTimeout(() => { element.scrollTop = 0; }, 3000);
      }
    }, 50);
    return () => clearInterval(scrollInterval);
  }, [transactions]);

  const columns: Transaction[][] = [[], [], [], []];
  transactions.forEach((t, i) => {
    columns[i % 4].push(t);
  });

  return (
    <Box 
      style={{ 
        minHeight: "100vh", 
        width: "100%",
        backgroundImage: "url('https://images.unsplash.com/photo-1505118380757-91f5f5632de0?q=80&w=2000&auto=format&fit=crop')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        padding: "30px",
        color: "white",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Box style={{ 
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, 
        background: "rgba(0,0,0,0.4)", zIndex: 0 
      }} />

      <Box style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <Group justify="space-between" align="center" mb={40}>
          <Group gap="xl">
            <Box p={10} style={{ background: "white", borderRadius: "15px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
              <Image src="/logo.png" alt="Logo" w={100} h={100} fit="contain" />
            </Box>
            <Box>
              <Title order={1} style={{ fontSize: "3.2rem", letterSpacing: "1px", textShadow: "3px 3px 10px rgba(0,0,0,0.8)" }}>
                ĐẦU MỐI HẢI SẢN ĐÔNG DƯƠNG
              </Title>
              <Text c="yellow.4" fw={800} size="2.2rem" style={{ textShadow: "2px 2px 5px rgba(0,0,0,0.8)" }}>
                KÍNH CHÀO QUÝ KHÁCH!
              </Text>
            </Box>
          </Group>

          <Box ta="right">
             <Title order={2} mb={10} style={{ fontSize: "2rem", textShadow: "2px 2px 5px rgba(0,0,0,0.5)" }}>
               DOANH THU NGÀY {dayjs(parsedSelectedDate).format("DD/MM/YYYY")}
             </Title>
             <Group gap="40px" justify="flex-end">
               <Box>
                 <Text size="md" tt="uppercase" opacity={0.9} fw={600}>Số chuyến</Text>
                 <Text size="3.5rem" fw={900} c="yellow.4" style={{ lineHeight: 1 }}>{transactions.length}</Text>
               </Box>
               <Box>
                 <Text size="md" tt="uppercase" opacity={0.9} fw={600}>Tổng doanh thu</Text>
                 <Text size="3.5rem" fw={900} c="green.4" style={{ lineHeight: 1 }}>
                   <NumberFormatter value={total} thousandSeparator="." decimalSeparator="," suffix=" đ" />
                 </Text>
               </Box>
             </Group>
          </Box>
        </Group>

        {/* Table Area */}
        <Box 
          ref={scrollRef}
          style={{ 
            flex: 1, 
            overflowY: "auto", 
            paddingBottom: 60,
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
        >
          <SimpleGrid cols={4} spacing="xl">
            {columns.map((col: Transaction[], colIdx: number) => (
              <Box key={colIdx} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {col.map((t) => (
                  <Card 
                    key={t._id} 
                    shadow="xl" 
                    p="md" 
                    radius="lg"
                    style={{ 
                      background: "rgba(255, 255, 255, 0.12)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "white",
                      transition: "transform 0.2s ease"
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Box>
                        <Text size="sm" fw={800} c="yellow.3" mb={4}>{t.code}</Text>
                        <Text fw={700} size="xl" style={{ letterSpacing: "1px" }}>{t.vehicleNumber || "-"}</Text>
                      </Box>
                      <Box ta="right">
                        <Text size="1.8rem" fw={900} c="green.3">
                          <NumberFormatter value={t.revenue} thousandSeparator="." decimalSeparator="," />
                        </Text>
                      </Box>
                    </Group>
                  </Card>
                ))}
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      </Box>
      
      <Box style={{ position: "fixed", bottom: 15, left: 30, opacity: 0.5, zIndex: 10 }}>
        <Text size="sm">Hệ thống quản lý Hải Sản Đông Dương • Cập nhật: {mounted ? new Date().toLocaleTimeString("vi-VN") : "--:--:--"}</Text>
      </Box>
    </Box>
  );
}
