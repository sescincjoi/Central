/**
 * MOTOR BACKEND: RADAR DE VISTORIA (CENTRAL)
 * Copie este código inteiro e cole no editor do Google Apps Script
 * (Substituindo o Código.gs original que vem em branco lá)
 * 
 * Etapa Final: 
 * 1. Clique em "Implantar" -> "Nova Implantação"
 * 2. Selecione o tipo "App da Web"
 * 3. Acesso: "Qualquer pessoa" (Importante para o PWA ler)
 * 4. Autorize os acessos e copie a URL final gerada.
 */

// Suas credenciais seguras do OpenSky (não vazam para o navegador)
const OPENSKY_CREDENTIALS = Utilities.base64Encode("mmocena:132435Os!");
const CACHE_TIME_SECONDS = 15; // Evita que todos os clientes do radar saturem a API 

// Bounding Box (Aprox. 100km ao redor de Joinville)
const BBOX = {
  lamin: -27.2000, // Sul
  lomin: -49.5000, // Oeste
  lamax: -25.2000, // Norte
  lomax: -48.0000  // Leste
};

// 1. ENDPOINT PRINCIPAL (API do seu próprio PWA)
function doGet(e) {
  try {
    const rawData = getRadarData();
    
    // Tratando a saída para o formato exato que o Front espera ver
    // e enviando os cabeçalhos Anti-CORS nativos do GAS
    return ContentService.createTextOutput(JSON.stringify(rawData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. FUNÇÃO QUE CONSULTA O RADAR DE FATO
function getRadarData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("radar_data");
  
  if (cached) {
    return JSON.parse(cached); // Retorna a "foto" dos últimos 15 segundos
  }

  // Faz a chamada se o cache expirou
  const url = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;
  
  const options = {
    method: "GET",
    headers: {
      "Authorization": "Basic " + OPENSKY_CREDENTIALS
    },
    muteHttpExceptions: true // Evita que o Apps Script quebre por inteiro em timeouts ou erros
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  
  if (responseCode !== 200) {
     return { error: true, code: responseCode, message: "OpenSky recusou a requisição ou Rate Limit" };
  }

  const jsonString = response.getContentText();
  
  // Salva no cache por 15 segundos para "amortecer" as tentativas de navegadores rodando simultâneos
  cache.put("radar_data", jsonString, CACHE_TIME_SECONDS);
  
  return JSON.parse(jsonString);
}
