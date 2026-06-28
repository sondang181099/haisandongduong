#!/bin/bash

# Colors
BLUE='\033[0;34m'
NC='\033[0m'

show_menu() {
    clear
    echo -e "${BLUE}======================================"
    echo "    WORK REPORT BOT DOCKER MENU       "
    echo -e "======================================${NC}"
    echo "1) Build & Start (Build tu code va Chay)"
    echo "2) Start (Khoi dong he thong)"
    echo "3) Stop (Dung bot)"
    echo "4) Rebuild & Update (Build lai tu code & Cap nhat)"
    echo "5) View Logs (Xem logs)"
    echo "6) Check Status (Kiem tra trang thai)"
    echo "7) Cleanup (Don dep he thong)"
    echo "8) Exit (Thoat)"
    echo ""
    read -p "Select option [1-8]: " choice
}

# Kiểm tra docker compose / docker-compose cài đặt (ưu tiên docker compose V2 mới hơn)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "Error: docker-compose or docker compose is not installed." >&2
    exit 1
fi

while true; do
    show_menu
    case $choice in
        1)
            echo "Đang build Docker Image từ mã nguồn và khởi chạy..."
            $DOCKER_COMPOSE down
            if $DOCKER_COMPOSE up -d --build; then
                echo "Build và khởi chạy thành công!"
            else
                echo "Lỗi: Không thể build hoặc khởi chạy hệ thống."
            fi
            read -p "Nhấn Enter để tiếp tục..."
            ;;
        2)
            echo "Đang khởi động hệ thống..."
            $DOCKER_COMPOSE up -d
            echo "Khởi động thành công!"
            read -p "Nhấn Enter để tiếp tục..."
            ;;
        3)
            echo "Đang dừng hệ thống..."
            $DOCKER_COMPOSE down
            echo "Đã dừng hệ thống thành công!"
            read -p "Nhấn Enter để tiếp tục..."
            ;;
        4)
            echo "Đang build lại Docker Image mới và cập nhật hệ thống..."
            if $DOCKER_COMPOSE build && $DOCKER_COMPOSE down && $DOCKER_COMPOSE up -d; then
                echo "Cập nhật và khởi chạy phiên bản mới thành công!"
            else
                echo "Lỗi: Không thể build hoặc cập nhật hệ thống."
            fi
            read -p "Nhấn Enter để tiếp tục..."
            ;;
        5)
            echo "Đang xem logs (Nhấn Ctrl+C để thoát xem logs)..."
            $DOCKER_COMPOSE logs -f --tail=100
            ;;
        6)
            echo "Đang kiểm tra trạng thái hệ thống..."
            $DOCKER_COMPOSE ps
            read -p "Nhấn Enter để tiếp tục..."
            ;;
        7)
            echo "Đang dọn dẹp các tài nguyên docker thừa..."
            docker image prune -f
            docker builder prune -f
            echo "Dọn dẹp hệ thống hoàn thành!"
            read -p "Nhấn Enter để tiếp tục..."
            ;;
        8)
            echo "Thoát."
            exit 0
            ;;
        *)
            echo "Lựa chọn không hợp lệ. Vui lòng nhập số từ 1 đến 8."
            sleep 1.5
            ;;
    esac
done
