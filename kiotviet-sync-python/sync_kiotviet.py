import os, sys
# Cấu hình stdout thành utf-8 để tránh lỗi UnicodeEncodeError khi print tiếng Việt trên Windows
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import json
import time
import re
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from pymongo import MongoClient, UpdateOne, InsertOne
from dotenv import load_dotenv
import pytz

# Load environment variables - tìm từ thư mục hiện tại trước, sau đó thư mục cha
_root_env = os.path.join(os.path.dirname(__file__), "..", ".env.local")
if os.path.exists(".env.local"):
    load_dotenv(".env.local")
elif os.path.exists(_root_env):
    load_dotenv(_root_env)
elif os.path.exists(".env"):
    load_dotenv(".env")
else:
    load_dotenv() # Load from system environment

# Configuration
MONGODB_URI = os.getenv("MONGODB_URI")
CLIENT_ID = os.getenv("KIOTVIET_CLIENT_ID")
CLIENT_SECRET = os.getenv("KIOTVIET_CLIENT_SECRET")
RETAILER_CODE = os.getenv("KIOTVIET_RETAILER_CODE", "haisandongduog")
TZ = pytz.timezone("Asia/Ho_Chi_Minh")

if not all([MONGODB_URI, CLIENT_ID, CLIENT_SECRET]):
    print(f"[{datetime.now()}] ERROR: Missing required environment variables (MONGODB_URI, CLIENT_ID, CLIENT_SECRET)")
    sys.exit(1)

# HTTP Session Setup with auto-retry
http_session = requests.Session()
retry_strategy = Retry(
    total=5,
    backoff_factor=1.5,
    status_forcelist=[429, 500, 502, 503, 504]
)
adapter = HTTPAdapter(max_retries=retry_strategy)
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)

# MongoDB Setup (Sử dụng tz_aware=True để tránh lỗi so sánh)
client = MongoClient(MONGODB_URI, tz_aware=True)
db = client.get_database()
transactions_col = db["transactions"]
kiotviets_col = db["kiotviets"]

def clean_plate(plate):
    """Chuẩn hóa biển số xe để so sánh (viết hoa, loại bỏ ký tự đặc biệt)."""
    if not plate:
        return ""
    return re.sub(r'[^A-Z0-9]', '', plate.strip().upper())

def should_match_transaction(tx_plate, new_plate, customer_code):
    """
    Quyết định xem giao dịch hiện tại (tx_plate) và biển số mới (new_plate) có khớp nhau hay không.
    - Đối với xe đoàn (XT/XD), luôn cho phép khớp cùng mã đoàn trong ngày để gộp chung dữ liệu.
    - Các trường hợp khác: khớp theo biển số hoặc mặc định.
    """
    if customer_code.startswith("XT") or customer_code.startswith("XD"):
        return True

    tx_clean = clean_plate(tx_plate)
    new_clean = clean_plate(new_plate)
    
    # 1. Trùng khớp hoàn toàn biển số đã làm sạch
    if tx_clean == new_clean:
        return True
        
    # 2. Giao dịch hiện tại chưa có biển số thật (trống, Khách lẻ, hoặc trùng với mã đoàn)
    if tx_clean in ("", "KHACHLE", clean_plate(customer_code)):
        return True
        
    # 3. Giao dịch hiện tại có biển số mặc định của mã reset
    if customer_code.startswith("XD") and tx_clean == clean_plate(f"Xe điện {customer_code[2:]}"):
        return True
    if customer_code.startswith("XT") and tx_clean == clean_plate(f"Xe to {customer_code[2:]}"):
        return True
        
    return False

def parse_date(date_str):
    """Parse chuỗi ngày từ KiotViet an toàn với múi giờ."""
    if not date_str:
        return None
    try:
        if "Z" in date_str:
            # Nếu có Z, dùng fromisoformat trực tiếp với replace để Python hiểu Z là UTC
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        else:
            # Nếu không có múi giờ, mặc định hiểu là Asia/Ho_Chi_Minh dùng localize để tránh dùng giờ hệ thống
            naive_dt = datetime.fromisoformat(date_str)
            dt = TZ.localize(naive_dt)
        # Luôn convert về UTC để lưu MongoDB chuẩn
        return dt.astimezone(pytz.utc)
    except Exception as e:
        print(f"Error parsing date {date_str}: {e}")
        return None

def get_access_token():
    """Lấy token xác thực từ KiotViet."""
    url = "https://id.kiotviet.vn/connect/token"
    data = {
        "scopes": "PublicApi.Read PublicApi.Write",
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    res = http_session.post(url, data=data, headers=headers)
    res.raise_for_status()
    return res.json()["access_token"]

def fetch_all_pages(base_url, access_token, page_size=200):
    """Tải dữ liệu đa luồng từ nhiều trang của KiotViet API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-python/1.0"
    }
    
    # 1. Gọi trang đầu tiên để lấy tổng số bản ghi
    params = {"pageSize": page_size, "currentItem": 0}
    res = http_session.get(base_url, headers=headers, params=params)
    res.raise_for_status()
    data_json = res.json()
    
    all_data = data_json.get("data", [])
    total = data_json.get("total", 0)
    
    if total > page_size:
        skips = range(page_size, total, page_size)
        def fetch_chunk(skip):
            p = {"pageSize": page_size, "currentItem": skip}
            r = http_session.get(base_url, headers=headers, params=p)
            if r.ok:
                return r.json().get("data", [])
            return []

        # Tải song song với 5 threads để tránh limit KiotViet
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_skip = {executor.submit(fetch_chunk, s): s for s in skips}
            for future in as_completed(future_to_skip):
                all_data.extend(future.result())
                
    return all_data

def sync_customers(access_token, from_date):
    """Đồng bộ khách hàng mới/thay đổi."""
    url = f"https://public.kiotapi.com/customers?orderBy=createdDate&orderDirection=Desc&lastModifiedFrom={from_date}&includeCustomerGroup=true"
    customers = fetch_all_pages(url, access_token)
    
    if not customers:
        return 0

    updates = []
    processed_count = 0
    
    for c in customers:
        if "{DEL}" in (c.get("name") or ""):
            continue
            
        code = c.get("code", "Khách lẻ")
        groups = c.get("groups", "")
        plate = c.get("licensePlate", "")
        
        # --- ƯU TIÊN LỌC RÁC HỆ THỐNG ---
        is_internal_or_retail = not groups or "Khách lẻ" in groups or "Nội bộ" in groups
        is_reset_pattern = (code.startswith("XD") or code.startswith("XT") or code.isdigit())

        # 1. Lọc tất cả các đoàn Reset (Xe điện XD..., Xe to XT..., hoặc mã chỉ gồm số) 
        # Khách lẻ/Nội bộ không cần tạo placeholder (doanh thu 0), chỉ tạo khi có hóa đơn thực tế.
        if is_internal_or_retail and is_reset_pattern:
            continue

        # 2. Lọc theo Người tạo IT hoặc rỗng (bao quát cả múi giờ UTC của ngày 18/04 VN)
        creator = c.get("creatorName") or ""
        creator_clean = creator.strip().upper()
        created_at_raw = c.get("createdDate") or ""
        # 2026-04-17T17:xx:Z (UTC) chính là 2026-04-18T00:xx (VN)
        is_today_vn = "2026-04-18" in created_at_raw or "2026-04-17T17" in created_at_raw or "2026-04-17T18" in created_at_raw or "2026-04-17T19" in created_at_raw or "2026-04-17T2" in created_at_raw
        
        if is_internal_or_retail and is_today_vn and (not creator_clean or creator_clean == "IT"):
            continue
        # -------------------------------

        if code == "Khách lẻ" or (not groups and not plate and len(code) > 10):
            if not groups and not plate:
                continue

        processed_count += 1
        
        # Parse ngày và chuẩn hóa về múi giờ Việt Nam (để tính start/end of day)
        date_str = c.get("modifiedDate") or c.get("createdDate")
        arrival_date = parse_date(date_str)
        # Nếu không parse được, dùng thời điểm hiện tại (VN)
        arrival_date_vn = arrival_date.astimezone(TZ) if arrival_date else datetime.now(TZ)
        
        # Start/End of day dựa trên ngày đến trong múi giờ VN
        start_of_day = arrival_date_vn.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1, microseconds=-1)
        
        # --- LOGIC QUY ĐỔI BIỂN SỐ VÀ LOẠI XE CHO MÃ RESET ---
        final_plate = plate or c.get("name") or "Khách lẻ."
        final_groups = groups or "Khách lẻ."
        
        if is_reset_pattern and is_internal_or_retail:
            if code.isdigit():
                final_plate = code
                final_groups = "Nội bộ"
            elif code.startswith("XT"):
                num = code[2:]
                final_plate = f"Xe to {num}"
                final_groups = "Khách lẻ."
            elif code.startswith("XD"):
                num = code[2:]
                final_plate = f"Xe điện {num}"
                final_groups = "Khách lẻ."
        # ----------------------------------------------------

        brands = [g.strip() for g in final_groups.split(",") if g.strip()]
        
        # Tìm các transaction tiềm năng trong ngày có cùng mã hoặc customerId
        potential_txs = list(transactions_col.find({
            "arrivalDate": {"$gte": start_of_day, "$lte": end_of_day},
            "$or": [
                {"customerId": c.get("id")},
                {"code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}}
            ]
        }))

        existing_tx = None
        for tx in potential_txs:
            tx_plate = tx.get("licensePlate") or tx.get("vehicleNumber") or ""
            if should_match_transaction(tx_plate, final_plate, code):
                existing_tx = tx
                break

        if existing_tx:
            update_query = {"_id": existing_tx["_id"]}
            update_doc = {
                "$set": {
                    "code": code, "licensePlate": final_plate, "vehicleNumber": final_plate,
                    "groups": final_groups, "brands": brands, "customerId": c.get("id"),
                    "isCustomerDeleted": False,
                    "syncSource": "KiotViet", "updatedAt": datetime.now(pytz.utc)
                }
            }
            updates.append(UpdateOne(update_query, update_doc))
        else:
            new_doc = {
                "code": code,
                "licensePlate": final_plate,
                "vehicleNumber": final_plate,
                "groups": final_groups,
                "brands": brands,
                "customerId": c.get("id"),
                "revenue": 0,
                "profit": 0,
                "status": 0,
                "paymentMethod": 0,
                "isRevenueChanged": False,
                "customerModifiedDate": arrival_date,
                "notes": [],
                "extraFee": 0,
                "extraRevenue": 0,
                "arrivalDate": arrival_date,
                "paidBy": None,
                "updatedBy": None,
                "isCustomerDeleted": False,
                "isFrozen": False,
                "frozenRevenue": 0,
                "syncSource": "KiotViet",
                "createdAt": datetime.now(pytz.utc),
                "updatedAt": datetime.now(pytz.utc)
            }
            updates.append(InsertOne(new_doc))
        
    if updates:
        transactions_col.bulk_write(updates)
        
    return processed_count

def process_invoices_to_transactions(invoices, access_token):
    """Gom nhóm hóa đơn và cập nhật doanh thu."""
    if not invoices:
        return 0, {}
        
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-python/1.0"
    }
        
    # Bước 0: Lấy nhanh thông tin nhóm của các mã khách hàng trong danh sách hóa đơn
    codes = list(set([inv.get("customerCode") for inv in invoices if inv.get("customerCode")]))
    code_to_groups = {}
    if codes:
        # Tìm các record mới nhất của các mã này để xem nhóm
        cursor = transactions_col.find(
            {"code": {"$in": codes}},
            {"code": 1, "groups": 1, "updatedAt": 1}
        ).sort("updatedAt", -1)
        for r in cursor:
            c_code = r.get("code")
            if c_code and c_code not in code_to_groups:
                code_to_groups[c_code] = r.get("groups", "")

    # Bước 1: Quyết định mã khách hàng "tốt nhất" cho từng hóa đơn (tránh trùng lặp doanh thu)
    # Ưu tiên: Xe đoàn (XT/XD) > Khách có mã khác > Khách lẻ (388)
    invoice_to_best_code = {}
    for inv in invoices:
        inv_code = inv.get("code")
        raw_code = inv.get("customerCode") or "Khách lẻ"
        
        # Chuẩn hóa mã khách hàng (bỏ hậu tố {DEL}...)
        if raw_code == "Khách lẻ" or "khách lẻ" in raw_code.lower():
            customer_code = "Khách lẻ"
        elif "DEL" in raw_code.upper():
            customer_code = raw_code.strip()
        else:
            customer_code = raw_code.split("{")[0].strip()
        
        if inv_code not in invoice_to_best_code:
            invoice_to_best_code[inv_code] = customer_code
        else:
            curr_best = invoice_to_best_code[inv_code]
            def get_score(c):
                if c.startswith("XT") or c.startswith("XD"): return 100
                if c.isdigit(): return 75 # Các mã số nội bộ (388, 803...) ưu tiên hơn khách vãng lai
                if c != "Khách lẻ": return 50
                return 0
            
            if get_score(customer_code) > get_score(curr_best):
                invoice_to_best_code[inv_code] = customer_code

    # Bước 1.5: Lấy nhanh thông tin biển số xe lịch sử đã được lưu cho các hóa đơn này (nếu có)
    # Để tránh việc hóa đơn bị cuốn theo tên mới của KiotViet khi sửa tên khách hàng
    invoice_to_existing_plate = {}
    if invoices:
        batch_codes = [inv.get("code") for inv in invoices if inv.get("code")]
        cursor = transactions_col.find(
            {"childInvoices.code": {"$in": batch_codes}},
            {"childInvoices.code": 1, "licensePlate": 1, "vehicleNumber": 1, "code": 1}
        )
        for tx in cursor:
            tx_plate = tx.get("licensePlate") or tx.get("vehicleNumber") or ""
            tx_clean = clean_plate(tx_plate)
            c_code = tx.get("code", "")
            
            is_default = tx_clean in ("", "KHACHLE", clean_plate(c_code))
            if not is_default:
                if c_code.startswith("XD") and tx_clean == clean_plate(f"Xe điện {c_code[2:]}"):
                    is_default = True
                elif c_code.startswith("XT") and tx_clean == clean_plate(f"Xe to {c_code[2:]}"):
                    is_default = True
            
            if not is_default:
                for ci in tx.get("childInvoices", []):
                    ci_code = ci.get("code")
                    if ci_code in batch_codes:
                        invoice_to_existing_plate[ci_code] = tx_plate

    groups = {}
    for inv in invoices:
        raw_code = inv.get("customerCode") or "Khách lẻ"
        if raw_code == "Khách lẻ" or "khách lẻ" in raw_code.lower():
            continue
            
        if "DEL" in raw_code.upper():
            customer_code = raw_code.strip()
        else:
            customer_code = raw_code.split("{")[0].strip()
        
        # CHỈ xử lý hóa đơn này cho mã khách hàng "tốt nhất" đã chọn ở trên
        if invoice_to_best_code.get(inv.get("code")) != customer_code:
            continue

        inv_date = parse_date(inv.get("createdDate")) or datetime.now(pytz.utc)
        date_key = inv_date.astimezone(TZ).strftime("%Y-%m-%d")
        
        # XD/XT: xe tách từng chuyến CHỈ KHI thuộc nhóm Khách lẻ/Nội bộ (vãng lai)
        # Nếu XD/XT thuộc nhóm có tên thực sự ("Xe điện", "45 chỗ"...) → gộp theo ngày như đoàn thường
        existing_groups = code_to_groups.get(customer_code, "")
        is_actually_retail = not existing_groups or "Khách lẻ" in existing_groups or "Nội bộ" in existing_groups
        is_vehicle_reset = (customer_code.startswith("XT") or customer_code.startswith("XD") or customer_code.isdigit())
        
        # Lấy biển số xe và chuẩn hóa
        inv_plate = invoice_to_existing_plate.get(inv.get("code")) or inv.get("customerName") or customer_code
        inv_plate_clean = clean_plate(inv_plate)
        
        # Key: CustomerCode_Date_Plate
        # XD/XT là retail (Khách lẻ./Nội bộ) → tách riêng mỗi hóa đơn
        # XD/XT là đoàn thực (Xe điện, 45 chỗ...) → gộp chung theo ngày của mã đoàn đó
        if is_vehicle_reset and is_actually_retail:
            group_key = f"{customer_code}_{date_key}_{inv.get('code')}"
        else:
            group_key = f"{customer_code}_{date_key}_{inv_plate_clean}"
        
        if group_key not in groups:
            groups[group_key] = {
                "customerCode": customer_code,
                "dateKey": date_key,
                "plate": inv_plate,
                "invoices": [],
                "invoiceCodes": [],
                "cancelledCodes": []
            }
            
        status = inv.get("status")
        status_value = (inv.get("statusValue") or "").lower()
        
        # KiotViet status mapping thực tế:
        #   status=1, statusValue='Hoàn thành'  → Hóa đơn hoàn thành ✅
        #   status=2, statusValue='Đã hủy'      → Hóa đơn đã hủy ❌
        is_cancelled = "hủy" in status_value
        
        if is_cancelled:  # Hóa đơn đã hủy
            groups[group_key]["cancelledCodes"].append(inv.get("code"))
        elif status == 1:  # Hóa đơn hoàn thành
            groups[group_key]["invoiceCodes"].append(inv.get("code"))
            groups[group_key]["invoices"].append(inv)
        # Các trạng thái khác (tạm tính, v.v.) tạm thời chưa tính vào doanh thu đoàn

    units_updated = 0
    for key, g in groups.items():
        # Lấy ngày đầu và cuối của date_key trong múi giờ VN
        dt = datetime.strptime(g["dateKey"], "%Y-%m-%d")
        start_of_day = TZ.localize(dt).replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1, microseconds=-1)
        
        # Tìm kiếm record hiện có
        invoice_codes = g["invoiceCodes"]
        cancelled_codes = g["cancelledCodes"]
        
        # Trường hợp đặc biệt: chỉ có hóa đơn bị hủy, không có hóa đơn hoàn thành mới
        # Cần tìm transaction trong DB và loại bỏ hóa đơn đã hủy, tính lại revenue
        if not invoice_codes:
            if not cancelled_codes:
                continue  # Không có gì để làm
            
            # Có hóa đơn hủy → tìm transaction chứa các hóa đơn đó và cập nhật revenue
            cancel_regex = "|".join([f"\\b{re.escape(c)}\\b" for c in cancelled_codes])
            cancel_match_query = {
                "arrivalDate": {"$gte": start_of_day, "$lte": end_of_day},
                "$or": [
                    {"code": {"$regex": f"^{re.escape(g['customerCode'])}$", "$options": "i"}},
                    {"invoiceCode": {"$regex": cancel_regex}}
                ]
            }
            existing_tx = transactions_col.find_one(cancel_match_query, sort=[("updatedAt", -1)])
            
            if not existing_tx:
                print(f"  [WARN] Có hóa đơn hủy {cancelled_codes} nhưng không tìm thấy transaction để cập nhật.")
                continue
            
            old_child_invoices = existing_tx.get("childInvoices", [])
            new_child_invoices = [ci for ci in old_child_invoices if ci["code"] not in cancelled_codes]
            
            if len(new_child_invoices) == len(old_child_invoices):
                continue  # Không có gì thay đổi (hóa đơn hủy không tồn tại trong childInvoices)
            
            removed = [ci["code"] for ci in old_child_invoices if ci["code"] in cancelled_codes]
            new_total = sum(ci["total"] for ci in new_child_invoices)
            new_invoice_code_str = ", ".join([ci["code"] for ci in new_child_invoices])
            
            print(f"  [CANCEL] Xóa hóa đơn hủy {removed} khỏi transaction, revenue: {existing_tx.get('revenue', 0)} → {new_total}")
            
            transactions_col.update_one(
                {"_id": existing_tx["_id"]},
                {"$set": {
                    "childInvoices": new_child_invoices,
                    "revenue": new_total,
                    "invoiceCode": new_invoice_code_str,
                    "updatedAt": datetime.now(pytz.utc)
                }}
            )
            units_updated += 1
            continue
            
        code_str = g["customerCode"]
        group_plate = g["plate"]
        group_plate_clean = clean_plate(group_plate)
        
        # Lấy lại thông tin nhóm hiện tại của mã này để quyết định match_query
        current_groups = code_to_groups.get(code_str, "")
        # is_retail_logic: XD/XT vãng lai (Khách lẻ/Nội bộ) → match từng invoiceCode riêng
        # XD/XT đoàn thực (Xe điện, 45 chỗ...) → match theo code + ngày
        is_retail_logic = (code_str.startswith("XT") or code_str.startswith("XD")) and \
                          (not current_groups or "Khách lẻ" in current_groups or "Nội bộ" in current_groups)
        
        existing_tx = None
        if is_retail_logic:
            # Khách vãng lai: match chính xác theo invoiceCode từng cái riêng và phải khớp code_str
            match_query = {
                "code": {"$regex": f"^{re.escape(code_str)}$", "$options": "i"},
                "arrivalDate": {"$gte": start_of_day, "$lte": end_of_day},
                "invoiceCode": {"$regex": f"\\b{re.escape(invoice_codes[0])}\\b"}
            }
            existing_tx = transactions_col.find_one(match_query, sort=[("updatedAt", -1)])
        else:
            # Trường hợp Xe đoàn: tìm tất cả transaction cùng mã đoàn, cùng ngày, chưa thanh toán (status = 0)
            potential_txs = list(transactions_col.find({
                "code": {"$regex": f"^{re.escape(code_str)}$", "$options": "i"},
                "arrivalDate": {"$gte": start_of_day, "$lte": end_of_day},
                "status": 0
            }))
            
            for tx in potential_txs:
                tx_plate = tx.get("licensePlate") or tx.get("vehicleNumber") or ""
                if should_match_transaction(tx_plate, group_plate, code_str):
                    existing_tx = tx
                    break
        
        # Logic gộp và xử lý hóa đơn con...
        # (Để đơn giản và hiệu quả, ta sẽ cập nhật các hóa đơn và tính doanh thu tổng)
        
        child_invoices = []
        if existing_tx and "childInvoices" in existing_tx:
            # Lọc bỏ: 
            # 1. Hóa đơn bị hủy
            # 2. Hóa đơn hiện đã thuộc về một mã khách hàng khác (theo invoice_to_best_code)
            child_invoices = [
                ci for ci in existing_tx["childInvoices"] 
                if ci["code"] not in g["cancelledCodes"] and 
                invoice_to_best_code.get(ci["code"], g["customerCode"]) == g["customerCode"]
            ]
            
        # Thêm/Cập nhật hóa đơn mới
        for inv in g["invoices"]:
            products = ", ".join([d.get("productName", "") for d in inv.get("invoiceDetails", [])])
            new_ci = {
                "code": inv.get("code"),
                "purchaseDate": parse_date(inv.get("createdDate")),
                "soldByName": inv.get("soldByName", "Hệ thống"),
                "total": inv.get("total", 0),
                "mainProducts": products
            }
            # Thay thế nếu đã có, hoặc thêm mới
            found = False
            for i, ci in enumerate(child_invoices):
                if ci["code"] == new_ci["code"]:
                    child_invoices[i] = new_ci
                    found = True
                    break
            if not found:
                child_invoices.append(new_ci)
        
        # arrivalDate = thời điểm hóa đơn cuối cùng (mới nhất)
        if child_invoices:
            g["arrivalDate"] = max(ci["purchaseDate"] for ci in child_invoices)
                
        total_revenue = sum(ci["total"] for ci in child_invoices)
        final_invoice_codes = ", ".join([ci["code"] for ci in child_invoices])
        
        latest_inv = g["invoices"][-1] if g["invoices"] else None
        
        # Logic quy đổi chỉ áp dụng nếu KHÔNG có thông tin nhóm xịn từ trước
        final_plate = group_plate
        final_groups = "Khách lẻ."
        
        # Nếu đã có record cũ, ưu tiên dùng lại nhóm/biển số của record cũ (tránh bị reset về "Khách lẻ.")
        if existing_tx:
            final_plate = existing_tx.get("licensePlate") or existing_tx.get("vehicleNumber") or final_plate
            final_groups = existing_tx.get("groups") or final_groups
        else:
            # Logic quy đổi biển số/nhóm cho các mã đặc biệt (XT/XD/Số) chỉ áp dụng khi tạo mới
            final_groups = code_to_groups.get(code_str, "Khách lẻ.")
            
            # Tra cứu trực tiếp KiotViet API nếu không tìm thấy trong DB nội bộ nhằm tránh trễ hiển thị 2 phút
            if final_groups == "Khách lẻ.":
                try:
                    cust_url = f"https://public.kiotapi.com/customers?code={code_str}&includeCustomerGroup=true"
                    cust_res = http_session.get(cust_url, headers=headers)
                    if cust_res.ok:
                        cust_data = cust_res.json().get("data", [])
                        if cust_data:
                            cust_info = cust_data[0]
                            final_groups = cust_info.get("groups") or "Khách lẻ."
                            final_plate = cust_info.get("licensePlate") or cust_info.get("name") or final_plate
                except Exception as e:
                    print(f"Error querying KiotViet customer lookup for {code_str}: {e}")

            if code_str.isdigit():
                # Luôn đảm bảo các mã số nội bộ (388, 803...) thuộc nhóm Nội bộ
                if not final_groups or "Khách lẻ" in final_groups or "Nội bộ" in final_groups:
                    final_groups = "Nội bộ"
            elif is_retail_logic:
                # Chỉ áp dụng logic "Xe to/Xe điện" nếu nhóm hiện tại vẫn đang là khách lẻ/trống
                if not final_groups or "Khách lẻ" in final_groups or "Nội bộ" in final_groups:
                    if code_str.startswith("XT"):
                        final_plate = f"Xe to {code_str[2:]}"
                        final_groups = "Khách lẻ."
                    elif code_str.startswith("XD"):
                        final_plate = f"Xe điện {code_str[2:]}"
                        final_groups = "Khách lẻ."

        brands = [group_str.strip() for group_str in final_groups.split(",") if group_str.strip()]
        
        update_set = {
            "code": g["customerCode"],
            "licensePlate": final_plate,
            "vehicleNumber": final_plate,
            "groups": final_groups,
            "brands": brands,
            "revenue": total_revenue,
            "invoiceCode": final_invoice_codes,
            "childInvoices": child_invoices,
            "arrivalDate": g.get("arrivalDate", start_of_day),  # luôn cập nhật nếu có HD sớm hơn
            "isCustomerDeleted": False,
            "syncSource": "KiotViet",
            "updatedAt": datetime.now(pytz.utc)
        }
        
        if latest_inv:
            update_set["sellerName"] = latest_inv.get("soldByName", "Hệ thống")
            
        if existing_tx:
            transactions_col.update_one(
                {"_id": existing_tx["_id"]},
                {"$set": update_set}
            )
            existing_tx_id = existing_tx["_id"]
        else:
            new_doc = {
                "code": g["customerCode"],
                "status": 0, 
                "paymentMethod": 0, 
                "notes": [], 
                "extraFee": 0, 
                "extraRevenue": 0,
                "licensePlate": final_plate,
                "vehicleNumber": final_plate,
                "groups": final_groups,
                "brands": brands,
                "createdAt": datetime.now(pytz.utc)
            }
            new_doc.update(update_set)
            insert_res = transactions_col.insert_one(new_doc)
            existing_tx_id = insert_res.inserted_id

        # Rút các hóa đơn này ra khỏi các giao dịch khác (nếu có) trên cùng ngày để tránh trùng lặp
        if invoice_codes:
            other_txs = list(transactions_col.find({
                "_id": {"$ne": existing_tx_id},
                "arrivalDate": {"$gte": start_of_day, "$lte": end_of_day},
                "childInvoices.code": {"$in": invoice_codes}
            }))
            for otx in other_txs:
                otx_childs = [ci for ci in otx.get("childInvoices", []) if ci["code"] not in invoice_codes]
                otx_revenue = sum(ci["total"] for ci in otx_childs)
                otx_invoice_codes = ", ".join([ci["code"] for ci in otx_childs])
                transactions_col.update_one(
                    {"_id": otx["_id"]},
                    {"$set": {
                        "childInvoices": otx_childs,
                        "revenue": otx_revenue,
                        "invoiceCode": otx_invoice_codes,
                        "updatedAt": datetime.now(pytz.utc)
                    }}
                )

        units_updated += 1
        
    return units_updated, invoice_to_best_code

def verify_customer_existence(access_token, customer_ids):
    """Kiểm tra xem danh sách ID khách hàng có còn tồn tại trên KiotViet hay không."""
    if not customer_ids:
        return []

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-python/1.0"
    }
    
    deleted_ids = []
    
    def check_one(cid):
        url = f"https://public.kiotapi.com/customers/{cid}"
        try:
            res = http_session.get(url, headers=headers, timeout=10)
            if res.status_code == 420: # Đối tượng không tồn tại
                return cid, True
            return cid, False
        except Exception as e:
            print(f"Error checking customer {cid}: {e}")
            return cid, False

    # Sử dụng ThreadPool (tối đa 5 luồng để tránh rate limit)
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(check_one, cid): cid for cid in customer_ids}
        for future in as_completed(futures):
            cid, is_deleted = future.result()
            if is_deleted:
                deleted_ids.append(cid)
                
    return deleted_ids

def merge_duplicate_transactions(from_date_dt, invoice_to_best_code):
    """
    Sau khi đồng bộ xong, gộp các records trùng mã cùng ngày về 1 bản ghi chính.
    Xảy ra khi: hóa đơn được xử lý trước thông tin nhóm khách hàng sẵn sàng trong DB.
    Lưu ý: KHÔNG gộp nếu records có customerId khác nhau (đó là 2 chuyến khác nhau).
    Sử dụng invoice_to_best_code để loại bỏ các hóa đơn không còn thuộc về mã này.
    """
    start_utc = from_date_dt.astimezone(pytz.utc)
    cursor = transactions_col.find(
        {"arrivalDate": {"$gte": start_utc}},
        {"code": 1, "arrivalDate": 1, "groups": 1, "childInvoices": 1, "customerId": 1,
         "revenue": 1, "invoiceCode": 1, "licensePlate": 1, "vehicleNumber": 1, "updatedAt": 1}
    )
    
    # Nhóm các records theo (code, date_key, plate_clean)
    by_code_date = {}
    for r in cursor:
        code = r.get("code", "")
        arr = r.get("arrivalDate")
        plate = r.get("licensePlate") or r.get("vehicleNumber") or ""
        if not code or not arr:
            continue
        date_key = arr.astimezone(TZ).strftime("%Y-%m-%d")
        plate_clean = clean_plate(plate)
        key = f"{code}_{date_key}_{plate_clean}"
        if key not in by_code_date:
            by_code_date[key] = []
        by_code_date[key].append(r)
    
    merged_count = 0
    for key, group in by_code_date.items():
        if len(group) <= 1:
            continue  # Không có trùng lặp
        
        # Tách nhóm theo customerId để không gộp nhầm 2 chuyến khác nhau
        # Nhóm "None" có thể hợp nhất vào một customerId cụ thể nếu cùng invoiceCode pattern
        by_customer = {}
        none_group = []
        for r in group:
            cid = r.get("customerId")
            if cid:
                if cid not in by_customer:
                    by_customer[cid] = []
                by_customer[cid].append(r)
            else:
                none_group.append(r)
        
        # Gán các records "None" vào nhóm customerId có invoice trùng, hoặc gộp chúng lại với nhau
        if none_group:
            if len(by_customer) == 1:
                # Chỉ có 1 customerId trong ngày → gán tất cả None vào đó
                cid = list(by_customer.keys())[0]
                by_customer[cid].extend(none_group)
            elif len(by_customer) == 0:
                # Không có customerId nào → gộp tất cả None lại với nhau
                by_customer["_none"] = none_group
            else:
                # Nhiều customerId → None không biết thuộc cái nào, gộp riêng
                by_customer["_none"] = none_group
        
        # Merge từng nhóm customerId
        for cid_key, sub_group in by_customer.items():
            if len(sub_group) <= 1:
                continue
            
            # Chọn record "chính": ưu tiên có customerId, sau đó nhóm không phải Khách lẻ
            def score(r):
                s = 0
                if r.get("customerId"):
                    s += 10
                g = r.get("groups") or ""
                if "Khách lẻ" not in g and "Nội bộ" not in g and g:
                    s += 5
                return s
            
            sub_group.sort(key=score, reverse=True)
            primary = sub_group[0]
            duplicates = sub_group[1:]
            
            # Gom tất cả childInvoices không trùng vào primary, đồng thời lọc theo invoice_to_best_code
            code_str = primary.get("code")
            merged_childs = {}
            # Kiểm tra invoices từ record chính
            for ci in primary.get("childInvoices", []):
                if invoice_to_best_code.get(ci["code"], code_str) == code_str:
                    merged_childs[ci["code"]] = ci
            
            # Kiểm tra invoices từ các record trùng lặp
            for dup in duplicates:
                for ci in dup.get("childInvoices", []):
                    if ci["code"] not in merged_childs:
                        if invoice_to_best_code.get(ci["code"], code_str) == code_str:
                            merged_childs[ci["code"]] = ci
            
            final_childs = sorted(merged_childs.values(), key=lambda x: x.get("purchaseDate") or datetime.min)
            final_revenue = sum(ci.get("total", 0) for ci in final_childs)
            final_invoice_codes = ", ".join(ci["code"] for ci in final_childs)
            
            print(f"  [MERGE] {key}(cid={cid_key}): gộp {len(sub_group)} records → 1 (invoices: {final_invoice_codes}, revenue: {final_revenue})")
            
            # Cập nhật record chính
            transactions_col.update_one(
                {"_id": primary["_id"]},
                {"$set": {
                    "childInvoices": final_childs,
                    "revenue": final_revenue,
                    "invoiceCode": final_invoice_codes,
                    "updatedAt": datetime.now(pytz.utc)
                }}
            )
            
            # Xóa các records thừa
            dup_ids = [d["_id"] for d in duplicates]
            transactions_col.delete_many({"_id": {"$in": dup_ids}})
            merged_count += 1
    
    return merged_count

def run_sync(range_mode="yesterday"):
    print(f"[{datetime.now()}] Starting Python Sync Job (Range: {range_mode})...")
    start_time = time.time()
    
    try:
        # 1. Auth
        token = get_access_token()
        
        # 2. Determine Time Range (Luôn dùng múi giờ VN)
        now_vn = datetime.now(TZ)
        if range_mode == "yesterday":
            # Lấy từ 00:00:00 của ngày hôm qua
            from_date_dt = (now_vn - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            from_date = from_date_dt.isoformat()
        else: # 1day/auto
            # Lấy từ 00:00:00 của ngày hôm nay
            from_date_dt = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
            from_date = from_date_dt.isoformat()
            
        print(f"-> Syncing from: {from_date} (VN Time)")
            
        # 3. Customer Sync
        customers_processed = sync_customers(token, from_date)
        print(f"-> Customers processed: {customers_processed}")
        
        # 4. Invoice Sync
        url_invoices = f"https://public.kiotapi.com/invoices?orderBy=createdDate&orderDirection=Desc&lastModifiedFrom={from_date}&includeInvoiceDetails=true"
        invoices = fetch_all_pages(url_invoices, token)
        units_updated, invoice_to_best_code = process_invoices_to_transactions(invoices, token)
        print(f"-> Invoices processed: {len(invoices)} (Groups updated: {units_updated})")
        
        # 5. Merge duplicates (records bị tách nhầm do đồng bộ không theo thứ tự)
        merged = merge_duplicate_transactions(from_date_dt, invoice_to_best_code)
        if merged:
            print(f"-> Merged {merged} duplicate group(s)")
        
        # 5. Deletion Check (Phát hiện khách hàng bị xóa cứng)
        # CHỈ kiểm tra cho các giao dịch của ngày HÔM NAY (theo yêu cầu: "chỉ cần check trong ngày thôi")
        today_start_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
        today_start_utc = today_start_vn.astimezone(pytz.utc)
        
        active_query = {
            "arrivalDate": {"$gte": today_start_utc},
            "customerId": {"$exists": True, "$ne": None},
            "isCustomerDeleted": {"$ne": True}
        }
        active_transactions = transactions_col.find(active_query, {"customerId": 1})
        customer_ids_to_check = list(set([tx["customerId"] for tx in active_transactions if tx.get("customerId")]))
        
        if customer_ids_to_check:
            print(f"-> Verifying existence of {len(customer_ids_to_check)} customers...")
            deleted_ids = verify_customer_existence(token, customer_ids_to_check)
            if deleted_ids:
                print(f"-> Found {len(deleted_ids)} deleted customers on KiotViet: {deleted_ids}")
                transactions_col.update_many(
                    {"customerId": {"$in": deleted_ids}},
                    {"$set": {"isCustomerDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
                )
        
        # 6. Update Last Sync
        kiotviets_col.update_one({"key": "kiotviet"}, {"$set": {"lastSyncAt": datetime.now(pytz.utc)}}, upsert=True)
        
        duration = time.time() - start_time
        print(f"[{datetime.now()}] Sync completed in {duration:.2f}s.")
        
    except Exception as e:
        print(f"Critical Error during sync: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "yesterday"
    run_sync(mode)
