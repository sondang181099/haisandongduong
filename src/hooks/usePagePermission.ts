import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Hook kiểm tra quyền truy cập trang.
 * - Lấy danh sách permissions của role hiện tại từ /api/roles
 * - Nếu không có quyền → redirect về /admin
 * - admin tối cao (role === "admin") luôn được phép
 */
export function usePagePermission(requiredPath: string) {
  const { data: session, status } = useSession();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (session?.user as any)?.role;
  const [allowed, setAllowed] = useState<boolean | null>(null); // null = đang kiểm tra

  useEffect(() => {
    if (status === "loading") return;

    // Admin tối cao luôn được phép
    if (userRole === "admin") {
      setAllowed(true);
      return;
    }

    if (!userRole) {
      router.replace("/login");
      return;
    }

    // Fetch danh sách role để kiểm tra permissions
    const check = async () => {
      try {
        const res = await fetch("/api/roles/my-permissions");
        const data = await res.json();
        if (res.ok) {
          if (data.isAdmin || (data.permissions && data.permissions.includes(requiredPath))) {
            setAllowed(true);
          } else {
            setAllowed(false);
            router.replace("/admin");
          }
        } else {
          // Lỗi API → từ chối để an toàn
          setAllowed(false);
          router.replace("/admin");
        }
      } catch {
        setAllowed(false);
        router.replace("/admin");
      }
    };

    check();
  }, [status, userRole, requiredPath, router]);

  return { allowed };
}
