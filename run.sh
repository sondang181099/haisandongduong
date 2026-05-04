#!/bin/bash

# Kiểm tra xem Docker đã được cài đặt chưa
if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

echo "Đang khởi động hệ thống quản lý trên cổng 4000..."

# Dừng các container cũ (nếu có)
docker-compose down

# Tự động tải và cài đặt docker-buildx nếu hệ thống chưa có
if ! docker buildx version > /dev/null 2>&1; then
  echo "Chưa có docker-buildx plugin, tiến hành tự động tải xuống (không cần quyền sudo)..."
  mkdir -p ~/.docker/cli-plugins
  curl -sSLo ~/.docker/cli-plugins/docker-buildx https://github.com/docker/buildx/releases/download/v0.14.0/buildx-v0.14.0.linux-amd64
  chmod +x ~/.docker/cli-plugins/docker-buildx
  echo "Cài đặt docker-buildx thành công!"
fi

# Kích hoạt BuildKit để hỗ trợ các cờ nâng cao như --mount=type=cache
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Build và chạy container mới
docker-compose up --build -d

# Xóa các tệp image lỗi thời/rác (dangling images) sinh ra trong quá trình build để giải phóng bộ nhớ
echo "Đang dọn dẹp các image docker thừa..."
docker image prune -f

echo "----------------------------------------------------"
echo "Ứng dụng đang chạy tại: http://localhost:4000"
echo "Sử dụng 'docker-compose logs -f' để xem nhật ký."
echo "----------------------------------------------------"
