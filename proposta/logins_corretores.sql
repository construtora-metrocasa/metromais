-- ============================================================
-- Logins de autenticacao (Supabase Auth) para o Motor de Calculo
-- Fonte dos e-mails: public.corretores (situacao = ATIVO)
-- Senha padrao unica + troca obrigatoria no 1o acesso.
-- Idempotente: pula quem ja tem login. Rodar no SQL Editor do Motor.
-- ============================================================

-- (A) controle de "trocou a senha no 1o acesso" na propria tabela corretores.
--     como o sync (Apps Script) faz upsert parcial por e-mail, esta coluna
--     NAO e sobrescrita pelas sincronizacoes.
alter table public.corretores
  add column if not exists senha_trocada boolean not null default false;

-- (B) RPC: o usuario logado marca a PROPRIA linha como senha trocada.
--     SECURITY DEFINER pra contornar o RLS (corretores nao tem policy de update
--     pra authenticated). So mexe na linha cujo e-mail == e-mail do token.
create or replace function public.marcar_senha_trocada()
returns void
language sql
security definer
set search_path = public
as $func$
  update public.corretores
  set senha_trocada = true
  where lower(trim(email)) = lower(auth.jwt() ->> 'email');
$func$;

grant execute on function public.marcar_senha_trocada() to authenticated;

-- (C) (opcional) confira quantos logins seriam criados:
--     select count(*) from public.corretores
--     where email like '%@%' and situacao ilike 'ativo%';

-- (D) cria os logins (senha padrao, senha_trocada = false => troca no 1o acesso)
do $$
declare
  v_password text := 'Metrocasa2026';   -- <<< senha padrao (troque aqui se quiser)
  r record;
  uid uuid;
  v_criados int := 0;
  v_pulados int := 0;
begin
  for r in
    select distinct lower(trim(email)) as email
    from public.corretores
    where email is not null
      and email like '%@%'
      and situacao ilike 'ativo%'
      -- (piloto) descomente para limitar a e-mails especificos:
      -- and lower(trim(email)) in ('fulano@metrocasa.com.br','ciclano@metrocasa.com.br')
  loop
    if exists (select 1 from auth.users where email = r.email) then
      v_pulados := v_pulados + 1;
      continue;
    end if;

    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      r.email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', '', '', '', '', '',      -- token cols vazias (evita erro 500 do GoTrue)
      now(), now()
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now()
    );

    -- garante que a linha do corretor comeca marcada pra trocar a senha
    update public.corretores
      set senha_trocada = false
      where lower(trim(email)) = r.email;

    v_criados := v_criados + 1;
  end loop;

  raise notice 'Logins criados: %, ja existentes (pulados): %', v_criados, v_pulados;
end $$;

-- (E) confira o resultado:
--     select email, created_at from auth.users order by created_at desc limit 20;
