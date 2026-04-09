"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  Center,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Alert,
  Image,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle } from "@tabler/icons-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const form = useForm({
    initialValues: { username: "", password: "" },
    validate: {
      username: (v) => (!v ? "Vui lòng nhập tên đăng nhập" : null),
      password: (v) => (!v ? "Vui lòng nhập mật khẩu" : null),
    },
  });

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      username: values.username,
      password: values.password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Tên đăng nhập hoặc mật khẩu không đúng");
    } else {
      router.push("/admin/revenue");
      router.refresh();
    }
  };

  return (
    <Box
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #e7f3ff 0%, #f8f9fa 50%, #e3f2ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Card
        shadow="xl"
        padding="xl"
        radius="md"
        style={{
          width: "100%",
          maxWidth: 420,
          border: "1px solid #e0e7ef",
        }}
      >
        <Stack gap="lg">
          {/* Logo */}
          <Center>
            <Stack align="center" gap={4}>
              <Box
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, #228be6, #1971c2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 24px rgba(34,139,230,0.3)",
                }}
              >
                <Image src="/logo.png" alt="Logo" w={52} h={52} fit="contain" />
              </Box>
              <Title order={2} c="dark.7" mt={4}>
                Hải Sản Đông Dương
              </Title>
              <Text size="sm" c="dimmed">
                Hệ thống quản lý nội bộ
              </Text>
            </Stack>
          </Center>

          {/* Error */}
          {error && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              variant="light"
              radius="md"
            >
              {error}
            </Alert>
          )}

          {/* Form */}
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <TextInput
                label="Tên đăng nhập"
                placeholder="Nhập tên đăng nhập..."
                size="md"
                radius="md"
                {...form.getInputProps("username")}
              />
              <PasswordInput
                label="Mật khẩu"
                placeholder="Nhập mật khẩu..."
                size="md"
                radius="md"
                {...form.getInputProps("password")}
              />
              <Button
                type="submit"
                size="md"
                radius="md"
                loading={loading}
                fullWidth
                mt="xs"
                style={{
                  background: "linear-gradient(135deg, #228be6, #1971c2)",
                  boxShadow: "0 4px 12px rgba(34,139,230,0.35)",
                }}
              >
                Đăng nhập
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Box>
  );
}
