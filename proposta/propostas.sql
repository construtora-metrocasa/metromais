-- ============================================================
-- Registro de propostas do Motor de Calculo
-- Cada "Exportar / Imprimir" grava uma linha aqui e recebe um
-- ID sequencial, impresso no cabecalho ("Proposta N 2026-0001").
-- Rodar no SQL Editor do projeto Supabase do Motor de Calculo.
-- ============================================================

create table if not exists propostas (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  criado_por text not null,                -- e-mail do login que gerou
  cadeia_corretor text,
  cadeia_gerente text,
  cadeia_superintendente text,
  cadeia_diretor text,
  empreendimento text,
  unidade text,
  tipologia text,
  categoria text,
  valor_tabela numeric,
  valor_venda numeric,
  status text,                             -- texto do status do checklist
  dados jsonb not null default '{}'        -- snapshot completo: compradores, fluxo, checklist, resumo
);

alter table propostas enable row level security;

-- todo usuario logado pode registrar e consultar propostas
drop policy if exists "insert autenticado" on propostas;
create policy "insert autenticado" on propostas
  for insert to authenticated with check (true);

drop policy if exists "leitura autenticada" on propostas;
create policy "leitura autenticada" on propostas
  for select to authenticated using (true);

-- cada usuario pode excluir SOMENTE as proprias propostas
drop policy if exists "delete proprio" on propostas;
create policy "delete proprio" on propostas
  for delete to authenticated using (criado_por = (auth.jwt()->>'email'));

create index if not exists propostas_criado_por_idx on propostas (criado_por, criado_em desc);
create index if not exists propostas_emp_idx on propostas (empreendimento, criado_em desc);
