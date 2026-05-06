"""Seed test orders for calendar colour testing.

Creates:
  May 5  2026 → 16 orders  (green  ≤20)
  May 15 2026 → 32 orders  (yellow 21-60)
  May 25 2026 → 75 orders  (red    >60)
"""
import os
import re
import random
import string
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.environ['DATABASE_URL']
url = re.sub(r'^postgresql(\+psycopg2)?://', 'postgresql+pg8000://', DATABASE_URL)
engine = create_engine(url, poolclass=__import__('sqlalchemy.pool', fromlist=['NullPool']).NullPool)
Session = sessionmaker(bind=engine)


def gen_order_number(date: datetime, suffix: str) -> str:
    ts = date.strftime('%Y%m%d')
    return f'ORD-{ts}-{suffix}'


BATCHES = [
    (datetime(2026, 5,  5, 10, 0, tzinfo=timezone.utc), 16),
    (datetime(2026, 5, 15, 10, 0, tzinfo=timezone.utc), 32),
    (datetime(2026, 5, 25, 10, 0, tzinfo=timezone.utc), 75),
]

with Session() as db:
    total_inserted = 0
    for delivery_dt, count in BATCHES:
        date_str = delivery_dt.strftime('%Y-%m-%d')
        existing = db.execute(
            text("SELECT COUNT(*) FROM orders WHERE delivery_datetime::date = :d"),
            {'d': date_str}
        ).scalar()
        if existing >= count:
            print(f'{date_str}: already has {existing} orders, skipping')
            continue

        to_insert = count - existing
        print(f'{date_str}: inserting {to_insert} orders (existing={existing})')
        for i in range(to_insert):
            rand = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            suffix = f'{i+1:03d}{rand}'
            db.execute(text("""
                INSERT INTO orders (
                    id, order_number, customer_name, customer_identifier,
                    shipping_address, subtotal, tax, shipping_cost, total,
                    status, production_status, source, delivery_datetime,
                    created_at, updated_at
                ) VALUES (
                    :id, :order_number, :customer_name, :customer_identifier,
                    :shipping_address, :subtotal, :tax, :shipping_cost, :total,
                    'pending', 'order_received', 'test', :delivery_datetime,
                    NOW(), NOW()
                )
            """), {
                'id': str(uuid.uuid4()),
                'order_number': gen_order_number(delivery_dt, suffix),
                'customer_name': f'Test Customer {i+1}',
                'customer_identifier': f'test{i+1}@example.com',
                'shipping_address': f'{i+1} Test Street, Chennai',
                'subtotal': 100.0,
                'tax': 18.0,
                'shipping_cost': 0.0,
                'total': 118.0,
                'delivery_datetime': delivery_dt,
            })
            total_inserted += 1
        db.commit()
        print(f'  -> done')

    print(f'\nTotal inserted: {total_inserted}')
