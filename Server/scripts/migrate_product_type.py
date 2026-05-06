"""Add product_type column to products table."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.db.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'product'"
    ))
    conn.execute(text(
        "UPDATE products SET product_type = 'product' WHERE product_type IS NULL"
    ))
    conn.commit()
    print("Migration complete: product_type column added to products table.")
