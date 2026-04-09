import os
import sys
import requests
import time
from datetime import datetime

# Fix encoding for Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

RETAILER = "haisandongduog"
# Token bạn đã cung cấp
MANUAL_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6ImF0K2p3dCJ9.eyJuYmYiOjE3NzU2MjYyODcsImV4cCI6MTc3NTcxMjY4NywiaXNzIjoiaHR0cDovL2lkLmtpb3R2aWV0LnZuIiwiY2xpZW50X2lkIjoiYTY5NzI2ZTAtOGEzOS00MTNlLWFlMmItYmU0ZjZlNmI4NDgwIiwiY2xpZW50X1JldGFpbGVyQ29kZSI6ImhhaXNhbmRvbmdkdW9nIiwiY2xpZW50X1JldGFpbGVySWQiOiI1MDA4MTQ3NTUiLCJjbGllbnRfVXNlcklkIjoiMjQzMzcxIiwiY2xpZW50X1NlbnNpdGl2ZUFwaSI6IlRydWUiLCJjbGllbnRfR3JvdXBJZCI6IjI4IiwiY2xpZW50X1NlY3JldEtleSI6IkFIV0NFR1JEMmNHR3d4cDNpRUdMakpCWDBRQlU0bEdjQmdTc3Z5SzE0bUk9IiwiaWF0IjoxNzc1NjI2Mjg3LCJzY29wZSI6WyJQdWJsaWNBcGkuQWNjZXNzIl19.TKv4_PbFd6tCobX3wdoJFRRu7AMcxw0R2nlRb8KR8QJScydauGMd6c9DQR3tLS2sD3GAG-wHUPzDU53g60wyEjFoXe_EODYF7PBSL2bPKO4vo588CoW5kdtzTNn998Cpa43Fg4bWAoAHytxtqU4BUnQQ3zG83WstuHq6vsTEDd6edcj6jkIPhTdkCWl6km0a1bXbJLV5lzxSDJhtadL7YGiJga6WrrvRekva8-WxK4YLUzEjHZ38CJIBfscq5UIKUmnCtjaV_l3TU3MeNuUSpCDaOTkUPmsp5mepyUGxSQQCBXGvPiUBNIc3xFQCVCVDhRICogTuaKnvgQ2qQwzGfw"

def get_daily_summary(target_date="2026-04-08"):
    print("="*50)
    print(f"   KIOTVIET DAILY SUMMARY - {target_date}")
    print("="*50)
    
    # Thiết lập thời gian từ đầu ngày đến cuối ngày
    from_date = f"{target_date}T00:00:00"
    to_date = f"{target_date}T23:59:59"
    
    # API lấy hóa đơn trong khoảng thời gian
    url = f"https://public.kiotapi.com/invoices?fromDate={from_date}&toDate={to_date}&pageSize=100&status=1"
    headers = {
        "Authorization": f"Bearer {MANUAL_TOKEN}",
        "Retailer": RETAILER,
        "User-Agent": "haisandongduong-app/1.0",
        "Accept": "application/json"
    }
    
    try:
        print(f"Đang lấy dữ liệu ngày {target_date}...")
        response = requests.get(url, headers=headers, verify=False)
        
        if response.status_code == 200:
            data = response.json()
            invoices = data.get("data", [])
            
            if not invoices:
                print(f"Không có giao dịch nào trong ngày {target_date}.")
                return

            # Gộp dữ liệu theo khách hàng
            summary = {}
            for inv in invoices:
                c_name = inv.get("customerName", "Khách lẻ")
                c_code = inv.get("customerCode", "KHACHLE")
                total = inv.get("total", 0)
                
                key = (c_code, c_name)
                if key not in summary:
                    summary[key] = {"total": 0, "count": 0}
                
                summary[key]["total"] += total
                summary[key]["count"] += 1
            
            # Sắp xếp theo tổng tiền giảm dần
            sorted_summary = sorted(summary.items(), key=lambda x: x[1]["total"], reverse=True)
            
            output_file = "bao_cao_ngay.txt"
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(f"BÁO CÁO DOANH THU NGÀY: {target_date}\n")
                f.write(f"{'Mã KH':<10} | {'Tên Khách Hàng':<25} | {'Số đơn':>8} | {'Tổng Chi Tiêu':>15}\n")
                f.write("-" * 70 + "\n")
                
                day_total = 0
                for (code, name), stats in sorted_summary:
                    total_str = f"{stats['total']:,.0f}".replace(",", ".")
                    f.write(f"{code:<10} | {name:<25} | {stats['count']:>8} | {total_str:>15}\n")
                    day_total += stats['total']
                    
                f.write("-" * 70 + "\n")
                f.write(f"{'TỔNG CỘNG NGÀY':<49} | {day_total:,.0f}".replace(",", ".") + "\n")
            
            print(f"Xử lý xong {len(invoices)} hóa đơn của {len(summary)} khách hàng.")
            print(f"Kết quả lưu tại: {output_file}")
            
            # In nhanh ra màn hình
            print("\nTop 5 khách hàng chi tiêu nhiều nhất hôm đó:")
            for (code, name), stats in sorted_summary[:5]:
                total_str = f"{stats['total']:,.0f}".replace(",", ".")
                print(f"- {name}: {total_str} ({stats['count']} đơn)")
                
        else:
            print(f"Lỗi API: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Lỗi hệ thống: {e}")

if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    # Bạn có thể thay đổi ngày ở đây nếu muốn xem ngày khác
    target = input("Nhập ngày muốn xem (YYYY-MM-DD) [Mặc định: 2026-04-08]: ").strip()
    if not target:
        target = "2026-04-08"
    
    get_daily_summary(target)
