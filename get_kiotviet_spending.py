import os
import sys
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

# Fix encoding for Windows console
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables from .env.local
load_dotenv(".env.local")

MONGODB_URI = os.getenv("MONGODB_URI")
RETAILER = "haisandongduong"  # Đổi từ haisandongduog sang haisandongduong

# Danh sách mã khách hàng từ ảnh bạn cung cấp
CUSTOMER_CODES = [
    "XD420", "817", "388", "XD493", "XD491", 
    "XD470", "XD466", "XD465", "XD462", "XD457", 
    "XD452", "XD449", "XD441", "XD436", "XD430"
]

def get_kiotviet_token():
    try:
        client = MongoClient(MONGODB_URI)
        db = client.get_default_database()
        kiot_record = db.kiotviets.find_one({"key": "kiotviet"})
        if kiot_record:
            return kiot_record.get("accessToken")
        return None
    except Exception as e:
        print(f"Lỗi khi kết nối MongoDB: {e}")
        return None

import time

def fetch_customer_spending(token, customer_code):
    # Thử cả 2 retailer
    retailers_to_try = ["haisandongduog", "haisandongduong"]
    
    for r_code in retailers_to_try:
        # Lấy 10 hóa đơn mới nhất của khách hàng này
        url = f"https://public.kiotapi.com/invoices?customerCode={customer_code}&pageSize=10&orderBy=createdDate&orderDirection=Desc&status=1"
        headers = {
            "Authorization": f"Bearer {token}",
            "Retailer": r_code,
            "User-Agent": "haisandongduong-app/1.0",
            "Accept": "application/json"
        }
        
        try:
            time.sleep(0.3)
            response = requests.get(url, headers=headers, verify=False)
            
            if response.status_code == 200:
                data = response.json()
                invoices = data.get("data", [])
                
                if not invoices:
                    # Nếu không có hóa đơn nào, kiểm tra xem khách hàng có tồn tại không để lấy tên
                    cust_url = f"https://public.kiotapi.com/customers?code={customer_code}"
                    cust_res = requests.get(cust_url, headers=headers, verify=False)
                    if cust_res.status_code == 200:
                        cust_data = cust_res.json()
                        if cust_data.get("data"):
                            return {
                                "code": customer_code,
                                "name": cust_data["data"][0].get("name", "N/A"),
                                "spending": 0,
                                "debt": cust_data["data"][0].get("debt", 0),
                                "retailer_used": r_code
                            }
                    return None
                
                # Tính tổng 10 giao dịch mới nhất
                spending = sum(inv.get("total", 0) for inv in invoices)
                customer_name = invoices[0].get("customerName", "N/A")
                
                return {
                    "code": customer_code,
                    "name": customer_name,
                    "spending": spending,
                    "debt": 0, # Hóa đơn không chứa nợ tổng của khách
                    "retailer_used": r_code
                }
        except Exception as e:
            pass
            
    return None

# Token bạn cung cấp
MANUAL_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6ImF0K2p3dCJ9.eyJuYmYiOjE3NzU2MjYyODcsImV4cCI6MTc3NTcxMjY4NywiaXNzIjoiaHR0cDovL2lkLmtpb3R2aWV0LnZuIiwiY2xpZW50X2lkIjoiYTY5NzI2ZTAtOGEzOS00MTNlLWFlMmItYmU0ZjZlNmI4NDgwIiwiY2xpZW50X1JldGFpbGVyQ29kZSI6ImhhaXNhbmRvbmdkdW9nIiwiY2xpZW50X1JldGFpbGVySWQiOiI1MDA4MTQ3NTUiLCJjbGllbnRfVXNlcklkIjoiMjQzMzcxIiwiY2xpZW50X1NlbnNpdGl2ZUFwaSI6IlRydWUiLCJjbGllbnRfR3JvdXBJZCI6IjI4IiwiY2xpZW50X1NlY3JldEtleSI6IkFIV0NFR1JEMmNHR3d4cDNpRUdMakpCWDBRQlU0bEdjQmdTc3Z5SzE0bUk9IiwiaWF0IjoxNzc1NjI2Mjg3LCJzY29wZSI6WyJQdWJsaWNBcGkuQWNjZXNzIl19.TKv4_PbFd6tCobX3wdoJFRRu7AMcxw0R2nlRb8KR8QJScydauGMd6c9DQR3tLS2sD3GAG-wHUPzDU53g60wyEjFoXe_EODYF7PBSL2bPKO4vo588CoW5kdtzTNn998Cpa43Fg4bWAoAHytxtqU4BUnQQ3zG83WstuHq6vsTEDd6edcj6jkIPhTdkCWl6km0a1bXbJLV5lzxSDJhtadL7YGiJga6WrrvRekva8-WxK4YLUzEjHZ38CJIBfscq5UIKUmnCtjaV_l3TU3MeNuUSpCDaOTkUPmsp5mepyUGxSQQCBXGvPiUBNIc3xFQCVCVDhRICogTuaKnvgQ2qQwzGfw"

def main():
    print("="*50)
    print("   KIOTVIET CUSTOMER SPENDING EXTRACTOR")
    print("="*50)
    
    token = MANUAL_TOKEN
    
    # Nếu MANUAL_TOKEN trống, mới thử lấy từ Database
    if not token:
        print("1. Đang thử lấy Access Token từ Database...")
        token = get_kiotviet_token()
    else:
        print("1. Đang sử dụng Token bạn cung cấp...")
    
    if not token:
        print("   [!] Không thể kết nối Database hoặc không tìm thấy Token.")
        print("\n2. Vui lòng nhập Access Token thủ công.")
        print("   (Lấy từ Header 'Authorization' khi nhấn 'Đồng bộ' trên Web)")
        token = input("   Dán Token vào đây: ").strip()
        
        # Xóa tiền tố 'Bearer ' nếu người dùng lỡ copy cả cụm
        if token.lower().startswith("bearer "):
            token = token[7:].strip()

    if not token or len(token) < 20:
        print("   [x] Token không hợp lệ. Vui lòng kiểm tra lại.")
        return

    print(f"\n3. Đã có Token. Đang truy vấn chi tiêu cho {len(CUSTOMER_CODES)} khách hàng...")
    
    results = []
    for code in CUSTOMER_CODES:
        print(f"Đang xử lý: {code}...", end="\r")
        res = fetch_customer_spending(token, code)
        if res:
            results.append(res)
        else:
            results.append({
                "code": code,
                "name": "Không tìm thấy",
                "spending": 0,
                "debt": 0
            })

    # Ghi kết quả ra file text
    output_file = "khach_hang_chi_tieu.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"{'Mã KH':<10} | {'Tên Khách Hàng':<25} | {'Tổng 10 GD Mới':>15} | {'Nợ Hiện Tại':>15}\n")
        f.write("-" * 75 + "\n")
        total_all = 0
        for item in results:
            spending_str = f"{item['spending']:,.0f}".replace(",", ".")
            debt_str = f"{item['debt']:,.0f}".replace(",", ".")
            f.write(f"{item['code']:<10} | {item['name']:<25} | {spending_str:>15} | {debt_str:>15}\n")
            total_all += item['spending']
        
        f.write("-" * 75 + "\n")
        f.write(f"{'TỔNG CỘNG':<38} | {total_all:,.0f}".replace(",", ".") + "\n")

    print(f"\nĐã hoàn thành! Kết quả được lưu tại: {output_file}")

if __name__ == "__main__":
    # Tắt cảnh báo InsecureRequestWarning cho verify=False
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    main()
