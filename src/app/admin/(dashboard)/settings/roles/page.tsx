"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Title,
  Card,
  Table,
  Group,
  Text,
  Button,
  TextInput,
  Checkbox,
  Stack,
  ActionIcon,
  Modal,
  ScrollArea,
  Loader,
  Center,
  Badge,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDeviceFloppy,
  IconKey,
  IconPackage,
} from "@tabler/icons-react";

// Danh sách các menu có sẵn trong hệ thống để gán quyền
const MENU_ITEMS = [
  { id: "/admin/users", label: "Quản lý người dùng" },
  { id: "/admin/revenue", label: "Quản lý doanh thu" },
  { id: "/admin/revenue-table", label: "Bảng doanh thu" },
  { id: "/admin/settings", label: "Thiết lập (Menu cha)" },
  { id: "/admin/revenue/config", label: "Thiết lập hoa hồng" },
  { id: "/admin/settings/sync", label: "Thiết lập đồng bộ" },
  { id: "/admin/settings/roles", label: "Thiết lập nhóm quyền" },
];

interface Role {
  _id?: string;
  name: string;
  key: string;
  description: string;
  permissions: string[];
  viewUnpaid?: boolean;
  isSystem?: boolean;
}

export default function RoleSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm({
    initialValues: {
      name: "",
      key: "",
      description: "",
      permissions: [] as string[],
      viewUnpaid: false,
    },
    validate: {
      name: (value) => (value.length < 2 ? "Tên quyền quá ngắn" : null),
      key: (value) => (value.length < 2 ? "Key quá ngắn" : null),
    },
  });

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      if (res.ok) {
        setRoles(data.roles || []);
      }
    } catch (error) {
      notifications.show({ title: "Lỗi", message: "Không thể tải danh sách quyền", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const openEdit = (role: Role) => {
    setEditingRole(role);
    form.setValues({
      name: role.name,
      key: role.key,
      description: role.description || "",
      permissions: role.permissions || [],
      viewUnpaid: !!role.viewUnpaid,
    });
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingRole(null);
    form.reset();
    setModalOpen(true);
  };

  const handleSave = async (values: typeof form.values) => {
    setSaving(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _id: editingRole?._id,
          ...values,
        }),
      });

      if (res.ok) {
        notifications.show({ title: "Thành công", message: "Đã lưu thông tin quyền", color: "green" });
        setModalOpen(false);
        fetchRoles();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Lỗi khi lưu");
      }
    } catch (error: any) {
      notifications.show({ title: "Lỗi", message: error.message, color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa quyền này?")) return;
    try {
      const res = await fetch(`/api/roles?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        notifications.show({ message: "Đã xóa quyền", color: "green" });
        fetchRoles();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Lỗi khi xóa");
      }
    } catch (error: any) {
      notifications.show({ title: "Lỗi", message: error.message, color: "red" });
    }
  };

  const handleInitRoles = async () => {
    if (!confirm("Khởi tạo lại các quyền mặc định? Các quyền cũ có thể bị ghi đè.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/roles/init");
      if (res.ok) {
        notifications.show({ message: "Đã khởi tạo vai trò mặc định", color: "green" });
        fetchRoles();
      }
    } catch (error) {
      notifications.show({ message: "Lỗi khởi tạo", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={3}>Quản lý nhóm quyền</Title>
          <Text size="sm" c="dimmed">Thiết lập chức năng truy cập cho từng vai trò người dùng</Text>
        </Box>
        <Group>
          <Button variant="default" onClick={handleInitRoles}>Khởi tạo mặc định</Button>
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>Thêm vai trò</Button>
        </Group>
      </Group>

      <Card shadow="xs" radius="md" p={0} withBorder>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="md" /></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="md">
              <Table.Thead>
                <Table.Tr style={{ background: "#f8f9fa" }}>
                  <Table.Th>Tên vai trò</Table.Th>
                  <Table.Th>Mã (Key)</Table.Th>
                  <Table.Th>Mô tả</Table.Th>
                  <Table.Th>Số quyền</Table.Th>
                  <Table.Th style={{ width: 120 }}>Thao tác</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {roles.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Center py="xl"><Text c="dimmed">Chưa có vai trò nào được định nghĩa</Text></Center>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  roles.map((role) => (
                    <Table.Tr key={role.key}>
                      <Table.Td>
                        <Group gap="xs">
                          <IconKey size={16} color="#228be6" />
                          <Text fw={600} size="sm">{role.name}</Text>
                          {role.isSystem && <Badge size="xs" variant="light">Hệ thống</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="outline" radius="sm">{role.key}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">{role.description || "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="blue">{role.permissions?.length || 0} menu</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <ActionIcon variant="light" color="blue" onClick={() => openEdit(role)}>
                            <IconEdit size={16} />
                          </ActionIcon>
                          {!role.isSystem && (
                            <ActionIcon variant="light" color="red" onClick={() => role._id && handleDelete(role._id)}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Card>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={<Text fw={700}>{editingRole ? "Chỉnh sửa vai trò" : "Thêm vai trò mới"}</Text>}
        size="lg"
        radius="md"
      >
        <form onSubmit={form.onSubmit(handleSave)}>
          <Stack gap="md">
            <Group grow>
              <TextInput
                label="Tên vai trò"
                placeholder="Ví dụ: Quản trị viên"
                required
                {...form.getInputProps("name")}
              />
              <TextInput
                label="Mã vai trò (Key)"
                placeholder="Ví dụ: admin"
                required
                disabled={editingRole?.isSystem}
                {...form.getInputProps("key")}
              />
            </Group>
            
            <TextInput
              {...form.getInputProps("description")}
            />

            <Checkbox
              label="Cho phép xem đơn chưa thanh toán"
              description="Nếu tích chọn, người dùng thuộc vai trò này sẽ thấy các đơn hàng có trạng thái chưa thanh toán."
              {...form.getInputProps("viewUnpaid", { type: "checkbox" })}
            />

            <Box>
              <Text size="sm" fw={600} mb="xs">Danh sách menu được phép truy cập:</Text>
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  {MENU_ITEMS.map((item) => (
                    <Checkbox
                      key={item.id}
                      label={item.label}
                      value={item.id}
                      checked={form.values.permissions.includes(item.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        const current = form.values.permissions;
                        form.setFieldValue(
                          "permissions",
                          checked ? [...current, item.id] : current.filter((p) => p !== item.id)
                        );
                      }}
                    />
                  ))}
                </Stack>
              </Card>
            </Box>

            <Group justify="flex-end" mt="lg">
              <Button variant="default" onClick={() => setModalOpen(false)}>Hủy</Button>
              <Button leftSection={<IconDeviceFloppy size={16} />} type="submit" loading={saving}>
                Lưu thông tin
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
