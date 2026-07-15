-- ============================================================
-- ATUALIZACOES PENDENTES — Motor de Calculo (rodar 1x no SQL Editor)
-- Consolida tudo que ainda nao foi aplicado. Idempotente: pode
-- rodar de novo sem erro; o que ja existir e pulado/atualizado.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ESTOQUE — fonte da recomendacao do assistente (planilha de
--    estoque sincronizada pelo syncEstoque() do Apps Script)
-- ------------------------------------------------------------
create table if not exists public.estoque (
  empreendimento text not null,
  unidade        text not null,
  tipologia      text,
  area_total     numeric,
  categoria      text,               -- CAT. USO (HIS-1, HIS-2, HMP, NR...)
  valor_tabela   numeric,
  regiao         text,
  alcada         text,               -- CLASSIFICACAO PURA
  atualizado_em  timestamptz not null default now(),
  primary key (empreendimento, unidade)
);
alter table public.estoque add column if not exists regiao text;
alter table public.estoque add column if not exists alcada text;

alter table public.estoque enable row level security;
drop policy if exists "leitura autenticada" on public.estoque;
create policy "leitura autenticada" on public.estoque
  for select to authenticated using (true);

create index if not exists estoque_emp_idx on public.estoque (empreendimento);

-- ------------------------------------------------------------
-- 2) PESQUISAS DE PERFIL — respostas do assistente (p/ estudos)
-- ------------------------------------------------------------
create table if not exists public.pesquisas_perfil (
  id            bigserial primary key,
  criado_em     timestamptz not null default now(),
  criado_por    text not null,
  motivo        text,
  composicao    text,
  deslocamento  text,
  tipologia     text,
  prioridade    text,
  lazer         jsonb,
  diferenciais  jsonb,
  regioes       jsonb,
  renda_total   numeric,
  perfil        text,
  fgts          boolean,
  sbpe          boolean,
  dependentes   boolean,
  compradores   jsonb,
  recomendadas  jsonb
);

alter table public.pesquisas_perfil enable row level security;
drop policy if exists "insert autenticado" on public.pesquisas_perfil;
create policy "insert autenticado" on public.pesquisas_perfil
  for insert to authenticated with check (true);
drop policy if exists "leitura autenticada" on public.pesquisas_perfil;
create policy "leitura autenticada" on public.pesquisas_perfil
  for select to authenticated using (true);

create index if not exists pesquisas_criado_idx on public.pesquisas_perfil (criado_em desc);

-- ------------------------------------------------------------
-- 3) LIGACAO pesquisa -> proposta (estudo: perfil x proposta)
-- ------------------------------------------------------------
alter table public.propostas
  add column if not exists pesquisa_id bigint references public.pesquisas_perfil(id) on delete set null;

-- ------------------------------------------------------------
-- 4) EXCLUIR PROPOSTA — cada usuario apaga so as proprias
--    (necessario p/ o botao 🗑 da home funcionar)
-- ------------------------------------------------------------
drop policy if exists "delete proprio" on public.propostas;
create policy "delete proprio" on public.propostas
  for delete to authenticated using (criado_por = (auth.jwt()->>'email'));

-- ------------------------------------------------------------
-- 5) PERFORMANCE — indices das consultas mais pesadas
-- ------------------------------------------------------------
create index if not exists unidades_empreendimento_idx on public.unidades (empreendimento, unidade);
create index if not exists corretores_situacao_apelido_idx on public.corretores (situacao, apelido);

-- ------------------------------------------------------------
-- 6) CORRETORES — coluna apelido (se o alter antigo nao rodou)
-- ------------------------------------------------------------
alter table public.corretores add column if not exists apelido text;

-- ============================================================
-- FIM. Depois disto:
--   * Apps Script: rode syncCorretores() (preenche apelido) e
--     syncEstoque() (popula o estoque) — e adicione syncEstoque()
--     ao syncTudo() p/ entrar no gatilho.
--   * O logins_corretores.sql (criacao de logins + troca de senha
--     no 1o acesso) e um script separado — rode-o depois se ainda
--     nao rodou.
-- ============================================================
