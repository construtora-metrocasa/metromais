/**
 * Vendas+ | Sincronização Planilha -> Supabase
 *
 * COMO INSTALAR:
 * 1. Abra a planilha no Google Sheets.
 * 2. Menu Extensões > Apps Script (isso vincula o script à própria planilha,
 *    por isso não precisamos de um ID de planilha — usamos a "ativa").
 * 3. Apague o conteúdo padrão do arquivo Code.gs e cole este arquivo inteiro.
 * 4. Preencha ABA_NOME logo abaixo com o nome exato da aba com os dados.
 * 5. No menu lateral do editor, vá em "Configurações do projeto" (ícone de
 *    engrenagem) > "Propriedades do script" > adicione:
 *      SUPABASE_URL             = https://SEU-PROJETO.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY = a service_role key (Settings > API no Supabase)
 *    NUNCA coloque a service_role key direto no código nem no HTML.
 * 6. Selecione a função "configurarGatilho" no menu superior e clique em
 *    "Executar" (Run) UMA VEZ. Vai pedir autorização — aceite (é a sua própria
 *    planilha/projeto, a autorização fica só na sua conta Google).
 * 7. Pronto: a partir daí, toda edição na planilha sincroniza automaticamente,
 *    e existe também um gatilho de segurança rodando 1x por hora.
 */

// ==== CONFIGURAÇÃO (preencha antes de instalar) ====
var ABA_NOME = 'COLE_AQUI_O_NOME_DA_ABA';      // nome exato da aba com os dados

// Colunas conforme o cabeçalho informado (1 = A, 2 = B, ...):
var COL = {
  CPF: 1,             // A - CPF
  NOME: 2,            // B - NOME COMPLETO
  APELIDO: 3,          // C - APELIDO
  GERENTE: 4,          // D - Gerente
  SUPERINT: 5,         // E - Superint.
  DIRETOR: 6,          // F - Diretor
  SITUACAO: 7,         // G - Situação
  DEP: 8,              // H - Dep.
  FUNCAO: 9,           // I - FUNÇÃO
  OBS: 10,             // J - OBS.
  DATA_ENTRADA: 11,    // K - Data de entrada
  EMAIL: 12,           // L - E-MAIL
  PAGINA_ACESSO: 13    // M - PAGINA DE ACESSO
};

// ==== GATILHOS ====

function configurarGatilho() {
  // Rode esta função manualmente UMA VEZ para autorizar e instalar os gatilhos.
  removerGatilhosAntigos_();

  ScriptApp.newTrigger('onEditInstalavel')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  ScriptApp.newTrigger('sincronizarTudo')
    .timeBased()
    .everyHours(1)
    .create();

  sincronizarTudo(); // primeira sincronização, imediata
}

function removerGatilhosAntigos_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

function onEditInstalavel(e) {
  sincronizarTudo();
}

// ==== SINCRONIZAÇÃO ====

function sincronizarTudo() {
  var cfg = getConfig_();
  var sheet = SpreadsheetApp.getActive().getSheetByName(ABA_NOME);
  if (!sheet) throw new Error('Aba "' + ABA_NOME + '" não encontrada.');

  var dados = sheet.getDataRange().getValues();

  for (var i = 1; i < dados.length; i++) { // i=0 é o cabeçalho
    var linha = dados[i];
    var cpf = somenteDigitos_(linha[COL.CPF - 1]);
    if (!cpf) continue; // linha vazia, pula

    try {
      processarFuncionario_(cfg, linha, cpf);
    } catch (err) {
      Logger.log('Erro na linha ' + (i + 1) + ' (CPF ' + cpf + '): ' + err);
    }
  }
}

function processarFuncionario_(cfg, linha, cpf) {
  var nome = String(linha[COL.NOME - 1] || '').trim();
  var apelido = String(linha[COL.APELIDO - 1] || '').trim();
  var gerente = String(linha[COL.GERENTE - 1] || '').trim();
  var superint = String(linha[COL.SUPERINT - 1] || '').trim();
  var diretor = String(linha[COL.DIRETOR - 1] || '').trim();
  var situacao = String(linha[COL.SITUACAO - 1] || '').trim();
  var dep = String(linha[COL.DEP - 1] || '').trim();
  var funcao = String(linha[COL.FUNCAO - 1] || '').trim();
  var obs = String(linha[COL.OBS - 1] || '').trim();
  var dataEntradaRaw = linha[COL.DATA_ENTRADA - 1];
  var email = String(linha[COL.EMAIL - 1] || '').trim().toLowerCase();
  var paginaAcesso = String(linha[COL.PAGINA_ACESSO - 1] || '').trim();

  if (!email || !apelido || !dataEntradaRaw) {
    Logger.log('Linha incompleta (CPF ' + cpf + '), pulando. Confira e-mail, apelido e data de entrada.');
    return;
  }

  var dataEntrada = (dataEntradaRaw instanceof Date) ? dataEntradaRaw : new Date(dataEntradaRaw);
  if (isNaN(dataEntrada.getTime())) {
    Logger.log('Data de entrada inválida (CPF ' + cpf + '), pulando.');
    return;
  }

  var ano = dataEntrada.getFullYear();
  var ultimos3Cpf = cpf.slice(-3);
  var senha = apelido + ultimos3Cpf + ano;

  var ativo = situacao.toUpperCase().lastIndexOf('ATIV', 0) === 0; // começa com "ATIV" (Ativo)

  var authUserId = upsertAuthUser_(cfg, cpf, email, senha, ativo);

  upsertFuncionarioRow_(cfg, {
    cpf: cpf,
    nome_completo: nome,
    apelido: apelido,
    gerente: gerente,
    superintendente: superint,
    diretor: diretor,
    situacao: situacao,
    departamento: dep,
    funcao: funcao,
    obs: obs,
    data_entrada: Utilities.formatDate(dataEntrada, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    email: email,
    pagina_acesso: paginaAcesso,
    auth_user_id: authUserId
  });
}

// ==== SUPABASE AUTH (admin API) ====

function upsertAuthUser_(cfg, cpf, email, senha, ativo) {
  var headers = {
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    'Content-Type': 'application/json',
    // O UrlFetchApp do Apps Script manda um User-Agent que começa com
    // "Mozilla/5.0", e o Supabase bloqueia chaves secretas (sb_secret_...)
    // que "parecem" vir de navegador. Sobrescrevemos aqui pra evitar o
    // bloqueio (HTTP 401 "Forbidden use of secret API key in browser").
    'User-Agent': 'VendasPlus-GoogleAppsScript-Sync/1.0'
  };
  var banDuration = ativo ? 'none' : '876000h'; // ~100 anos = bloqueado na prática

  var existenteId = buscarAuthUserIdExistente_(cfg, cpf, headers);

  if (existenteId) {
    // Usuário já existe: NÃO reenviamos a senha aqui. Se reenviássemos a cada
    // sync, a troca de senha que a pessoa fez no primeiro login seria
    // desfeita na sincronização seguinte. Só atualizamos e-mail e bloqueio.
    var patchResp = UrlFetchApp.fetch(
      cfg.url + '/auth/v1/admin/users/' + existenteId,
      {
        method: 'put',
        headers: headers,
        muteHttpExceptions: true,
        payload: JSON.stringify({ email: email, ban_duration: banDuration, email_confirm: true })
      }
    );
    checarErro_(patchResp, 'atualizar usuário ' + email);
    return existenteId;
  }

  var criaResp = UrlFetchApp.fetch(
    cfg.url + '/auth/v1/admin/users',
    {
      method: 'post',
      headers: headers,
      muteHttpExceptions: true,
      payload: JSON.stringify({ email: email, password: senha, email_confirm: true, ban_duration: banDuration })
    }
  );

  if (criaResp.getResponseCode() >= 300) {
    Logger.log('Falha ao criar usuário ' + email + ' (HTTP ' + criaResp.getResponseCode() + '): ' + criaResp.getContentText());
    Logger.log('Se o erro for "e-mail já cadastrado", provavelmente esse e-mail já existe no Auth mas ainda não está vinculado na tabela funcionarios. Verifique manualmente no Supabase Dashboard > Authentication.');
    return null;
  }

  return JSON.parse(criaResp.getContentText()).id;
}

function buscarAuthUserIdExistente_(cfg, cpf, headers) {
  var resp = UrlFetchApp.fetch(
    cfg.url + '/rest/v1/funcionarios?cpf=eq.' + encodeURIComponent(cpf) + '&select=auth_user_id',
    { method: 'get', headers: headers, muteHttpExceptions: true }
  );
  if (resp.getResponseCode() >= 300) return null;
  var linhas = JSON.parse(resp.getContentText() || '[]');
  return (linhas[0] && linhas[0].auth_user_id) || null;
}

// ==== TABELA funcionarios (PostgREST) ====

function upsertFuncionarioRow_(cfg, registro) {
  var headers = {
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
    'User-Agent': 'VendasPlus-GoogleAppsScript-Sync/1.0'
  };
  var resp = UrlFetchApp.fetch(
    cfg.url + '/rest/v1/funcionarios?on_conflict=cpf',
    { method: 'post', headers: headers, muteHttpExceptions: true, payload: JSON.stringify([registro]) }
  );
  checarErro_(resp, 'gravar funcionário ' + registro.email);
}

// ==== UTIL ====

function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL');
  var key = p.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em Configurações do projeto > Propriedades do script.');
  }
  return { url: url, key: key };
}

function somenteDigitos_(s) {
  return String(s || '').replace(/\D/g, '');
}

function checarErro_(resp, contexto) {
  var codigo = resp.getResponseCode();
  if (codigo >= 300) {
    throw new Error('Falha ao ' + contexto + ' (HTTP ' + codigo + '): ' + resp.getContentText());
  }
}
