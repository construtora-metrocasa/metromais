-- ============================================================================
-- Vendas+ | Schema do Supabase
-- Rode este script inteiro em: Supabase Dashboard > SQL Editor > New query
-- ============================================================================

create table if not exists public.funcionarios (
  cpf              text primary key,              -- somente dígitos
  nome_completo    text not null,
  apelido          text not null,
  gerente          text,
  superintendente  text,
  diretor          text,
  situacao         text,                           -- "Ativo", "Desligado" etc, vindo direto da planilha
  departamento     text,
  funcao           text,
  obs              text,
  data_entrada     date,
  email            text not null unique,
  pagina_acesso    text,                            -- link do Power BI (coluna M da planilha)
  auth_user_id     uuid references auth.users(id) on delete set null,
  senha_trocada    boolean not null default false,   -- true depois que a pessoa troca a senha inicial
  atualizado_em    timestamptz not null default now()
);

-- garante a coluna caso a tabela já existisse antes desta versão do script
alter table public.funcionarios add column if not exists senha_trocada boolean not null default false;

-- mantém atualizado_em sempre em dia a cada upsert
create or replace function public.tocar_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_funcionarios_atualizado_em on public.funcionarios;
create trigger trg_funcionarios_atualizado_em
before update on public.funcionarios
for each row execute function public.tocar_atualizado_em();

-- Row Level Security: cada usuário logado só pode LER a própria linha.
-- Não existe policy de insert/update/delete para anon/authenticated de propósito:
-- só o Apps Script (usando a service_role key, que ignora RLS) pode escrever aqui.
alter table public.funcionarios enable row level security;

drop policy if exists "usuario_le_proprio_registro" on public.funcionarios;
create policy "usuario_le_proprio_registro"
on public.funcionarios
for select
to authenticated
using (auth_user_id = auth.uid());

-- Função para o próprio usuário marcar que já trocou a senha inicial.
-- security definer = roda com o dono da função (ignora RLS), mas só faz
-- UPDATE na própria linha (auth.uid()) e só na coluna senha_trocada —
-- não abrimos uma policy genérica de UPDATE pra evitar que alguém edite
-- pagina_acesso ou situacao pelo próprio client.
create or replace function public.marcar_senha_trocada()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.funcionarios
  set senha_trocada = true
  where auth_user_id = auth.uid();
end;
$$;

revoke all on function public.marcar_senha_trocada() from public;
grant execute on function public.marcar_senha_trocada() to authenticated;
