"use client";

import { Box, Title, Card, Text, Stack, Button, Group, Switch, NumberInput, LoadingOverlay } from "@mantine/core";
import { IconRefresh, IconSettings } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, useEffect } from "react";
import { usePagePermission } from "@/hooks/usePagePermission";
import { Center, Loader } from "@mantine/core";

export default function SyncSettingsPage() {
  const { allowed } = usePagePermission("/admin/settings/sync");
  const [interval, setIntervalValue] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/sync")
      .then(res => res.json())
      .then(data => {
        if (data.interval) setIntervalValue(data.interval);
      })
      .catch(err => {
        console.error("Fetch sync setting failed:", err);
        notifications.show({ message: "Không thể tải cài đặt đồng bộ", color: "red" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });

      if (!res.ok) throw new Error("Lỗi khi lưu");

      notifications.show({
        title: "Thành công",
        message: `Đã cập nhật khoảng thời gian đồng bộ thành ${interval} giây`,
        color: "green",
      });
    } catch (error) {
      notifications.show({ message: "Không thể lưu cài đặt", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  if (allowed === null) {
    return <Center style={{ minHeight: "60vh" }}><Loader size="md" /></Center>;
  }

  if (allowed === false) {
    return null;
  }

  return (
    <Box style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} overlayProps={{ blur: 1 }} />
      
      <Group justify="space-between" mb="lg">
        <Title order={3}>Thiết lập đồng bộ</Title>
        <Button 
          leftSection={<IconSettings size={16} />} 
          onClick={handleSave}
          loading={saving}
        >
          Lưu cài đặt
        </Button>
      </Group>

      <Stack gap="md">
        <Card shadow="xs" radius="md" p="md" withBorder>
          <Text fw={600} mb="xs">Đồng bộ tự động (KiotViet)</Text>
          <Stack gap="sm">
            <Switch
              label="Bật đồng bộ ngầm định kỳ"
              defaultChecked
              description={`Hệ thống sẽ tự động quét hóa đơn mới từ KiotViet mỗi ${interval} giây.`}
            />
            <NumberInput
              label="Khoảng thời gian đồng bộ (giây)"
              description="Tối thiểu 10 giây để đảm bảo ổn định hệ thống và API KiotViet."
              value={interval}
              onChange={(val) => setIntervalValue(Number(val))}
              min={10}
              style={{ maxWidth: 300 }}
            />
          </Stack>
        </Card>

        <Card shadow="xs" radius="md" p="md" withBorder>
          <Text fw={600} mb="xs">Phạm vi đồng bộ mặc định</Text>
          <Text size="sm" c="dimmed" mb="md">
            Cấu hình thời gian mặc định khi thực hiện đồng bộ thủ công.
          </Text>
          <Group>
            <Button variant="light" leftSection={<IconRefresh size={16} />}>
              Kiểm tra kết nối KiotViet
            </Button>
          </Group>
        </Card>
      </Stack>
    </Box>
  );
}
