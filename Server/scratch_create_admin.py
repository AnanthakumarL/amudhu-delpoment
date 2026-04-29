import sys
import os

sys.path.insert(0, os.getcwd())

from app.db.mongo_client import mongo_client
from app.core.security import hash_password
from datetime import datetime

def create_admin():
    db = mongo_client.db
    users = db["users"]
    
    identifier = "admin@example.com"
    password = "password123"
    
    existing = users.find_one({"identifier": identifier})
    if existing:
        print(f"User {identifier} already exists.")
        return

    now = datetime.utcnow().isoformat()
    user_payload = {
        "name": "Admin User",
        "identifier": identifier,
        "password_hash": hash_password(password),
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    
    users.insert_one(user_payload)
    print(f"Admin user created: {identifier} / {password}")

if __name__ == "__main__":
    create_admin()
