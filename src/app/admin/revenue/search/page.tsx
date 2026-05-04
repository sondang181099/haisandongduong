"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Group, TextInput, Title, Table, Text, 
  Card, Loader, Center, Stack, NumberFormatter, 
  Container, Image as MantineImage, ScrollArea,
} from "@mantine/core";
import { IconSearch, IconCurrencyDong } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useSession } from "next-auth/react";

interface Transaction {
  _id: string;
  code: string;
  licensePlate: string;
  vehicleNumber?: string;
  revenue: number;
}

export default function RevenueSearchPage() {
  const { status: sessionStatus } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async (search: string) => {
    if (!search) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("licensePlate", search);
      // Giới hạn kết quả để tối giản
      const res = await fetch(`/api/revenue?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      console.error("Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchData]);

  if (sessionStatus === "loading") {
    return <Center h="100vh"><Loader /></Center>;
  }

  return (
    <Box 
      p={{ base: "sm", sm: "md" }}
      style={{ 
        minHeight: "100vh", 
        width: "100%",
        backgroundImage: "url('/beach-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed"
      }}
    >
      <Container size="sm" w="100%">
        <Stack gap="xl" align="center">
          <Box ta="center">
            <Title order={1} c="white" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)", fontSize: "clamp(1.5rem, 8vw, 2.5rem)" }}>
              TRA CỨU DOANH THU
            </Title>
          </Box>

          <Card 
            shadow="xl" 
            radius="lg" 
            p="xl" 
            w="100%"
            style={{ 
              background: "rgba(255, 255, 255, 0.85)", 
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255, 255, 255, 0.3)"
            }}
          >
            <TextInput
              placeholder="Nhập biển số xe của bạn..."
              size="lg"
              leftSection={<IconSearch size={22} color="#228be6" />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.currentTarget.value)}
              radius="md"
              styles={{
                input: { border: "2px solid #228be6" }
              }}
            />

            {loading ? (
              <Center py="xl"><Loader size="md" /></Center>
            ) : (
              <Box mt="xl">
                <ScrollArea>
                  <Table highlightOnHover verticalSpacing="md" style={{ minWidth: 300 }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Mã đoàn</Table.Th>
                        <Table.Th ta="center">Mã vận chuyển</Table.Th>
                        <Table.Th ta="right">Giá trị</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {transactions.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={3}>
                            <Center py="xl" h={100}>
                              <Text c="dimmed" size="sm">
                                {searchTerm ? "Không tìm thấy dữ liệu" : "Nhập biển số xe để tra cứu"}
                              </Text>
                            </Center>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        transactions.map((t) => (
                          <Table.Tr key={t._id}>
                            <Table.Td>
                              <Text fw={700} c="blue" size="sm">{t.code}</Text>
                            </Table.Td>
                            <Table.Td ta="center">{t.vehicleNumber || t.licensePlate}</Table.Td>
                            <Table.Td ta="right">
                              <Text fw={700} c="green" size="sm">
                                <NumberFormatter value={t.revenue} thousandSeparator="." decimalSeparator="," />
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Box>
            )}
          </Card>
          
          <Text size="xs" c="white" style={{ opacity: 0.8 }}>
            © {dayjs().year()} - Giải pháp quản lý thông minh
          </Text>
        </Stack>
      </Container>
    </Box>
  );
}
