"use client";

import { Box, Title, Card, Text, Stack, Button, Group, Switch, NumberInput } from "@mantine/core";
import { IconRefresh, IconSettings } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

export default function SyncSettingsPage() {
  const handleSave = () => {
    notifications.show({
      title: "Thành công",
      message: "Đã lưu cài đặt đồng bộ",
      color: "green",
    });
  };

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Title order={3}>Thiết lập đồng bộ</Title>
        <Button leftSection={<IconSettings size={16} />} onClick={handleSave}>
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
              description="Hệ thống sẽ tự động quét hóa đơn mới từ KiotViet mỗi 5 phút."
            />
            <NumberInput
              label="Khoảng thời gian đồng bộ (phút)"
              defaultValue={5}
              min={1}
              style={{ maxWidth: 200 }}
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
