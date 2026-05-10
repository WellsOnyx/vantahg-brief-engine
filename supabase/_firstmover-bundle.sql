-- ============================================================
-- supabase/migrations/000_initial_schema.sql
-- ============================================================

-- VantaUM Clinical Brief Engine — Database Schema
-- Run this in Supabase SQL editor to create all tables

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Clients table (TPAs / health plans / managed care orgs)
create table clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  type text check (type in ('tpa', 'health_plan', 'self_funded_employer', 'managed_care_org', 'workers_comp', 'auto_med')),
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Medical UR-specific client fields
  uses_interqual boolean default false,
  uses_mcg boolean default false,
  custom_guidelines_url text,
  contracted_sla_hours float,
  contracted_rate_per_case numeric(10,2)
);

-- (truncated — this is a one-shot setup artifact; full content lives in supabase/migrations/000-009)
-- Deploy stamp: 2026-05-10 — triggers Vercel rebuild to pick up env vars
