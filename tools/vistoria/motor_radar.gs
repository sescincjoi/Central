/**
 * MOTOR BACKEND: RADAR DE VISTORIA (CENTRAL)
 * API: OpenSky Network (Plano com Autenticação)
 */

const OPENSKY_CREDENTIALS = Utilities.base64Encode("mmocena:132435Os!");
const CACHE_TIME_SECONDS = 15; 

const BBOX = {
  lamin: -27.2000, 
  lomin: -49.5000, 
  lamax: -25.2000, 
  lomax: -48.0000  
};

function doGet(e) {
  try {
    const rawData = getRadarData();
    return ContentService.createTextOutput(JSON.stringify(rawData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: true, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getRadarData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("radar_data");
  
  if (cached) {
    return JSON.parse(cached);
  }

  const url = `https://opensky-network.org/api/states/all?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;
  
  const options = {
    method: "get",
    headers: {
      "Authorization": "Basic " + OPENSKY_CREDENTIALS
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const jsonString = response.getContentText();
  
  if (responseCode !== 200) {
     return { error: true, code: responseCode, message: "OpenSky Recusou (Limite excedido ou indisponível).", details: jsonString };
  }
  
  try {
    const parsedData = JSON.parse(jsonString);
    cache.put("radar_data", jsonString, CACHE_TIME_SECONDS);
    return parsedData;
  } catch (parseErr) {
    return { error: true, message: "Erro ao ler lista do OpenSky: " + parseErr.toString() };
  }
}
