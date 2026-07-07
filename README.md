# Vendas+ — Login com painel embutido por planilha

Site de login em um **único arquivo HTML** que autentica contra o Supabase e
carrega, dentro da própria página (via iframe), o painel Power BI cadastrado
na coluna **M — PAGINA DE ACESSO** da planilha Google Sheets. Os dados e os
logins são sincronizados automaticamente pela planilha — não precisa
atualizar nada manualmente.

## Como funciona

1. A planilha tem uma coluna extra (M) com o link "Publicar na web" do Power BI de cada pessoa.
2. Um Apps Script vinculado à planilha roda a cada edição (e também de hora
   em hora, como rede de segurança) e:
   - cria/atualiza o usuário de login de cada pessoa no Supabase Auth
     (e-mail = coluna E-MAIL, senha = `apelido + 3 últimos dígitos do CPF + ano de entrada`);
   - bloqueia automaticamente o login de quem não está com Situação = Ativo;
   - copia a linha inteira (incluindo a coluna M) pra uma tabela no Supabase.
3. `index.html` é uma página só com 4 "telas" que aparecem/somem via
   JavaScript (nunca navega para outra URL):
   - **Login** — e-mail/senha.
   - **Troca de senha** — obrigatória no primeiro acesso.
   - **Sem acesso** — quando a pessoa não tem `pagina_acesso` cadastrada.
   - **Painel** — carrega a `pagina_acesso` da pessoa dentro de um `<iframe>`
     em tela cheia.

### Sobre esconder o link do painel
Como o painel é carregado num `<iframe>` em vez de um redirecionamento, a
barra de endereço do navegador **nunca muda** — continua sempre mostrando só
a URL do `index.html`, nunca a do Power BI. O link também não aparece no
código-fonte inicial da página (só é buscado no Supabase depois do login,
já autenticado, e só o link daquela pessoa). Isso cobre o uso normal.

**Limite honesto:** alguém que abrir o DevTools do navegador (F12) e olhar a
aba **Network** ou o elemento `<iframe>` no HTML ainda vai conseguir ver a
URL sendo carregada — isso é inerente a qualquer aplicação que roda no
navegador do usuário; não existe forma 100% à prova de inspeção sem um
servidor no meio fazendo proxy do conteúdo (bem mais complexo, exigiria
backend próprio). Isso funciona porque a coluna M usa links do tipo
**"Publicar na web"** do Power BI, que são feitos pra ser embutidos assim.

**Decisão registrada:** avaliamos 3 opções (aceitar como está / proxy reverso
simples / Power BI Embedded com token real) e decidimos manter como está.
Justificativa: os links "Publicar na Web" já são públicos por natureza do
próprio Power BI — quem tiver a URL abre direto, com ou sem o nosso login —
então o app já cumpre o papel de controlar o acesso casual, e endurecer mais
isso exigiria trocar a arquitetura do Power BI (Embedded + token), não só o
site. Se decidirem endurecer no futuro, essa é a opção a seguir.

## Senha de cada colaborador

```
senha inicial = APELIDO (como está na planilha) + 3 últimos dígitos do CPF + ANO de entrada (4 dígitos)
```
Exemplo: apelido "Zeca", CPF terminando em 452, entrou em 2020 → senha inicial `Zeca4522020`.

Essa senha só é usada no **primeiro login**. Como ela é previsível por
qualquer colega que souber apelido, final do CPF e ano de entrada de
alguém, o sistema **obriga a troca de senha logo no primeiro acesso**. A
partir daí, a senha nova escolhida pela pessoa fica valendo — o Apps Script
nunca mais sobrescreve a senha de um usuário já existente, só cria a senha
inicial na primeira vez.

## Passo a passo

### 1. Criar o projeto no Supabase
1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e clique em **New project**.
2. Dê um nome (ex: `vendas-plus`), escolha a região mais próxima (ex: São Paulo) e uma senha de banco forte.
3. Aguarde o projeto provisionar (1-2 minutos).

### 2. Criar as tabelas
1. No menu lateral, vá em **SQL Editor** > **New query**.
2. Cole o conteúdo de [`supabase_schema.sql`](supabase_schema.sql) e clique em **Run**.

### 3. Pegar as chaves do projeto
1. Vá em **Settings** (ícone de engrenagem) > **API**.
2. Copie:
   - **Project URL**
   - **anon public key** (pública, vai no HTML)
   - **service_role key** — use a versão **legada (JWT, começa com `eyJ...`)**,
     não a nova `sb_secret_...` (essa bloqueia chamadas do Apps Script, veja
     seção de problemas conhecidos abaixo). Nunca vai no HTML — só no Apps Script.

### 4. Configurar o `index.html`
Abra [`index.html`](index.html) e preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` com os valores do passo 3.

### 5. Adicionar a coluna de destino na planilha
Já feito por você: coluna **M — PAGINA DE ACESSO** com o link "Publicar na web" do Power BI de cada pessoa.

### 6. Instalar o Apps Script na planilha
1. Abra a planilha no Google Sheets.
2. Menu **Extensões > Apps Script**.
3. Apague o conteúdo do `Code.gs` e cole o conteúdo de [`apps_script_sincronizacao.gs`](apps_script_sincronizacao.gs).
4. No topo do arquivo, preencha `ABA_NOME` — o nome exato da aba onde estão os dados (o script já é vinculado à planilha automaticamente, não precisa de ID).
5. No menu lateral do editor, clique no ícone de engrenagem **Configurações do projeto** > **Propriedades do script** > **Adicionar propriedade do script**, e adicione:
   - `SUPABASE_URL` = a Project URL do passo 3
   - `SUPABASE_SERVICE_ROLE_KEY` = a service_role key **legada (JWT)** do passo 3
6. Volte ao editor de código, selecione a função `configurarGatilho` no menu suspenso do topo e clique em **Executar**.
7. O Google vai pedir autorização (é a sua própria conta/planilha) — aceite.
8. Isso já dispara a primeira sincronização e instala os gatilhos automáticos.

### 7. Testar
1. No Supabase, vá em **Authentication > Users** e confira se os usuários foram criados.
2. Vá em **Table Editor > funcionarios** e confira se as linhas bateram com a planilha.
3. Abra `index.html` no navegador, logue com um e-mail/senha de teste (senha inicial pela fórmula acima) e confirme que aparece a tela de troca de senha.
4. Troque a senha e confirme que o painel carrega embutido na página (sem navegar pra outra URL).
5. Clique em "Sair", logue de novo com a senha nova — confirme que vai direto pro painel, sem pedir troca de novo.
6. Edite a planilha (ex: mude a Situação de alguém pra "Desligado") e confirme que o login dessa pessoa passa a ser recusado.

### 8. Publicar
Hospede a pasta inteira (o `index.html` **e** os arquivos de ícone/favicon,
mantenha todos juntos) onde vocês já publicam os outros painéis (mesmo
esquema do Painel TV / Sininho — arraste a pasta pro
[Netlify Drop](https://app.netlify.com/drop), GitHub Pages ou Cloudflare
Pages). Não precisa de servidor — é tudo estático.

## Problemas conhecidos já resolvidos
- **`Unexpected error ... forSpreadsheet`**: o script agora usa `SpreadsheetApp.getActive()`, não precisa mais de ID de planilha.
- **`Forbidden use of secret API key in browser`**: causado pela chave nova `sb_secret_...`, que tem uma checagem extra que classifica erroneamente chamadas do Apps Script como vindas de navegador. Use a `service_role` key no formato antigo (JWT, `eyJ...`) em vez da `sb_secret_...`.

## Arquivos deste projeto
- `supabase_schema.sql` — schema da tabela `funcionarios` + RLS + função `marcar_senha_trocada`.
- `apps_script_sincronizacao.gs` — script da planilha que sincroniza tudo.
- `index.html` — site completo (login, troca de senha, sem acesso e painel), tudo em um único arquivo (com as fontes Gellix/GC Gambio da Metrocasa embutidas).
- `favicon.ico`, `favicon.png` — ícone da aba do navegador.
- `apple-touch-icon.png` — ícone ao "adicionar à tela de início" no iPhone/iPad.
- `icon-192.png`, `icon-512.png` — ícones em resoluções maiores (uso geral / futura instalação como app).
