#!/bin/bash

# Kiểm tra xem Docker đã được cài đặt chưa
if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

echo "Đang khởi động Hải Sản Đông Dương trên cổng 4000..."

# Dừng các container cũ (nếu có)
docker-compose down

# Build và chạy container mới
docker-compose up --build -d

echo "----------------------------------------------------"
echo "Ứng dụng đang chạy tại: http://localhost:4000"
echo "Sử dụng 'docker-compose logs -f' để xem nhật ký."
echo "----------------------------------------------------"
