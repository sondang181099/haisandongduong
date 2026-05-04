import { KiotViet } from "../models/KiotViet";

/**
 * Tự động lấy Access Token mới từ KiotViet sử dụng Client ID và Client Secret.
 * Sau đó lưu Token vào Database để các dịch vụ khác sử dụng.
 */
export async function refreshKiotVietToken(): Promise<string | null> {
  const clientId = process.env.KIOTVIET_CLIENT_ID;
  const clientSecret = process.env.KIOTVIET_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[KiotViet Auth] Thiếu KIOTVIET_CLIENT_ID hoặc KIOTVIET_CLIENT_SECRET trong biến môi trường.");
    return null;
  }

  try {
    // 1. Kiểm tra Token hiện tại trong DB để tái sử dụng (KiotViet token có hạn 24h)
    const existing = await KiotViet.findOne({ key: "kiotviet" });
    if (existing && existing.accessToken && existing.updatedAt) {
      const now = new Date();
      const updatedAt = new Date(existing.updatedAt);
      const diffInHours = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 23) {
        return existing.accessToken;
      }
    }

    console.log("[KiotViet Auth] Đang yêu cầu Access Token mới từ KiotViet...");
    
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("grant_type", "client_credentials");
    params.append("scope", "PublicApi.Access");

    const response = await fetch("https://id.kiotviet.vn/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lỗi từ KiotViet Auth: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;

    if (!accessToken) {
      throw new Error("KiotViet không trả về access_token.");
    }

    // Cập nhật vào MongoDB
    await KiotViet.findOneAndUpdate(
      { key: "kiotviet" },
      { 
        accessToken,
        // timestamps sẽ tự động cập nhật updatedAt
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log("[KiotViet Auth] Đã làm mới và lưu Access Token thành công.");
    return accessToken;
  } catch (error) {
    console.error("[KiotViet Auth] Lỗi khi làm mới Token:", error);
    return null;
  }
}
