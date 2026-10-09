import sqlite3, json

conn = sqlite3.connect("data/processed_messages.db")
conn.row_factory = sqlite3.Row

row = conn.execute("SELECT payload_json FROM pending_reviews WHERE payload_json LIKE '%RQ056293%'").fetchone()
if row:
    p = json.loads(row['payload_json'])
    body_text = p.get('bodyText', '')
    print("=== FULL BODYTEXT FOR RQ056293 ===")
    print(body_text)
    
    subj = p.get('subject', '')
    full_text = subj + "\n" + body_text
    
    print("=== MARKER CHECK ===")
    print("D-Client in text:", ("d-client" in full_text.lower() or "dclient" in full_text.lower()))
    print("P-Client in text:", ("p-client" in full_text.lower() or "pclient" in full_text.lower()))

conn.close()
