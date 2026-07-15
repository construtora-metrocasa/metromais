-- ============================================================
-- Estoque (fonte da recomendacao) + Pesquisas de perfil (assistente)
-- Rodar no SQL Editor do projeto do Motor de Calculo.
-- ============================================================

-- (1) ESTOQUE ------------------------------------------------
-- Fonte da verdade do que esta DISPONIVEL para venda. Cada linha = 1 unidade
-- em estoque, com os dados que o assistente precisa (sem depender das ~31 mil
-- unidades). Populada pelo Apps Script syncEstoque() (ver .gs).
create table if not exists public.estoque (
  empreendimento text not null,
  unidade        text not null,
  tipologia      text,
  area_total     numeric,
  categoria      text,               -- destinacao / classificacao (HIS-1, HIS-2, HMP, NR...)
  valor_tabela   numeric,
  regiao         text,               -- opcional; se vazio, usa obras_andamento.regiao
  alcada         text,               -- CLASSIFICACAO PURA (informativo)
  atualizado_em  timestamptz not null default now(),
  primary key (empreendimento, unidade)
);
-- se a tabela ja existia sem estas colunas:
alter table public.estoque add column if not exists regiao text;
alter table public.estoque add column if not exists alcada text;

alter table public.estoque enable row level security;
drop policy if exists "leitura autenticada" on public.estoque;
create policy "leitura autenticada" on public.estoque
  for select to authenticated using (true);

create index if not exists estoque_emp_idx on public.estoque (empreendimento);

-- (2) PESQUISAS DE PERFIL ------------------------------------
-- Guarda as respostas do assistente por cliente (uma linha por conclusao do quiz),
-- pra estudos posteriores. Ligada a proposta gerada via propostas.pesquisa_id.
create table if not exists public.pesquisas_perfil (
  id            bigserial primary key,
  criado_em     timestamptz not null default now(),
  criado_por    text not null,       -- e-mail do corretor logado
  -- respostas do perfil
  motivo        text,
  composicao    text,
  deslocamento  text,
  tipologia     text,
  prioridade    text,
  lazer         jsonb,               -- array
  diferenciais  jsonb,               -- array
  regioes       jsonb,               -- array
  -- derivados
  renda_total   numeric,
  perfil        text,
  fgts          boolean,
  sbpe          boolean,
  dependentes   boolean,
  -- snapshots
  compradores   jsonb,               -- [{renda, vinc, clt3}]
  recomendadas  jsonb                -- [{empreendimento, unidade, tipologia, score, pct}]
);

alter table public.pesquisas_perfil enable row level security;
-- todo usuario logado registra e consulta (estudos)
drop policy if exists "insert autenticado" on public.pesquisas_perfil;
create policy "insert autenticado" on public.pesquisas_perfil
  for insert to authenticated with check (true);
drop policy if exists "leitura autenticada" on public.pesquisas_perfil;
create policy "leitura autenticada" on public.pesquisas_perfil
  for select to authenticated using (true);

create index if not exists pesquisas_criado_idx on public.pesquisas_perfil (criado_em desc);

-- (3) LIGACAO pesquisa -> proposta ---------------------------
-- quando o corretor gera a proposta a partir do assistente, o id da pesquisa
-- fica gravado na proposta (permite join pra estudo: perfil x proposta fechada).
alter table public.propostas
  add column if not exists pesquisa_id bigint references public.pesquisas_perfil(id) on delete set null;
