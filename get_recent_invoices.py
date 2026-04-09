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

def get_recent_invoices():
    print("="*50)
    print("   KIOTVIET 10 RECENT TRANSACTIONS")
    print("="*50)
    
    url = "https://public.kiotapi.com/invoices?pageSize=10&orderBy=purchaseDate&orderDirection=Desc&status=1"
    headers = {
        "Authorization": f"Bearer {MANUAL_TOKEN}",
        "Retailer": RETAILER,
        "User-Agent": "haisandongduong-app/1.0",
        "Accept": "application/json"
    }
    
    try:
        print("Đang truy vấn 10 giao dịch mới nhất...")
        response = requests.get(url, headers=headers, verify=False)
        
        if response.status_code == 200:
            data = response.json()
            invoices = data.get("data", [])
            
            output_file = "10_giao_dich_moi_nhat.txt"
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(f"{'Ngày Giao Dịch':<20} | {'Mã HĐ':<15} | {'Khách Hàng':<25} | {'Tổng Tiền':>15}\n")
                f.write("-" * 85 + "\n")
                
                total_sum = 0
                for inv in invoices:
                    # Format ngày tháng
                    date_str = inv.get("purchaseDate", "")
                    try:
                        # KiotViet trả về định dạng ISO, ta đổi sang dd/mm/yyyy HH:MM
                        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                        date_fmt = dt.strftime("%d/%m/%Y %H:%M")
                    except:
                        date_fmt = date_str[:16]
                        
                    code = inv.get("code", "N/A")
                    customer = inv.get("customerName", "Khách lẻ")
                    total = inv.get("total", 0)
                    total_sum += total
                    
                    total_str = f"{total:,.0f}".replace(",", ".")
                    f.write(f"{date_fmt:<20} | {code:<15} | {customer:<25} | {total_str:>15}\n")
                
                f.write("-" * 85 + "\n")
                f.write(f"{'TỔNG CỘNG 10 GD GẦN NHẤT':<64} | {total_sum:,.0f}".replace(",", ".") + "\n")
            
            print(f"Hoàn thành! Danh sách lưu tại: {output_file}")
            
            # In ra màn hình để xem nhanh
            print("\nKết quả nhanh:")
            print(f"{'Ngày':<20} | {'Mã HĐ':<15} | {'Tổng Tiền':>15}")
            for inv in invoices[:5]: 
                total_str = f"{inv.get('total', 0):,.0f}".replace(",", ".")
                date_str = inv.get("purchaseDate", "")[:16].replace("T", " ")
                print(f"{date_str:<20} | {inv.get('code'):<15} | {total_str:>15}")
            print("...")
            
        else:
            print(f"Lỗi API: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Lỗi hệ thống: {e}")

if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    get_recent_invoices()
