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

# Load environment variables
_root_env = os.path.join(os.path.dirname(__file__), "..", ".env.local")
if os.path.exists(".env.local"):
    load_dotenv(".env.local")
elif os.path.exists(_root_env):
    load_dotenv(_root_env)
elif os.path.exists(".env"):
    load_dotenv(".env")
else:
    load_dotenv()

# Configuration
MONGODB_URI = os.getenv("MONGODB_URI")
CLIENT_ID = os.getenv("KIOTVIET_CLIENT_ID")
CLIENT_SECRET = os.getenv("KIOTVIET_CLIENT_SECRET")
RETAILER_CODE = os.getenv("KIOTVIET_RETAILER_CODE", "haisandongduog")
TZ = pytz.timezone("Asia/Ho_Chi_Minh")

if not all([MONGODB_URI, CLIENT_ID, CLIENT_SECRET]):
    print(f"[{datetime.now()}] ERROR: Missing required environment variables")
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

# MongoDB Setup
client = MongoClient(MONGODB_URI, tz_aware=True)
db = client.get_database()
transactions_col = db["revenues"] # transactions mapper sang revenues
kiotviets_col = db["kiotviets"]
customers_col = db["customers"]
customers_orig_col = db["customers_original"]
invoices_col = db["invoices"]

# Khóa file tránh chạy song song
lock_file_handle = None

def acquire_lock():
    global lock_file_handle
    lock_file = os.path.join(os.path.dirname(__file__), "sync.lock")
    lock_file_handle = open(lock_file, "w")
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(lock_file_handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock_file_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_file_handle.write(str(os.getpid()))
        lock_file_handle.flush()
        return True
    except (IOError, OSError):
        print(f"[{datetime.now()}] WARN: Another sync process is already running. Skipping this run.")
        sys.exit(0)

def clean_plate(plate):
    if not plate:
        return ""
    return re.sub(r'[^A-Z0-9]', '', plate.strip().upper())

def should_match_transaction(tx_plate, new_plate, customer_code):
    if customer_code.startswith("XT") or customer_code.startswith("XD") or customer_code.startswith("AS"):
        return True

    tx_clean = clean_plate(tx_plate)
    new_clean = clean_plate(new_plate)
    
    if tx_clean == new_clean:
        return True
        
    if tx_clean in ("", "KHACHLE", clean_plate(customer_code)):
        return True
        
    if customer_code.startswith("XD") and tx_clean == clean_plate(f"Xe điện {customer_code[2:]}"):
        return True
    if customer_code.startswith("XT") and tx_clean == clean_plate(f"Xe to {customer_code[2:]}"):
        return True
    if customer_code.startswith("AS") and tx_clean == clean_plate(f"AS {customer_code[2:]}"):
        return True
        
    return False

def parse_date(date_str):
    if not date_str:
        return None
    try:
        clean_str = date_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = TZ.localize(dt)
        return dt.astimezone(pytz.utc)
    except Exception as e:
        print(f"Error parsing date {date_str}: {e}")
        return None

def get_access_token():
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
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-python/1.0"
    }
    
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

        with ThreadPoolExecutor(max_workers=1) as executor:
            future_to_skip = {executor.submit(fetch_chunk, s): s for s in skips}
            for future in as_completed(future_to_skip):
                all_data.extend(future.result())
                
    return all_data

def strip_del_suffix(s):
    if not s:
        return ""
    return re.sub(r'[\{\(]DEL\d*[\}\)]', '', s).strip()

def sync_customers(access_token, from_date, is_full_sync=False):
    """Đồng bộ khách hàng mới/thay đổi vào bảng customers và customers_original."""
    url = f"https://public.kiotapi.com/customers?orderBy=createdDate&orderDirection=Desc&lastModifiedFrom={from_date}&includeCustomerGroup=true"
    customers = fetch_all_pages(url, access_token)
    
    live_customer_ids = set(c.get("id") for c in customers if c.get("id"))
    
    if not customers:
        return 0, live_customer_ids

    orig_updates = []
    appended_count = 0
    processed_count = 0
    
    for c in customers:
        code = c.get("code", "Khách lẻ")
        raw_name = c.get("name") or ""
        
        is_deleted_on_kv = "{DEL}" in raw_name or "{DEL}" in code or "DEL" in code or "DEL" in raw_name
        
        if is_deleted_on_kv:
            clean_code = strip_del_suffix(code)
            customers_orig_col.update_many(
                {"$or": [{"customerId": c.get("id")}, {"code": {"$regex": f"^{re.escape(clean_code)}$", "$options": "i"}}]},
                {"$set": {"isDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
            )
            customers_col.update_many(
                {"$or": [{"customerId": c.get("id")}, {"code": {"$regex": f"^{re.escape(clean_code)}$", "$options": "i"}}]},
                {"$set": {"isDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
            )
            processed_count += 1
            continue
            
        groups = c.get("groups", "")
        is_internal_or_retail = not groups or "Khách lẻ" in groups or "Nội bộ" in groups or "Taxi" in groups or "Xe ôm" in groups or "Xe điện" in groups
        is_reset_pattern = (code.startswith("XD") or code.startswith("XT") or code.startswith("AS") or code.isdigit())

        creator = c.get("creatorName") or ""
        creator_clean = creator.strip().upper()
        created_at_raw = c.get("createdDate") or ""
        is_today_vn = "2026-04-18" in created_at_raw or "2026-04-17T17" in created_at_raw or "2026-04-17T18" in created_at_raw or "2026-04-17T19" in created_at_raw or "2026-04-17T2" in created_at_raw
        
        if is_internal_or_retail and is_today_vn and (not creator_clean or creator_clean == "IT"):
            continue

        if code == "Khách lẻ" or (not groups and not c.get("name") and len(code) > 10):
            if not groups and not c.get("name"):
                continue

        processed_count += 1
        
        final_name = raw_name or "Khách lẻ."
        final_groups = groups or "Khách lẻ."
        
        num_suffix = code[2:] if len(code) > 2 else ""
        default_names = {code, f"Xe điện {num_suffix}", f"Xe to {num_suffix}", f"AS {num_suffix}"}
        is_name_customized = raw_name and (raw_name not in default_names)
        
        if is_reset_pattern and is_internal_or_retail and not is_name_customized:
            if code.isdigit():
                final_name = code
                final_groups = "Nội bộ"
            elif code.startswith("XT"):
                final_name = f"Xe to {num_suffix}"
            elif code.startswith("XD"):
                final_name = f"Xe điện {num_suffix}"
            elif code.startswith("AS"):
                final_name = f"AS {num_suffix}"

        existing_orig = customers_orig_col.find_one({
            "$or": [
                {"customerId": c.get("id")},
                {"code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}}
            ]
        })
        
        should_append_to_customers = False
        
        if is_full_sync:
            if existing_orig:
                update_query = {"_id": existing_orig["_id"]}
                update_doc = {
                    "$set": {
                        "customerId": c.get("id"),
                        "code": code,
                        "name": final_name,
                        "groups": final_groups,
                        "creatorName": c.get("creatorName") or "",
                        "isDeleted": False,
                        "updatedAt": datetime.now(pytz.utc)
                    }
                }
                orig_updates.append(UpdateOne(update_query, update_doc))
            else:
                new_doc = {
                    "customerId": c.get("id"),
                    "code": code,
                    "name": final_name,
                    "groups": final_groups,
                    "creatorName": c.get("creatorName") or "",
                    "isDeleted": False,
                    "createdAt": datetime.now(pytz.utc),
                    "updatedAt": datetime.now(pytz.utc)
                }
                orig_updates.append(InsertOne(new_doc))
        else:
            if not existing_orig:
                should_append_to_customers = True
            else:
                orig_groups = existing_orig.get("groups") or ""
                orig_name = existing_orig.get("name") or ""
                orig_is_deleted = existing_orig.get("isDeleted") or False
                
                if orig_groups != final_groups or orig_name != final_name or orig_is_deleted != False:
                    should_append_to_customers = True

        if should_append_to_customers:
            last_cust = customers_col.find_one({"code": code}, sort=[("createdAt", -1)])
            if not last_cust or last_cust.get("groups") != final_groups or last_cust.get("name") != final_name:
                new_cust_doc = {
                    "customerId": c.get("id"),
                    "code": code,
                    "name": final_name,
                    "groups": final_groups,
                    "creatorName": c.get("creatorName") or "",
                    "isDeleted": False,
                    "createdAt": datetime.now(pytz.utc),
                    "updatedAt": datetime.now(pytz.utc)
                }
                customers_col.insert_one(new_cust_doc)
                appended_count += 1
                
    if is_full_sync and orig_updates:
        customers_orig_col.bulk_write(orig_updates)
        print(f"-> Đã đồng bộ {len(orig_updates)} khách hàng sang bảng snapshot customers_original.")
        
    if appended_count > 0:
        print(f"-> Đã ghi thêm {appended_count} bản ghi khách hàng mới/thay đổi vào bảng customers.")
        
    return processed_count, live_customer_ids

def check_deleted_todays_customers(access_token, live_customer_ids, today_start_utc):
    today_db_customers = list(customers_col.find(
        {
            "isDeleted": {"$ne": True},
            "customerId": {"$exists": True, "$ne": None},
            "createdAt": {"$gte": today_start_utc}
        },
        {"customerId": 1, "code": 1, "_id": 1}
    ))

    if not today_db_customers:
        return 0

    missing_candidates = [
        c for c in today_db_customers
        if c.get("customerId") not in live_customer_ids
    ]

    if not missing_candidates:
        return 0

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Retailer": RETAILER_CODE,
        "User-Agent": "haisandongduong-python/1.0"
    }

    deleted_count = 0
    for cust in missing_candidates:
        cid = cust["customerId"]
        code = cust["code"]
        try:
            res = http_session.get(
                f"https://public.kiotapi.com/customers/{cid}",
                headers=headers,
                timeout=10
            )
            is_deleted_on_kv = res.status_code in (404, 420)
            if not is_deleted_on_kv and res.ok:
                try:
                    body = res.json()
                    if not body or (isinstance(body, dict) and not body.get("id")):
                        is_deleted_on_kv = True
                except Exception:
                    pass

            if is_deleted_on_kv:
                customers_col.update_many(
                    {"$or": [{"customerId": cid}, {"code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}}]},
                    {"$set": {"isDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
                )
                customers_orig_col.update_many(
                    {"$or": [{"customerId": cid}, {"code": {"$regex": f"^{re.escape(code)}$", "$options": "i"}}]},
                    {"$set": {"isDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
                )
                deleted_count += 1
                print(f"-> [Delete Check] Khách hàng '{code}' đã bị xóa trên KiotViet.")
        except Exception as e:
            print(f"-> [Delete Check] Lỗi khi kiểm tra khách hàng '{code}': {e}")

    return deleted_count

def sync_raw_invoices_to_db(invoices):
    if not invoices:
        return 0
    
    updates = []
    customer_codes = set()
    customer_info = {}
    
    for inv in invoices:
        inv_id = inv.get("id")
        code = inv.get("code")
        if not inv_id or not code:
            continue
            
        created_date = parse_date(inv.get("createdDate"))
        modified_date = parse_date(inv.get("modifiedDate")) if inv.get("modifiedDate") else None
        
        ccode = inv.get("customerCode")
        cid = inv.get("customerId")
        cname = inv.get("customerName")
        if ccode and ccode != "Khách lẻ" and "khách lẻ" not in ccode.lower() and cid:
            is_del = "{DEL}" in ccode or "{DEL}" in (cname or "") or "DEL" in ccode or "DEL" in (cname or "")
            clean_ccode = strip_del_suffix(ccode)
            clean_cname = strip_del_suffix(cname)
            
            customer_codes.add(clean_ccode)
            customer_info[clean_ccode] = {
                "customerId": cid,
                "name": clean_cname or clean_ccode,
                "isDeleted": is_del
            }
            ccode = clean_ccode
            cname = clean_cname
        
        details = []
        for detail in inv.get("invoiceDetails", []):
            details.append({
                "productId": detail.get("productId"),
                "productCode": detail.get("productCode"),
                "productName": detail.get("productName"),
                "quantity": detail.get("quantity"),
                "price": detail.get("price"),
                "subTotal": detail.get("subTotal")
            })
            
        update_doc = {
            "$set": {
                "invoiceId": inv_id,
                "code": code,
                "createdDate": created_date,
                "modifiedDate": modified_date,
                "customerId": cid,
                "customerCode": ccode,
                "customerName": cname,
                "branchId": inv.get("branchId"),
                "branchName": inv.get("branchName"),
                "total": inv.get("total", 0),
                "totalPayment": inv.get("totalPayment", 0),
                "status": inv.get("status"),
                "soldByName": inv.get("soldByName"),
                "invoiceDetails": details,
                "updatedAt": datetime.now(pytz.utc)
            },
            "$setOnInsert": {
                "createdAt": datetime.now(pytz.utc)
            }
        }
        
        updates.append(UpdateOne(
            {"code": code},
            update_doc,
            upsert=True
        ))
        
    if customer_codes:
        existing_custs = set(c["code"] for c in customers_col.find({"code": {"$in": list(customer_codes)}}, {"code": 1}))
        existing_origs = set(c["code"] for c in customers_orig_col.find({"code": {"$in": list(customer_codes)}}, {"code": 1}))
        existing_codes = existing_custs | existing_origs
        missing_codes = customer_codes - existing_codes
        
        for code_item in customer_codes:
            info = customer_info[code_item]
            if info.get("isDeleted"):
                customers_orig_col.update_many(
                    {"$or": [{"customerId": info["customerId"]}, {"code": {"$regex": f"^{re.escape(code_item)}$", "$options": "i"}}]},
                    {"$set": {"isDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
                )
                customers_col.update_many(
                    {"$or": [{"customerId": info["customerId"]}, {"code": {"$regex": f"^{re.escape(code_item)}$", "$options": "i"}}]},
                    {"$set": {"isDeleted": True, "updatedAt": datetime.now(pytz.utc)}}
                )
        
        if missing_codes:
            new_cust_inserts = []
            for code_item in missing_codes:
                info = customer_info[code_item]
                is_reset_pattern = (code_item.startswith("XD") or code_item.startswith("XT") or code_item.startswith("AS") or code_item.isdigit())
                final_name = info["name"] or code_item
                final_groups = "Khách lẻ."
                
                if is_reset_pattern:
                    if code_item.isdigit():
                        final_name = code_item
                        final_groups = "Nội bộ"
                    elif code_item.startswith("XT"):
                        final_name = f"Xe to {code_item[2:]}"
                    elif code_item.startswith("XD"):
                        final_name = f"Xe điện {code_item[2:]}"
                    elif code_item.startswith("AS"):
                        final_name = f"AS {code_item[2:]}"
                
                new_doc = {
                    "customerId": info["customerId"],
                    "code": code_item,
                    "name": final_name,
                    "groups": final_groups,
                    "creatorName": "Hệ thống (Hóa đơn)",
                    "isDeleted": info.get("isDeleted", False),
                    "createdAt": datetime.now(pytz.utc),
                    "updatedAt": datetime.now(pytz.utc)
                }
                new_cust_inserts.append(InsertOne(new_doc))
                
            if new_cust_inserts:
                customers_col.bulk_write(new_cust_inserts)
                print(f"-> Tự động tạo thêm {len(new_cust_inserts)} khách hàng mới từ hóa đơn vào bảng customers.")
                
    if updates:
        res = invoices_col.bulk_write(updates)
        return res.upserted_count + res.modified_count
    return 0

def run_sync(range_mode="yesterday"):
    acquire_lock()

    print(f"[{datetime.now()}] Starting Python Sync Job (Range: {range_mode})...")
    start_time = time.time()
    
    try:
        # 1. Auth
        token = get_access_token()
        
        # 2. Determine Time Range (VN Time)
        now_vn = datetime.now(TZ)
        start_of_today = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
        today_str = now_vn.strftime("%Y-%m-%d")
        
        # Kiểm tra xem có cần đồng bộ toàn bộ khách hàng (Full Customer Sync) lúc 2:10 sáng không
        should_do_full_customer_sync = False
        if range_mode == "all":
            should_do_full_customer_sync = True
        elif range_mode in ("auto", "1day"):
            kv_doc = kiotviets_col.find_one({"key": "kiotviet"}) or {}
            last_full_sync_date = kv_doc.get("lastFullCustomerSyncDate")
            
            is_after_2_10 = (now_vn.hour > 2) or (now_vn.hour == 2 and now_vn.minute >= 10)
            if is_after_2_10 and last_full_sync_date != today_str:
                should_do_full_customer_sync = True
                print(f"-> Kích hoạt đồng bộ toàn bộ khách hàng định kỳ 2h10 sáng.")
        
        if range_mode == "yesterday":
            from_date_dt = (now_vn - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            customer_from_date = from_date_dt.isoformat()
            invoice_from_date = from_date_dt.isoformat()
        elif should_do_full_customer_sync:
            from_date_dt = TZ.localize(datetime(2020, 1, 1))
            customer_from_date = from_date_dt.isoformat()
            invoice_from_date = start_of_today.isoformat()
        else: # 1day/auto
            customer_from_date = start_of_today.isoformat()
            from_date_dt = start_of_today
            invoice_from_date = from_date_dt.isoformat()
            
        print(f"-> Customer Sync from: {customer_from_date} (VN Time)")
        print(f"-> Invoice Sync from: {invoice_from_date} (VN Time)")
            
        # 3. Customer Sync
        should_sync_cust_now = (range_mode in ("all", "yesterday")) or should_do_full_customer_sync
        today_start_utc = start_of_today.astimezone(pytz.utc)
        
        if should_sync_cust_now:
            print("-> Đang xóa dữ liệu cũ trong bảng customers_original để đồng bộ mới hoàn toàn...")
            customers_orig_col.delete_many({})
            customers_processed, _ = sync_customers(token, customer_from_date, is_full_sync=True)
            print(f"-> Snapshot customers processed: {customers_processed}")
        else:
            customers_processed, live_customer_ids = sync_customers(token, customer_from_date, is_full_sync=False)
            deleted_count = check_deleted_todays_customers(token, live_customer_ids, today_start_utc)
            if deleted_count > 0:
                print(f"-> [Delete Check] Đã đánh dấu xóa {deleted_count} khách hàng bị hard-delete.")
        
        # 4. Invoice Sync
        url_invoices = f"https://public.kiotapi.com/invoices?orderBy=createdDate&orderDirection=Desc&lastModifiedFrom={invoice_from_date}&includeInvoiceDetails=true"
        invoices = fetch_all_pages(url_invoices, token)
        
        # Lưu hóa đơn thô vào bảng invoices
        raw_invoices_synced = sync_raw_invoices_to_db(invoices)
        print(f"-> Raw invoices synced/updated in DB: {raw_invoices_synced}")
        
        # 6. Update Last Sync
        update_fields = {"lastSyncAt": datetime.now(pytz.utc)}
        if should_do_full_customer_sync:
            update_fields["lastFullCustomerSyncDate"] = today_str
            print(f"-> Ghi nhận đã hoàn thành đồng bộ toàn bộ khách hàng cho ngày: {today_str}")
            
        kiotviets_col.update_one({"key": "kiotviet"}, {"$set": update_fields}, upsert=True)
        
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
