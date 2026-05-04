"use client";

import { useState, useEffect } from "react";
import {
  Box, Title, Group, Stack, Card, Text,
  Button, ActionIcon, NumberInput, LoadingOverlay,
  Divider, SimpleGrid, MultiSelect, Select,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash, IconDeviceFloppy, IconInfoCircle } from "@tabler/icons-react";
import { ReductionRule, DEFAULT_REDUCTION_RULES, type ReductionConfig } from "@/lib/reduction";
import { VEHICLE_TYPES } from "@/lib/constants";

export default function ReductionSettingsPage() {
  const [rules, setRules] = useState<ReductionRule[]>([]);
  const [roundingType, setRoundingType] = useState<string>("none");
  const [roundingStep, setRoundingStep] = useState<number>(1000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/reduction");
      const data = await res.json();
      if (res.ok) {
        if (Array.isArray(data)) {
          setRules(data);
          setRoundingType("none");
          setRoundingStep(1000);
        } else {
          setRules(data.rules || []);
          setRoundingType(data.roundingType || "none");
          setRoundingStep(data.roundingStep || 1000);
        }
      } else {
        throw new Error(data.error);
      }
    } catch {
      notifications.show({ message: "Không thể tải cấu hình giảm giá", color: "red" });
      setRules(DEFAULT_REDUCTION_RULES);
    } finally {
      setLoading(false);
    }
  };

  const saveRules = async () => {
    const payload: ReductionConfig = {
      rules,
      roundingType,
      roundingStep,
    };
    try {
      const res = await fetch("/api/settings/reduction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Lỗi lưu cấu hình");

      notifications.show({
        message: "Đã lưu cấu hình giảm giá thành công",
        color: "green",
      });
    } catch {
      notifications.show({ message: "Không thể lưu cấu hình", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    setRules([...rules, { min: 0, max: null, percent: 0, vehicleTypes: [] }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<ReductionRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    setRules(newRules);
  };

  return (
    <Box p="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Box>
            <Title order={3}>Thiết lập hiển thị giảm</Title>
            <Text size="sm" c="dimmed">Cấu hình các mốc doanh thu và tỉ lệ giảm tương ứng hiển thị trên bảng doanh thu.</Text>
          </Box>
          <Button
            leftSection={<IconDeviceFloppy size={18} />}
            color="blue"
            onClick={saveRules}
            loading={saving}
          >
            Lưu cấu hình
          </Button>
        </Group>

        <Card withBorder padding="xl" radius="md" bg="white" style={{ position: "relative" }}>
          <LoadingOverlay visible={loading} overlayProps={{ blur: 1 }} />

          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <IconInfoCircle size={18} color="var(--mantine-color-blue-6)" />
              <Text fw={600} size="sm">Các quy tắc giảm trừ</Text>
            </Group>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={addRule}
            >
              Thêm mốc mới
            </Button>
          </Group>

          <Stack gap="md">
            {/* Quy tắc làm tròn */}
            <Box p="md" mb="md" style={{ border: "1px solid #e9ecef", borderRadius: "8px", backgroundColor: "#f8f9fa" }}>
              <Text fw={600} size="sm" mb="sm" c="blue.7">Quy tắc làm tròn</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label="Loại làm tròn"
                  data={[
                    { value: "none", label: "Không làm tròn" },
                    { value: "nearest", label: "Làm tròn gần nhất" },
                    { value: "floor", label: "Làm tròn xuống" },
                    { value: "ceil", label: "Làm tròn lên" },
                  ]}
                  value={roundingType}
                  onChange={(val) => setRoundingType(val || "none")}
                />
                <NumberInput
                  label="Làm tròn đến (1000, 10000...)"
                  placeholder="Ví dụ: 1000"
                  thousandSeparator="."
                  decimalSeparator=","
                  value={roundingStep}
                  onChange={(val) => {
                    const num = Number(val);
                    if (num <= 0) return setRoundingStep(1);
                    const exponent = Math.round(Math.log10(num));
                    const snapped = Math.pow(10, exponent);
                    setRoundingStep(snapped);
                  }}
                  hideControls
                />
              </SimpleGrid>
            </Box>

            {rules.map((rule, idx) => (
              <Box
                key={idx}
                p="md"
                style={{
                  border: "1px solid #e9ecef",
                  borderRadius: "8px",
                  position: "relative"
                }}
              >
                <ActionIcon
                  variant="subtle"
                  color="red"
                  style={{ position: "absolute", top: 8, right: 8 }}
                  onClick={() => removeRule(idx)}
                >
                  <IconTrash size={16} />
                </ActionIcon>

                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
                  <NumberInput
                    label="Doanh thu từ (VNĐ)"
                    placeholder="Ví dụ: 2.000.000"
                    thousandSeparator="."
                    decimalSeparator=","
                    value={rule.min}
                    onChange={(val) => updateRule(idx, { min: Number(val) })}
                    hideControls
                  />
                  <NumberInput
                    label="Đến (VNĐ)"
                    placeholder="Để trống nếu không giới hạn"
                    thousandSeparator="."
                    decimalSeparator=","
                    value={rule.max ?? undefined}
                    onChange={(val) => updateRule(idx, { max: val === "" ? null : Number(val) })}
                    hideControls
                  />
                  <NumberInput
                    label="Tỉ lệ giảm (%)"
                    placeholder="Ví dụ: 10"
                    suffix=" %"
                    value={rule.percent}
                    onChange={(val) => updateRule(idx, { percent: Number(val) })}
                    max={100}
                    min={0}
                  />
                  <MultiSelect
                    label="Áp dụng loại xe"
                    placeholder="Tất cả loại xe"
                    data={VEHICLE_TYPES}
                    value={rule.vehicleTypes || []}
                    onChange={(val) => updateRule(idx, { vehicleTypes: val })}
                    clearable
                    searchable
                  />
                </SimpleGrid>
              </Box>
            ))}

            {rules.length === 0 && !loading && (
              <Text c="dimmed" size="sm" ta="center" py="xl">Chưa có quy tắc nào. Nhấn "Thêm mốc mới" để bắt đầu.</Text>
            )}
          </Stack>
        </Card>

        <Card withBorder p="md" radius="md" bg="blue.0" style={{ borderLeft: "4px solid var(--mantine-color-blue-6)" }}>
          <Stack gap={4}>
            <Text size="sm" fw={700} c="blue.8">Hướng dẫn:</Text>
            <Text size="xs" c="blue.9">
              • Số tiền tại cột "Giá trị" trên màn hình trình chiếu và bảng doanh thu admin sẽ được tự động tính: <b>Giá trị = Doanh thu gốc × (100% - Tỉ lệ giảm)</b>.
            </Text>
            <Text size="xs" c="blue.9">
              • Ví dụ: Doanh thu 5.000.000 và mốc giảm 10% → Giá trị hiển thị sẽ là 4.500.000.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}
