-- ============================================================
-- Patent Analyzer - Supabase Schema
-- Run this in Supabase SQL Editor to create required tables
-- ============================================================

-- 1. Users table (replaces local users.json)
CREATE TABLE IF NOT EXISTS public.users (
    id          BIGSERIAL PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user',
    notes       TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Row Level Security) but allow API key full access
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access via service key" ON public.users
    USING (true) WITH CHECK (true);

-- 2. Usage logs table (replaces local usage_logs.xlsx)
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id                   BIGSERIAL PRIMARY KEY,
    session_id           TEXT NOT NULL UNIQUE,
    username             TEXT NOT NULL,
    ip_address           TEXT DEFAULT '',
    login_time           TIMESTAMPTZ,
    logout_time          TIMESTAMPTZ,
    duration             TEXT DEFAULT '00:00:00',
    uploaded_files       JSONB DEFAULT '[]'::jsonb,
    patents_processed    INTEGER DEFAULT 0,
    excel_downloads      INTEGER DEFAULT 0,
    png_downloads        INTEGER DEFAULT 0,
    excel_download_bytes BIGINT DEFAULT 0,
    png_download_bytes   BIGINT DEFAULT 0,
    last_active_time     TIMESTAMPTZ,
    status               TEXT DEFAULT 'active'
);

-- Enable RLS
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access via service key" ON public.usage_logs
    USING (true) WITH CHECK (true);

-- Index for fast session lookups
CREATE INDEX IF NOT EXISTS idx_usage_logs_session_id ON public.usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_login_time ON public.usage_logs(login_time DESC);

-- ============================================================
-- Migration: Add new columns to EXISTING usage_logs table
-- Run this if you already have the table and need to add the
-- two new download size columns.
-- ============================================================
ALTER TABLE public.usage_logs
    ADD COLUMN IF NOT EXISTS excel_download_bytes BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS png_download_bytes   BIGINT DEFAULT 0;
