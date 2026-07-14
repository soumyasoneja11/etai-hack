-- Threat intelligence corpus seed table for CVE and CERT-In documents.

create table if not exists public.threat_intel_docs (
    doc_id text primary key,
    type text not null check (type in ('CVE', 'CERT-In')),
    title text not null,
    description text not null,
    severity text not null,
    cvss_score numeric,
    cvss_vector text,
    published_date date,
    source_url text,
    affected_software jsonb not null default '[]'::jsonb,
    attack_mapping jsonb not null,
    remediation text,
    cert_in_ref text,
    tags jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists threat_intel_docs_attack_label_idx
    on public.threat_intel_docs ((attack_mapping ->> 'cicids_label'));

create index if not exists threat_intel_docs_type_idx
    on public.threat_intel_docs (type);

create index if not exists threat_intel_docs_tags_gin_idx
    on public.threat_intel_docs using gin (tags);