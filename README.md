# Hải Sản Đông Dương - Hệ Thống Quản Lý & Doanh Thu ✨

[![Status](https://img.shields.io/badge/Status-Development-yellow.svg)]()

## 🚀 Giới Thiệu Chung

Đây là hệ thống nội bộ của **Hải Sản Đông Dương**, cung cấp nền tảng quản trị kinh doanh, quản lý doanh thu, đối soát thanh toán và đồng bộ trực tiếp với hệ thống KiotViet. Dự án cung cấp giao diện trực quan cho admin và phân quyền chi tiết cho nhân viên/tài xế.

## ✨ Tính Năng Nổi Bật

- **Quản lý Doanh thu & Công nợ:** Thống kê, lọc và theo dõi doanh thu theo thời gian thực.
- **Phân Quyền Chi Tiết (RBAC):** Quản lý quyền truy cập cho Admin, Staff, và Driver.
- **Tích Hợp KiotViet:** Tự động đồng bộ đơn hàng và hóa đơn từ KiotViet.
- **Real-time (Socket.io):** Cập nhật dữ liệu ngay lập tức mà không cần tải lại trang.
- **Giao Diện Hiện Đại:** Thiết kế responsive hoạt động mượt mà trên cả PC và Mobile (TailwindCSS + Mantine UI).

## 🛠️ Công Nghệ Sử Dụng

- **Frontend:** React.js, Next.js
- **Styling/UI:** Tailwind CSS v4, Mantine UI v9
- **Ngôn ngữ:** TypeScript
- **Backend/Database:** Node.js (Next.js API Routes / Express custom server), MongoDB (Mongoose)
- **Real-time:** Socket.IO
- **Xác thực:** NextAuth.js (hỗ trợ JWT và Credentials)

---

## ⚙️ Hướng Dẫn Cài Đặt (Local Development)

### 1. Yêu cầu hệ thống
- **Node.js:** Phiên bản 18 hoặc 20+.
- **npm** (hoặc **yarn**, **pnpm**)
- **MongoDB:** Cài đặt cục bộ (local) hoặc sử dụng MongoDB Atlas.

### 2. Thiết lập môi trường
1. Clone dự án về máy:
   ```bash
   git clone <url-repo-cua-ban>
   cd haisandongduong
   ```

2. Cài đặt các gói phụ thuộc (Dependencies):
   ```bash
   npm install
   ```

3. Copy file môi trường:
   Tạo file `.env.local` từ file `.env.example` đã cung cấp sẵn:
   ```bash
   cp .env.example .env.local
   ```
   *Lưu ý: Mở file `.env.local` và cập nhật thông tin MongoDB, KiotViet API, NEXTAUTH_SECRET,... cho phù hợp với môi trường của bạn.*

### 3. Chạy dự án (Development)
Dự án này sử dụng Socket.IO cùng với Next.js, nên bạn cần khởi chạy thông qua custom server:

```bash
npm run dev
# hoặc: npm run dev:socket
```

Máy chủ sẽ chạy tại: **http://localhost:3000**

---

## 🐳 Hướng Dẫn Triển Khai (Production qua Docker)

Dự án đã được cấu hình sẵn `Dockerfile` và `docker-compose.yml` để bạn có thể dễ dàng chạy trên máy chủ thật (VPS/Server).

1. Tạo cấu hình môi trường Server:
   Hãy chắc chắn bạn đã có file `.env.server` ở thư mục gốc (hoặc sửa trực tiếp thông tin trong `docker-compose.yml`). Đảm bảo `NEXTAUTH_URL` và `NEXT_PUBLIC_SOCKET_URL` trỏ về domain thật của bạn (VD: `http://techinfom.com/`).

2. Khởi chạy Docker Compose:
   ```bash
   docker-compose up -d --build
   ```
   
3. Ứng dụng sẽ tự động build và expose ở cổng **4000**. Bạn có thể thiết lập Nginx hoặc Cloudflare để trỏ domain của bạn vào cổng này.

## 📡 Lưu ý về API KiotViet
Để hệ thống đồng bộ được với KiotViet, bạn phải đảm bảo đã nhập chính xác `KIOTVIET_CLIENT_ID` và `KIOTVIET_CLIENT_SECRET` của cửa hàng vào file biến môi trường.
