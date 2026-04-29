"""Create or update a default login user in MongoDB.

Usage:
  python scripts/create_default_user.py --identifier ananth@gmail.com --password qwerqwer --name Ananth

This uses the same password hashing as the FastAPI auth service.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

from pymongo import MongoClient

sys.path.insert(0, ".")

from app.core.config import get_settings
from app.core.security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create/update a default auth user")
    parser.add_argument("--identifier", required=True, help="Login identifier (email/phone)")
    parser.add_argument("--password", required=True, help="Plaintext password to hash and store")
    parser.add_argument("--name", default="Production User", help="User display name")
    args = parser.parse_args()

    settings = get_settings()

    identifier = args.identifier.strip().lower()
    now = datetime.now(timezone.utc).isoformat()

    client = MongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB]

    users = db["users"]

    users.update_one(
        {"identifier": identifier},
        {
            "$set": {
                "name": args.name.strip() or "Production User",
                "identifier": identifier,
                "password_hash": hash_password(args.password),
                "is_active": True,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    print(f"OK: user ensured in DB -> {identifier}")


if __name__ == "__main__":
    main()
