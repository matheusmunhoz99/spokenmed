create table public.esus_remetente_config (
  id uuid primary key default gen_random_uuid(),
  contra_chave text not null,
  cpf_ou_cnpj text not null,
  nome_ou_razao_social text not null,
  versao_sistema text not null default '1.0.0',
  uuid_instalacao uuid not null default gen_random_uuid(),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.esus_remetente_config enable row level security;

create policy "esus_remetente_admin_all" on public.esus_remetente_config
  for all to authenticated
  using (private.has_role(auth.uid(), 'admin'::app_role))
  with check (private.has_role(auth.uid(), 'admin'::app_role));

create policy "esus_remetente_staff_select" on public.esus_remetente_config
  for select to authenticated
  using (private.is_authenticated_staff(auth.uid()));

create or replace function public.tg_esus_remetente_config_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger esus_remetente_config_updated_at
  before update on public.esus_remetente_config
  for each row execute function public.tg_esus_remetente_config_updated_at();