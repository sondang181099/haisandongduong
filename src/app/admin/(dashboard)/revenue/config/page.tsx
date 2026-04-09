"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box, Title, Group, Stack, Card, Text, NavLink, TextInput,
  Button, Select, ActionIcon, NumberInput, LoadingOverlay,
  Divider, Grid,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";

// Danh sách các loại xe khớp với màn hình mẫu
const VEHICLE_TYPES = [
  "Xe ôm", "Xe điện", "Taxi", "Nội bộ", "Khách lẻ.", "Khách đoàn",
  "45 chỗ", "35 chỗ", "16 chỗ"
];

interface SpecialRule {
  condition: {
    type: "lt" | "gt" | "range";
    value: number;
    maxValue?: number;
  };
  action: {
    type: "fixed" | "percent" | "add";
    value: number;
  };
}

interface RevenueConfig {
  vehicleType: string;
  defaultFormula: string;
  rounding?: string;
  roundingStep?: number;
  specialRules: SpecialRule[];
}

const emptyConfig = (vehicleType: string): RevenueConfig => ({
  vehicleType,
  defaultFormula: "R * 0", // Mặc định như cũ
  rounding: "nearest",
  roundingStep: 1000,
  specialRules: [],
});

// Mapping functions for compatibility with vehicle_profit_configs schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Mapping functions for compatibility with vehicle_profit_configs schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDbFormat = (dbObj: any): RevenueConfig => {
  // Ưu tiên lấy từ root (loại xe đã migrate), fallback vào config (loại xe chưa migrate)
  const cfg = dbObj.config || {};
  const roundingData = dbObj.rounding || cfg.rounding || {};
  
  const roundingType = roundingData.type || cfg.rounding || dbObj.rounding || "nearest";
  const roundingStep = roundingData.step || cfg.roundingStep || dbObj.roundingStep || 1000;

  return {
    vehicleType: dbObj.name || "",
    defaultFormula: cfg.formula || dbObj.formula || "R * 0",
    rounding: roundingType,
    roundingStep: roundingStep,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    specialRules: (cfg.conditions || dbObj.conditions || []).map((c: any) => ({
      condition: {
        type: c.type === "less_than" ? "lt" : c.type === "greater_than" ? "gt" : "range",
        value: c.values?.[0] || 0,
        maxValue: c.values?.[1] || 0
      },
      action: {
        type: c.action?.type === "fixed_result" ? "fixed" : c.action?.type === "percent_result" ? "percent" : "add",
        value: c.action?.value || 0
      }
    }))
  };
};

const toDbFormat = (localObj: RevenueConfig) => {
  return {
    name: localObj.vehicleType,
    config: {
      formula: localObj.defaultFormula,
      conditions: localObj.specialRules.map(r => ({
        type: r.condition.type === "lt" ? "less_than" : r.condition.type === "gt" ? "greater_than" : "range",
        values: r.condition.type === "range" ? [r.condition.value, r.condition.maxValue ?? 0] : [r.condition.value],
        action: {
          type: r.action.type === "fixed" ? "fixed_result" : r.action.type === "percent" ? "percent_result" : "bonus_amount",
          value: r.action.value
        }
      }))
    },
    rounding: {
      type: localObj.rounding || "nearest",
      step: localObj.roundingStep || 1000,
    }
  };
};

export default function ConfigPage() {
  const [selectedType, setSelectedType] = useState(VEHICLE_TYPES[0]);
  const [editingConfig, setEditingConfig] = useState<RevenueConfig>(emptyConfig(VEHICLE_TYPES[0]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfigForType = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/revenue/config");
      const data = await res.json();
      const configMap: Record<string, RevenueConfig> = {};
      if (Array.isArray(data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((c: any) => {
          configMap[c.name] = fromDbFormat(c);
        });
      }
      setEditingConfig(configMap[type] || emptyConfig(type));
    } catch {
      notifications.show({ message: "Không thể tải cấu hình", color: "red" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigForType(selectedType);
  }, [fetchConfigForType, selectedType]);

  const updateFormula = (value: string) => {
    setEditingConfig(prev => ({ ...prev, defaultFormula: value }));
  };

  const addRule = () => {
    const newRule: SpecialRule = {
      condition: { type: "lt", value: 0 },
      action: { type: "fixed", value: 0 },
    };
    setEditingConfig(prev => ({
      ...prev,
      specialRules: [...prev.specialRules, newRule],
    }));
  };

  const removeRule = (index: number) => {
    setEditingConfig(prev => ({
      ...prev,
      specialRules: prev.specialRules.filter((_, i) => i !== index),
    }));
  };

  const updateCondition = (index: number, condUpdates: Partial<SpecialRule["condition"]>) => {
    setEditingConfig(prev => {
      const newRules = [...prev.specialRules];
      newRules[index] = {
        ...newRules[index],
        condition: { ...newRules[index].condition, ...condUpdates },
      };
      return { ...prev, specialRules: newRules };
    });
  };

  const updateAction = (index: number, actUpdates: Partial<SpecialRule["action"]>) => {
    setEditingConfig(prev => {
      const newRules = [...prev.specialRules];
      newRules[index] = {
        ...newRules[index],
        action: { ...newRules[index].action, ...actUpdates },
      };
      return { ...prev, specialRules: newRules };
    });
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const dbPayload = toDbFormat(editingConfig);
      dbPayload.name = selectedType; // ensure name matches current selected

      const res = await fetch("/api/revenue/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dbPayload),
      });
      if (!res.ok) throw new Error("Lỗi lưu cấu hình");

      const savedDbConfig = await res.json();
      setEditingConfig(fromDbFormat(savedDbConfig));
      notifications.show({
        message: `Đã lưu cấu hình thành công`,
        color: "green",
      });
    } catch {
      notifications.show({ message: "Không thể lưu cấu hình", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box p="md" bg="#f4f6f8" style={{ minHeight: "100vh" }}>
      <Title order={3} mb="xl">Thiết lập hoa hồng</Title>

      <Group align="flex-start" gap="xl" wrap="nowrap">
        {/* Sidebar */}
        <Box style={{ width: 220, flexShrink: 0, backgroundColor: "#fff", padding: "16px", borderRadius: "8px" }}>
          <Text fw={600} size="sm" mb="sm">Loại xe</Text>
          <Stack gap={4}>
            {VEHICLE_TYPES.map(type => {
              const isSelected = selectedType === type;
              return (
                <NavLink
                  key={type}
                  label={<Text size="sm" fw={isSelected ? 600 : 500} c="blue" ta="center">{type}</Text>}
                  active={isSelected}
                  onClick={() => setSelectedType(type)}
                  variant="light"
                  color="blue"
                  styles={{
                    root: {
                      borderRadius: 6,
                      backgroundColor: isSelected ? "#e7f5ff" : "transparent",
                      textAlign: "center",
                    }
                  }}
                />
              );
            })}
          </Stack>
        </Box>

        {/* Main Content */}
        <Box style={{ flex: 1, position: "relative" }}>
          <LoadingOverlay visible={loading || saving} overlayProps={{ blur: 1 }} />

          <Stack gap="md">
            {/* Box 1: Thiết lập cơ bản */}
            <Card withBorder padding="xl" radius="md" bg="white">
              <Group justify="space-between" align="flex-start" mb="lg">
                <Box>
                  <Title order={5} mb={4}>Thiết lập</Title>
                  <Text size="sm" c="dimmed">
                    Tại đây, bạn có thể thiết lập công thức tính hoa hồng cơ bản và các quy tắc thưởng đặc biệt dựa trên doanh thu cho loại xe này.
                  </Text>
                </Box>
                <Button color="green" onClick={saveConfig} loading={saving}>Lưu</Button>
              </Group>

              <Stack gap="md">
                <TextInput
                  label={<Text fw={600} size="sm" mb={4}>Công thức mặc định</Text>}
                  placeholder="R * 0.25"
                  value={editingConfig.defaultFormula}
                  onChange={(e) => updateFormula(e.currentTarget.value)}
                  description={
                    <span style={{ fontSize: "12px", color: "var(--mantine-color-dimmed)", marginTop: "4px", display: "inline-block" }}>
                      Hướng dẫn: Sử dụng biến R để đại diện cho doanh thu. Các phép toán được hỗ trợ: +, -, *, /.
                    </span>
                  }
                />

                <Grid gap="md" align="flex-start">
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Select
                      label={<Text fw={600} size="sm" mb={4}>Quy tắc làm tròn</Text>}
                      data={[
                        { value: "none", label: "Không làm tròn" },
                        { value: "nearest", label: "Gần nhất (theo đơn vị)" },
                        { value: "floor", label: "Làm tròn xuống (về đơn vị)" },
                        { value: "ceil", label: "Làm tròn lên (tới đơn vị)" },
                      ]}
                      value={editingConfig.rounding}
                      onChange={(val) => setEditingConfig(prev => ({ ...prev, rounding: val || "none" }))}
                    />
                  </Grid.Col>

                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Stack gap={0}>
                      <NumberInput
                        label={<Text fw={600} size="sm" mb={4}>Làm tròn đến (10, 100, 1000...)</Text>}
                        placeholder="Ví dụ: 1000"
                        thousandSeparator=","
                        hideControls
                        value={editingConfig.roundingStep}
                        onChange={(val) => {
                          const num = Number(val);
                          if (num <= 0) return setEditingConfig(prev => ({ ...prev, roundingStep: 1 }));
                          const exponent = Math.round(Math.log10(num));
                          const snapped = Math.pow(10, exponent);
                          setEditingConfig(prev => ({ ...prev, roundingStep: snapped }));
                        }}
                      />
                      <Text size="xs" c="dimmed" mt={4}>
                        Mốc chuẩn: 10, 100, 1000...
                      </Text>
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Stack>
            </Card>

            {/* Box 2: Quy tắc đặc biệt */}
            <Card withBorder padding="xl" radius="md" bg="white">
              <Group justify="space-between" mb="lg">
                <Title order={5}>Quy tắc đặc biệt</Title>
                <Button
                  variant="light"
                  size="sm"
                  color="blue"
                  leftSection={<IconPlus size={16} />}
                  onClick={addRule}
                >
                  Thêm quy tắc
                </Button>
              </Group>

              <Stack gap="lg">
                {editingConfig.specialRules.map((rule, idx) => (
                  <Box key={idx} style={{ position: "relative", border: "1px solid #e9ecef", borderRadius: "8px", padding: "16px" }}>

                    {/* Delete Button */}
                    <ActionIcon
                      variant="light"
                      color="red"
                      onClick={() => removeRule(idx)}
                      style={{ position: "absolute", top: 12, right: 12, zIndex: 1 }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>

                    <Stack gap="md">
                      {/* Điều Kiện */}
                      <Box>
                        <Text size="sm" fw={600} mb="xs" c="blue">NẾU (ĐIỀU KIỆN)</Text>
                        <Grid gap="sm" align="flex-end">
                          <Grid.Col span={{ base: 12, md: 4 }}>
                            <Select
                              label="Loại điều kiện"
                              data={[
                                { value: "lt", label: "Doanh thu nhỏ hơn" },
                                { value: "gt", label: "Doanh thu lớn hơn" },
                                { value: "range", label: "Doanh thu trong khoảng" },
                              ]}
                              value={rule.condition.type}
                              onChange={(val) =>
                                val && updateCondition(idx, { type: val as "lt" | "gt" | "range" })
                              }
                            />
                          </Grid.Col>
                          
                          {rule.condition.type === "range" ? (
                            <>
                              <Grid.Col span={{ base: 6, md: 4 }}>
                                <NumberInput
                                  label="Từ"
                                  thousandSeparator=","
                                  hideControls
                                  value={rule.condition.value}
                                  onChange={(val) => updateCondition(idx, { value: Number(val) })}
                                />
                              </Grid.Col>
                              <Grid.Col span={{ base: 6, md: 4 }}>
                                <NumberInput
                                  label="Đến"
                                  thousandSeparator=","
                                  hideControls
                                  value={rule.condition.maxValue ?? 0}
                                  onChange={(val) => updateCondition(idx, { maxValue: Number(val) })}
                                />
                              </Grid.Col>
                            </>
                          ) : (
                            <Grid.Col span={{ base: 12, md: 8 }}>
                              <NumberInput
                                label="Giá trị doanh thu (VND)"
                                thousandSeparator=","
                                hideControls
                                value={rule.condition.value}
                                onChange={(val) => updateCondition(idx, { value: Number(val) })}
                              />
                            </Grid.Col>
                          )}
                        </Grid>
                      </Box>

                      <Divider color="gray.1" />

                      {/* Hành động */}
                      <Box>
                        <Text size="sm" fw={600} mb="xs" c="green">THÌ (HÀNH ĐỘNG)</Text>
                        <Grid gap="sm" align="flex-end">
                          <Grid.Col span={{ base: 12, md: 4 }}>
                            <Select
                              label="Loại hành động"
                              data={[
                                { value: "fixed", label: "Hoa hồng là (cố định)" },
                                { value: "percent", label: "Hoa hồng là (% doanh thu)" },
                                { value: "add", label: "Thưởng thêm (số tiền)" },
                              ]}
                              value={rule.action.type}
                              onChange={(val) =>
                                val && updateAction(idx, { type: val as "fixed" | "percent" | "add" })
                              }
                            />
                          </Grid.Col>
                          <Grid.Col span={{ base: 12, md: 8 }}>
                            <NumberInput
                              label="Giá trị (VND hoặc %)"
                              thousandSeparator=","
                              hideControls
                              value={rule.action.value}
                              onChange={(val) => updateAction(idx, { value: Number(val) })}
                              rightSection={<Text size="xs" c="dimmed" pr="xs">{rule.action.type === "percent" ? "%" : "VNĐ"}</Text>}
                            />
                          </Grid.Col>
                        </Grid>
                      </Box>
                    </Stack>
                  </Box>
                ))}

                {editingConfig.specialRules.length === 0 && (
                  <Text c="dimmed" size="sm" ta="center" py="xl">Chưa có quy tắc đặc biệt nào.</Text>
                )}
              </Stack>
            </Card>
          </Stack>
        </Box>
      </Group>
    </Box>
  );
}
