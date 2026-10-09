import sqlite3
import os

for db_name in ['data/metaforge_requirements.db', 'data/processed_messages.db']:
    if os.path.exists(db_name):
        print(f"\n=================== {db_name} ===================")
        conn = sqlite3.connect(db_name)
        cur = conn.cursor()
        tables = [t[0] for t in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print("Tables:", tables)
        for t in tables:
            cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})").fetchall()]
            print(f"Table {t} columns: {cols}")
            # Search for 209160
            query = f"SELECT * FROM {t}"
            rows = cur.execute(query).fetchall()
            matching = []
            for r in rows:
                r_str = str(r)
                if '209160' in r_str or 'REQ-998811' in r_str:
                    matching.append(r)
            print(f"  Total rows: {len(rows)}, Matching 209160 or REQ-998811: {len(matching)}")
            for m in matching:
                print("   MATCH:", m[:4]) # print first 4 cols
        conn.close()
