"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box, Button, Group, TextInput, Title, Table, Text, Badge,
  Modal, Stack, Select, PasswordInput, ActionIcon, Tooltip,
  Card, ScrollArea, Loader, Center, Pagination, Autocomplete,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { DatePickerInput } from "@mantine/dates";
import {
  IconPlus, IconEdit, IconTrash, IconSearch, IconRefresh, IconCheck,
} from "@tabler/icons-react";
import dayjs from "dayjs";

interface User {
  _id: string;
  username: string;
  fullname: string;
  role: string;
  identity?: string;
  cars?: any[];
  detectedCars?: any[];
  payment?: {
    bankBin?: string;
    bankShortName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  lastLoginAt?: string;
  updatedAt?: string;
}

const ROLE_MAP: Record<string, string> = {
  "admin": "Quản trị viên",
  "manager": "Quản lý",
  "accountant": "Kế toán",
  "viewer": "Xem doanh thu",
  "driver": "Tài xế",
  "EMPLOYEE": "Nhân viên",
};

const translateRole = (role: string) => ROLE_MAP[role] || role;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [dbRoles, setDbRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<Date | string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 15;
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCarPlate, setNewCarPlate] = useState("");
  const [newCarType, setNewCarType] = useState("");

  const form = useForm({
    initialValues: {
      username: "", password: "", fullname: "", identity: "",
      role: "Tài xế", 
      cars: [] as { licensePlate: string, brands: string[] }[], 
      bankName: "", bankAccount: "", bankAccountHolder: "", bankBin: "",
    },
    validate: {
      username: (v) => (!v ? "Bắt buộc" : null),
      password: (v) => (!editUser && !v ? "Bắt buộc" : null),
      fullname: (v) => (!v ? "Bắt buộc" : null),
    },
  });

  const addCar = () => {
    if (!newCarPlate.trim()) return;
    const currentCars = form.values.cars || [];
    if (currentCars.some(c => c.licensePlate === newCarPlate.trim())) {
      notifications.show({ message: "Biển số này đã có trong danh sách", color: "orange" });
      return;
    }

    const brands = newCarType.trim() ? [newCarType.trim()] : [];
    form.setFieldValue("cars", [...currentCars, { licensePlate: newCarPlate.trim().toUpperCase(), brands }]);
    setNewCarPlate("");
    setNewCarType("");
  };

  const removeCar = (index: number) => {
    const list = [...form.values.cars];
    list.splice(index, 1);
    form.setFieldValue("cars", list);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      notifications.show({ title: "Lỗi", message: "Không thể tải dữ liệu", color: "red" });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles");
      const data = await res.json();
      if (res.ok) setDbRoles(data.roles || []);
    } catch (e) {
      console.error("Fetch roles error:", e);
    }
  }, []);

  useEffect(() => { 
    fetchUsers(); 
    fetchRoles();
  }, [fetchUsers, fetchRoles]);

  const openCreate = () => {
    setEditUser(null);
    form.reset();
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditUser(user);
    form.setValues({
      username: user.username,
      password: "",
      fullname: user.fullname,
      identity: user.identity || "",
      role: user.role, // Sử dụng mã role trực tiếp
      cars: (user.cars || []).map((c: any) => {
        if (typeof c === 'string') return { licensePlate: c, brands: [] };
        return { 
          licensePlate: c.licensePlate || c.vehicleNumber || c.car || "", 
          brands: Array.isArray(c.brands) ? c.brands : (c.brands ? [c.brands] : []) 
        };
      }).filter((c: any) => c.licensePlate),
      bankName: user.payment?.bankShortName || "",
      bankAccount: user.payment?.accountNumber || "",
      bankAccountHolder: user.payment?.accountName || "",
      bankBin: user.payment?.bankBin || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (values: typeof form.values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        cars: values.cars,
      };

      const url = editUser ? `/api/users/${editUser._id}` : "/api/users";
      const method = editUser ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Lỗi không xác định");
      }

      notifications.show({
        title: "Thành công",
        message: editUser ? "Cập nhật người dùng thành công" : "Tạo người dùng thành công",
        color: "green",
        icon: <IconCheck size={16} />,
      });

      setModalOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      notifications.show({
        title: "Lỗi",
        message: err instanceof Error ? err.message : "Có lỗi xảy ra",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (user.role === "admin") {
      notifications.show({ message: "Không thể xóa tài khoản Admin hệ thống!", color: "red" });
      return;
    }
    if (!confirm(`Xóa tài khoản "${user.username}"?`)) return;
    try {
      const res = await fetch(`/api/users/${user._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Xóa thất bại");
      notifications.show({ message: "Đã xóa người dùng", color: "green" });
      fetchUsers();
    } catch {
      notifications.show({ message: "Không thể xóa người dùng", color: "red" });
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      u.username.toLowerCase().includes(q) ||
      u.fullname.toLowerCase().includes(q) ||
      (u.identity || "").toLowerCase().includes(q);
    const matchDate =
      !dateFilter ||
      (u.lastLoginAt && dayjs(u.lastLoginAt).isSame(dayjs(dateFilter), "day"));
    return matchSearch && matchDate;
  });

  const getRoleDisplay = (roleKey: string) => {
    const role = dbRoles.find(r => r.key === roleKey || r.name === roleKey);
    return role ? role.name : translateRole(roleKey);
  };

  const roleColor = (role: string) => {
    const r = getRoleDisplay(role);
    if (r === "Quản lý" || r === "Quản trị viên") return "blue";
    if (r === "Xem doanh thu") return "grape";
    if (r === "Nhân viên" || r === "Tài xế" || r === "Kế toán") return "teal";
    return "gray";
  };

  const renderCarList = (carList: any[]) => {
    if (!carList || carList.length === 0) return null;
    return carList.map(car => {
      if (typeof car === 'string') return car;
      if (car && typeof car === 'object') {
        const plate = car.licensePlate || car.vehicleNumber || car.car || car.plate;
        const brand = car.brands && car.brands.length > 0 ? ` (${car.brands.join(", ")})` : "";
        return plate ? `${plate}${brand}` : "Xe không tên";
      }
      return String(car);
    }).join(", ");
  };

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedUsers = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Title order={3}>Quản lý người dùng</Title>
        <Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="default"
            size="sm"
            onClick={fetchUsers}
          >
            Làm mới dữ liệu
          </Button>
          <Button leftSection={<IconPlus size={16} />} size="sm" onClick={openCreate}>
            Thêm tài khoản
          </Button>
        </Group>
      </Group>

      {/* Filters */}
      <Card shadow="xs" radius="md" mb="md" p="md">
        <Group wrap="wrap">
          <TextInput
            placeholder="Tìm kiếm tài khoản, họ tên, CMND..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            style={{ flex: 1, minWidth: 280 }}
          />
          <DatePickerInput
            placeholder="Lọc theo ngày đăng nhập"
            value={dateFilter}
            onChange={(val) => { setDateFilter(val); setPage(1); }}
            clearable
            style={{ width: "100%", maxWidth: 220 }}
          />
        </Group>
      </Card>

      {/* Table */}
      <Card shadow="xs" radius="md" p={0}>
        <ScrollArea>
          {loading ? (
            <Center py="xl">
              <Loader size="md" />
            </Center>
          ) : (
            <Table striped highlightOnHover withTableBorder={false}>
              <Table.Thead>
                <Table.Tr style={{ background: "#f8f9fa" }}>
                  <Table.Th>Tài khoản</Table.Th>
                  <Table.Th>Họ và tên</Table.Th>
                  <Table.Th>Vai trò</Table.Th>
                  <Table.Th>CMND/CCCD</Table.Th>
                  <Table.Th>Danh sách xe</Table.Th>
                  <Table.Th>Lần đăng nhập gần nhất</Table.Th>
                  <Table.Th>Thao tác</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginatedUsers.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Center py="xl">
                        <Text c="dimmed">Không tìm thấy dữ liệu</Text>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginatedUsers.map((user) => (
                    <Table.Tr key={user._id}>
                      <Table.Td>
                        <Text size="sm">{user.username}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text fw={500} size="sm">{user.fullname}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={roleColor(user.role)} variant="light" size="sm">
                          {getRoleDisplay(user.role)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{user.identity || "—"}</Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          {user.cars && user.cars.length > 0 && (
                            <Text size="sm" style={{ fontWeight: 500 }}>
                              {renderCarList(user.cars)}
                            </Text>
                          )}
                          {user.detectedCars && user.detectedCars.filter(c => {
                            const carStr = (typeof c === 'string' ? c : (c?.vehicleNumber || c?.licensePlate || c?.car || "")).toString().trim();
                            const userCars = (user.cars || []).map(uc => (typeof uc === 'string' ? uc : (uc?.vehicleNumber || uc?.licensePlate || uc?.car || "")).toString().trim());
                            return carStr && !userCars.includes(carStr);
                          }).length > 0 && (
                            <Text size="xs" c="dimmed" fs="italic">
                              Hệ thống: {renderCarList(user.detectedCars.filter(c => {
                                const carStr = (typeof c === 'string' ? c : (c?.vehicleNumber || c?.licensePlate || c?.car || "")).toString().trim();
                                const userCars = (user.cars || []).map(uc => (typeof uc === 'string' ? uc : (uc?.vehicleNumber || uc?.licensePlate || uc?.car || "")).toString().trim());
                                return carStr && !userCars.includes(carStr);
                              }))}
                            </Text>
                          )}
                          {(!user.cars || user.cars.length === 0) && (!user.detectedCars || user.detectedCars.length === 0) && "—"}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {user.lastLoginAt
                            ? dayjs(user.lastLoginAt).format("HH:mm DD/MM/YYYY")
                            : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Tooltip label="Chỉnh sửa">
                            <ActionIcon
                              variant="light"
                              color="blue"
                              size="sm"
                              onClick={() => openEdit(user)}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                          </Tooltip>
                          {user.role !== "admin" && (
                            <Tooltip label="Xóa">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="sm"
                                onClick={() => handleDelete(user)}
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
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

        <Box px="md" py="xs" style={{ borderTop: "1px solid #f1f3f5" }}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Hiển thị {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, filtered.length)} / {filtered.length} bản ghi
            </Text>
            {totalPages > 1 && (
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            )}
          </Group>
        </Box>
      </Card>

      {/* Modal Create/Edit */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editUser ? "Chỉnh sửa tài khoản" : "Thêm tài khoản mới"}
        size="lg"
        radius="md"
      >
        <form onSubmit={form.onSubmit(handleSave)}>
          <Stack gap="md">
            <Text size="sm" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
              Thông tin tài khoản
            </Text>
            <Group grow wrap="wrap">
              <TextInput
                label="Tài khoản"
                placeholder="Nhập tên đăng nhập..."
                disabled={!!editUser}
                {...form.getInputProps("username")}
              />
              <PasswordInput
                label={editUser ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"}
                placeholder="Nhập mật khẩu..."
                {...form.getInputProps("password")}
              />
            </Group>
            <Group grow wrap="wrap">
              <TextInput
                label="Họ và tên"
                placeholder="Nhập họ tên đầy đủ..."
                {...form.getInputProps("fullname")}
              />
              <TextInput
                label="CMND/CCCD"
                placeholder="Số CMND/CCCD..."
                {...form.getInputProps("identity")}
              />
            </Group>
            <Group grow wrap="wrap">
              <Select
                label="Vai trò"
                placeholder="Chọn vai trò..."
                data={dbRoles.map(r => ({ value: r.key, label: r.name }))}
                {...form.getInputProps("role")}
              />
              <Box style={{ flex: 1 }} visibleFrom="sm" />
            </Group>


            <Text size="sm" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.05em" }}>
              Thông tin ngân hàng
            </Text>
            <Group grow wrap="wrap">
              <Select
                label="Ngân hàng"
                placeholder="Chọn ngân hàng..."
                data={["Vietcombank", "BIDV", "Agribank", "Techcombank", "MB Bank", "VPBank", "ACB", "TPBank", "Khác"]}
                clearable
                searchable
                {...form.getInputProps("bankName")}
              />
              <TextInput
                label="Số tài khoản"
                placeholder="Số tài khoản ngân hàng..."
                {...form.getInputProps("bankAccount")}
              />
            </Group>
            <Group grow wrap="wrap">
              <TextInput
                label="Chủ tài khoản"
                placeholder="Tên chủ tài khoản..."
                {...form.getInputProps("bankAccountHolder")}
              />
              <TextInput
                label="Mã BIN ngân hàng"
                placeholder="Mã BIN..."
                {...form.getInputProps("bankBin")}
              />
            </Group>

            <Card withBorder radius="md" p="md">
              <Text size="sm" fw={600} mb="xs">Thông tin xe</Text>
              <Stack gap="sm">
                <Group align="flex-end" wrap="nowrap" gap="sm">
                  <Group grow style={{ flex: 1 }} gap="sm">
                    <TextInput
                      label="Biển số xe"
                      placeholder="Nhập biển số xe..."
                      value={newCarPlate}
                      onChange={(e) => setNewCarPlate(e.currentTarget.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCar())}
                    />
                    <Autocomplete
                      label="Loại xe"
                      placeholder="VD: 45 chỗ..."
                      data={["4 chỗ", "7 chỗ", "16 chỗ", "29 chỗ", "35 chỗ", "45 chỗ", "Taxi"]}
                      value={newCarType}
                      onChange={setNewCarType}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCar())}
                    />
                  </Group>
                  <Button 
                    variant="light" 
                    onClick={addCar}
                    leftSection={<IconPlus size={14} />}
                  >
                    Thêm
                  </Button>
                </Group>
                
                <Stack gap="xs">
                  {form.values.cars.map((car, index) => (
                    <Card key={index} withBorder py={6} px="sm" radius="md">
                      <Group justify="space-between" gap="xs">
                        <Group gap={6}>
                          <Text fw={700} size="sm">{car.licensePlate}</Text>
                          {car.brands && car.brands.length > 0 && (
                            <Text size="xs" c="dimmed">({car.brands.join(", ")})</Text>
                          )}
                        </Group>
                        <ActionIcon 
                          variant="subtle" 
                          color="red" 
                          onClick={() => removeCar(index)}
                          size="sm"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Card>
                  ))}
                  {form.values.cars.length === 0 && (
                    <Text size="xs" c="dimmed" ta="center" py="xs" fs="italic">
                      Chưa có xe nào được thêm
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Card>

            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={() => setModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" loading={saving}>
                {editUser ? "Cập nhật" : "Tạo tài khoản"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
