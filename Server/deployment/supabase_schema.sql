-- ============================================================
-- Amudhu E-Commerce — Supabase (PostgreSQL) Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMs ────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending', 'assigned', 'processing', 'shipped', 'delivered', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE production_status AS ENUM (
        'order_received', 'started', 'in_progress', 'ready_to_dispatch'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SECTIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    "order"     INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,
    parent_section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_parent ON sections(parent_section_id);
CREATE INDEX IF NOT EXISTS idx_sections_is_active ON sections(is_active);

-- ── CATEGORIES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(200) NOT NULL,
    description        TEXT,
    section_id         UUID REFERENCES sections(id) ON DELETE SET NULL,
    parent_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    is_active          BOOLEAN DEFAULT TRUE,
    "order"            INTEGER DEFAULT 0,
    slug               VARCHAR(300),
    image_url          TEXT,
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_section ON categories(section_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

-- ── PRODUCTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(300) NOT NULL,
    description         TEXT,
    price               NUMERIC(12,2) NOT NULL DEFAULT 0,
    compare_at_price    NUMERIC(12,2),
    cost                NUMERIC(12,2),
    category_id         UUID REFERENCES categories(id) ON DELETE SET NULL,
    section_id          UUID REFERENCES sections(id) ON DELETE SET NULL,
    sku                 VARCHAR(200),
    inventory_quantity  INTEGER DEFAULT 0,
    image_url           TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    featured            BOOLEAN DEFAULT FALSE,
    discount_percentage NUMERIC(5,2),
    attributes          JSONB DEFAULT '{}',
    slug                VARCHAR(300),
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_section ON products(section_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(200) NOT NULL,
    identifier    VARCHAR(300) NOT NULL UNIQUE,
    password_hash TEXT,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_identifier ON users(identifier);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ── PRODUCTION USERS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(200) NOT NULL,
    identifier         VARCHAR(300) NOT NULL UNIQUE,
    production_address TEXT,
    password_hash      TEXT,
    is_active          BOOLEAN DEFAULT TRUE,
    attributes         JSONB DEFAULT '{}',
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_users_identifier ON production_users(identifier);
CREATE INDEX IF NOT EXISTS idx_prod_users_is_active ON production_users(is_active);

-- ── DELIVERY USERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(200) NOT NULL,
    identifier VARCHAR(300) NOT NULL UNIQUE,
    phone      VARCHAR(50),
    login_id   VARCHAR(200),
    email      VARCHAR(300),
    is_active  BOOLEAN DEFAULT TRUE,
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_del_users_identifier ON delivery_users(identifier);

-- ── ACCOUNTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(200) NOT NULL,
    email      VARCHAR(300) NOT NULL UNIQUE,
    role       VARCHAR(100),
    is_active  BOOLEAN DEFAULT TRUE,
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at);

-- ── ORDERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number          VARCHAR(100) NOT NULL UNIQUE,
    customer_name         VARCHAR(200),
    customer_identifier   VARCHAR(300),
    customer_email        VARCHAR(300),
    customer_phone        VARCHAR(50),
    shipping_address      TEXT,
    billing_address       TEXT,
    subtotal              NUMERIC(12,2) DEFAULT 0,
    tax                   NUMERIC(12,2) DEFAULT 0,
    shipping_cost         NUMERIC(12,2) DEFAULT 0,
    total                 NUMERIC(12,2) DEFAULT 0,
    status                order_status NOT NULL DEFAULT 'pending',
    production_status     production_status,
    production_identifier VARCHAR(300),
    production_assigned_at TIMESTAMP,
    source                VARCHAR(100),
    delivery_datetime     TIMESTAMP,
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT NOW(),
    updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_identifier ON orders(customer_identifier);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_production_identifier ON orders(production_identifier);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- ── ORDER ITEMS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id           BIGSERIAL PRIMARY KEY,
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(300),
    quantity     INTEGER NOT NULL DEFAULT 1,
    price        NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal     NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ── DELIVERY MANAGEMENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_managements (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id             UUID REFERENCES orders(id) ON DELETE SET NULL,
    tracking_number      VARCHAR(200),
    delivery_date        TIMESTAMP,
    status               VARCHAR(100) DEFAULT 'pending',
    contact_name         VARCHAR(200),
    contact_phone        VARCHAR(50),
    address              TEXT,
    delivery_identifier  VARCHAR(300),
    delivery_assigned_at TIMESTAMP,
    notes                TEXT,
    attributes           JSONB DEFAULT '{}',
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_managements(status);
CREATE INDEX IF NOT EXISTS idx_delivery_order ON delivery_managements(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_date ON delivery_managements(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_created_at ON delivery_managements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_status_created ON delivery_managements(status, created_at DESC);

-- ── PRODUCTION MANAGEMENTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS production_managements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(300) NOT NULL,
    production_date TIMESTAMP,
    status          VARCHAR(100) DEFAULT 'pending',
    quantity        INTEGER DEFAULT 0,
    product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
    notes           TEXT,
    attributes      JSONB DEFAULT '{}',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_mgmt_status ON production_managements(status);
CREATE INDEX IF NOT EXISTS idx_prod_mgmt_date ON production_managements(production_date);

-- ── SITE CONFIG ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_config (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name            VARCHAR(300) DEFAULT 'My E-Commerce Store',
    logo_url                TEXT,
    header_text             TEXT,
    tagline                 TEXT,
    primary_color           VARCHAR(20) DEFAULT '#1a73e8',
    secondary_color         VARCHAR(20) DEFAULT '#ffffff',
    contact_email           VARCHAR(300),
    contact_phone           VARCHAR(50),
    address                 TEXT,
    banner_enabled          BOOLEAN DEFAULT FALSE,
    banner_text             TEXT,
    banner_link             TEXT,
    banner_color            VARCHAR(20) DEFAULT '#0ea5e9',
    currency_symbol         VARCHAR(10) DEFAULT '₹',
    tax_rate                NUMERIC(5,2) DEFAULT 18.0,
    free_shipping_threshold NUMERIC(12,2) DEFAULT 500.0,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW()
);

-- ── JOBS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        VARCHAR(300) NOT NULL,
    status       VARCHAR(100) DEFAULT 'active',
    scheduled_at TIMESTAMP,
    started_at   TIMESTAMP,
    finished_at  TIMESTAMP,
    notes        TEXT,
    attributes   JSONB DEFAULT '{}',
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- ── APPLICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
    job_title       VARCHAR(300),
    applicant_name  VARCHAR(200) NOT NULL,
    applicant_email VARCHAR(300),
    applicant_phone VARCHAR(50),
    message         TEXT,
    resume_url      TEXT,
    status          VARCHAR(100) DEFAULT 'pending',
    attributes      JSONB DEFAULT '{}',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(applicant_email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);

-- ── OTP REQUESTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose     VARCHAR(20) NOT NULL,       -- 'signup' | 'login'
    identifier  VARCHAR(300) NOT NULL,
    otp_hash    VARCHAR(64) NOT NULL,
    attempts    INTEGER DEFAULT 0,
    is_used     BOOLEAN DEFAULT FALSE,
    expires_at  TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_purpose ON otp_requests(purpose);
CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_requests(identifier);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_created_at ON otp_requests(created_at);

-- ── DEFAULT SITE CONFIG ──────────────────────────────────────
INSERT INTO site_config (
    company_name, logo_url, header_text, tagline,
    primary_color, secondary_color,
    contact_email, contact_phone, address,
    banner_enabled, banner_color,
    currency_symbol, tax_rate, free_shipping_threshold
)
SELECT
    'My E-Commerce Store', '', 'Welcome to Our Store', 'Quality Products at Great Prices',
    '#1a73e8', '#ffffff',
    'info@mystore.com', '+1-234-567-8900', '123 Main Street, City, Country',
    FALSE, '#0ea5e9',
    '₹', 18.0, 500.0
WHERE NOT EXISTS (SELECT 1 FROM site_config);

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'sections','categories','products','users','production_users',
        'delivery_users','accounts','orders','order_items',
        'delivery_managements','production_managements','site_config',
        'jobs','applications','otp_requests'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
             CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            t, t, t, t
        );
    END LOOP;
END $$;
