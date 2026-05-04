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
        backgroundImage: "url('/login-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        position: "relative",
      }}
    >
      <Box style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.2)", zIndex: 0 }} />
      <Card
        shadow="xl"
        padding="xl"
        radius="lg"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(15px)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          zIndex: 1,
        }}
      >
        <Stack gap="lg">
          {/* Logo */}
          <Center>
            <Stack align="center" gap={4}>
              <Title order={2} c="dark.8" fw={800} style={{ letterSpacing: "-0.5px" }}>
                Đăng nhập hệ thống
              </Title>
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
