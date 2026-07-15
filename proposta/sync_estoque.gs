/**
 * Sincroniza a PLANILHA DE ESTOQUE -> tabela public.estoque no Supabase.
 * Cole no MESMO projeto Apps Script dos outros syncs (reaproveita
 * SUPABASE_URL / SUPABASE_SERVICE_KEY, postSupabase_, numBR_).
 *
 * Regra de estoque: entra somente Status = "Disponível".
 * (Venda suspensa / Reservada / etc. ficam de fora.)
 */
var ESTOQUE_ID  = '1Ev6iwTDhxP_-gZREZ2Ooq_x_N54cP-s3DCddV1oPOxo';
var ESTOQUE_ABA = 'Estoque';

// status que conta como disponivel (em estoque):
var STATUS_DISPONIVEL_REGEX = /^dispon/i;   // "Disponível"

// normaliza texto p/ casar cabecalhos (tira acentos e espacos das pontas):
function norm_(s){ return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g,'').trim(); }

function syncEstoque() {
  var sh = SpreadsheetApp.openById(ESTOQUE_ID).getSheetByName(ESTOQUE_ABA);
  if (!sh) throw new Error('Aba "' + ESTOQUE_ABA + '" nao encontrada');
  var data = sh.getDataRange().getValues();

  // 1) acha a linha de cabecalho (a que tem Empreendimento e Unidade)
  var hRow = -1, headers = null;
  for (var i = 0; i < Math.min(data.length, 20); i++) {
    var linha = data[i].map(function(c){ return norm_(c); });
    if (linha.indexOf('Empreendimento') >= 0 && linha.indexOf('Unidade') >= 0) { hRow = i; headers = linha; break; }
  }
  if (hRow < 0) throw new Error('Nao achei o cabecalho (Empreendimento/Unidade) nas primeiras linhas.');

  function col(nome){ return headers.indexOf(norm_(nome)); }
  var iEmp = col('Empreendimento'),          iUni = col('Unidade'),
      iTip = col('TIPOLOGIA COM ESPECIAL'),   iCat = col('CAT. USO'),
      iArea = col('Area total'),              iTab = col('Preco Tab.'),
      iReg = col('REGIAO'),                   iAlc = col('CLASSIFICACAO PURA'),
      iSt  = col('Status');

  // 2) percorre as linhas, mantem so Disponivel
  var mapa = {}, porStatus = {};
  for (var r = hRow + 1; r < data.length; r++) {
    var row = data[r];
    var emp = String(row[iEmp] || '').trim(), uni = String(row[iUni] || '').trim();
    if (!emp || !uni) continue;
    var st = norm_(row[iSt]);
    porStatus[st || '(vazio)'] = (porStatus[st || '(vazio)'] || 0) + 1;
    if (!STATUS_DISPONIVEL_REGEX.test(st)) continue;
    mapa[emp + '||' + uni] = {
      empreendimento: emp,
      unidade: uni,
      tipologia:    iTip  >= 0 ? (String(row[iTip] || '').trim() || null) : null,
      area_total:   iArea >= 0 ? numBR_(row[iArea]) : null,
      categoria:    iCat  >= 0 ? (String(row[iCat] || '').trim() || null) : null,
      valor_tabela: iTab  >= 0 ? numBR_(row[iTab]) : null,
      regiao:       iReg  >= 0 ? (String(row[iReg] || '').trim() || null) : null,
      alcada:       iAlc  >= 0 ? (String(row[iAlc] || '').trim() || null) : null
    };
  }
  var linhas = Object.keys(mapa).map(function(k){ return mapa[k]; });

  Logger.log('Cabecalho na linha ' + (hRow + 1) + ' | col: emp=' + iEmp + ' uni=' + iUni + ' status=' + iSt +
             ' tip=' + iTip + ' cat=' + iCat + ' area=' + iArea + ' tab=' + iTab + ' reg=' + iReg + ' alc=' + iAlc);
  Logger.log('STATUS vistos: ' + JSON.stringify(porStatus));

  // 3) reflete exatamente o estoque atual (limpa e regrava em lotes)
  deleteSupabase_('estoque');
  for (var k = 0; k < linhas.length; k += 500)
    postSupabase_('estoque', linhas.slice(k, k + 500), 'empreendimento,unidade');
  Logger.log('estoque sincronizado: ' + linhas.length + ' disponiveis');
}

// apaga todas as linhas da tabela (usa a service key ja configurada)
function deleteSupabase_(tabela) {
  var url = supaUrl_() + '/rest/v1/' + tabela + '?empreendimento=neq.__none__';
  UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: { apikey: supaKey_(), Authorization: 'Bearer ' + supaKey_(), Prefer: 'return=minimal' },
    muteHttpExceptions: true
  });
}
