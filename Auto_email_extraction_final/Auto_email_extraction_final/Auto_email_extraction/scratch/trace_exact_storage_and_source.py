import sqlite3
import json
import os

print("======================================================================")
print("EMPIRICAL TRACE OF RECORD STORAGE AND SOURCE IN THE CODEBASE")
print("======================================================================")

# Target IDs shown in user's UI screenshot
target_ids = [
    "523759", "523624", "523545", "518236", "523121", "523690", "523761",
    "ITCINFOTECH-2026-09-29-004", "ITCINFOTECH-2026-09-29-003", "LTTS-2026-09-29-029"
]

db_paths = ["data/metaforge_requirements.db", "data/processed_messages.db"]

for db_path in db_paths:
    print(f"\n--- Checking Database File: {os.path.abspath(db_path)} ---")
    if not os.path.exists(db_path):
        print("  File does not exist!")
        continue
    
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in c.fetchall()]
    
    for t in tables:
        if t == "sqlite_sequence":
            continue
        c.execute(f"PRAGMA table_info({t})")
        cols = [col[1] for col in c.fetchall()]
        
        c.execute(f"SELECT * FROM {t}")
        rows = c.fetchall()
        
        matches = []
        for r in rows:
            row_dict = dict(zip(cols, r))
            row_str = json.dumps(row_dict, default=str)
            for tid in target_ids:
                if tid in row_str:
                    matches.append((tid, row_dict))
                    break
        
        if matches:
            print(f"  Found {len(matches)} matching target records in Table '{t}':")
            for tid, rdict in matches[:5]:
                print(f"    - Target ID: {tid}")
                print(f"      Keys/Fields: {list(rdict.keys())[:6]}")
                if "payload_json" in rdict:
                    p = json.loads(rdict["payload_json"])
                    prov = p.get("_provenance") or {}
                    print(f"      Job Title    : {p.get('job_title')}")
                    print(f"      Client Name  : {p.get('requirement_from')}")
                    print(f"      Client POC   : {p.get('client_lead_poc') or p.get('client_poc')}")
                    print(f"      Graph ID/Prov: {prov.get('graph_id') or p.get('source_graph_id') or 'N/A'}")

    conn.close()

# Also check CSV files in project directory
print("\n--- Checking Raw CSV Data Files in Project Directory ---")
csv_files = ["today_fetch.csv", "today_fetch_2026-04-20.csv", "today_fetch_2026-04-16.csv"]
for csv_f in csv_files:
    if os.path.exists(csv_f):
        print(f"  CSV File: {os.path.abspath(csv_f)} (Size: {os.path.getsize(csv_f)} bytes)")

