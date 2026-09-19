-- 0258_modulo_instagram
--
-- Schema pro canal de atendimento e automação do Instagram (Direct & Comment-to-DM).
-- 1. `channel_sessions` ganha o provider 'instagram' + suas colunas de identidade
-- 2. Tabela `instagram_post_automations` para regras de Comment-to-DM com RLS multi-tenant

-- 1. channel_sessions ganha o provider 'instagram'
alter table public.channel_sessions
  add column if not exists instagram_account_id text,
  add column if not exists instagram_username text,
  add column if not exists instagram_page_id text;

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha', 'meta_cloud', 'zernio', 'wacalls', 'instagram']));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check
  check (
    ((provider = 'waha') and (waha_session_name is not null))
    or ((provider = 'meta_cloud') and (meta_phone_number_id is not null))
    or ((provider = 'zernio') and (zernio_account_id is not null))
    or ((provider = 'wacalls') and (wacalls_session_id is not null))
    or ((provider = 'instagram') and (instagram_account_id is not null))
  );

create unique index if not exists channel_sessions_instagram_account_id_ativo_unique
  on public.channel_sessions (organization_id, instagram_account_id)
  where archived_at is null and instagram_account_id is not null;

-- 2. instagram_post_automations (Comment-to-DM)
create table if not exists public.instagram_post_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,

  post_id text not null,
  post_url text,
  post_caption text,

  trigger_keyword text,
  match_mode text not null default 'contains' check (match_mode in ('exact', 'contains', 'any')),

  public_reply_enabled boolean not null default true,
  public_replies jsonb not null default '["Te mandei no Direct! Dá uma olhada 🚀", "Enviado no privado! Confere lá ✅"]'::jsonb,

  dm_message text not null,

  kanban_stage_id uuid references public.pipeline_stages(id) on delete set null,
  tags text[] default array['origem:instagram-post']::text[],
  ai_agent_id uuid references public.ai_agents(id) on delete set null,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_post_automations enable row level security;

drop policy if exists org_isolation_instagram_post_automations on public.instagram_post_automations;
create policy org_isolation_instagram_post_automations
  on public.instagram_post_automations
  for all
  using (organization_id in (select fn_user_org_ids()));

revoke all on public.instagram_post_automations from anon;
grant select, insert, update, delete on public.instagram_post_automations to authenticated;

create index if not exists idx_instagram_post_automations_org_post
  on public.instagram_post_automations (organization_id, post_id)
  where is_active = true;

drop trigger if exists trg_set_updated_at on public.instagram_post_automations;
create trigger trg_set_updated_at
  before update on public.instagram_post_automations
  for each row
  execute function public.fn_set_updated_at();
