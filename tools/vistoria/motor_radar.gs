/**
 * MOTOR BACKEND: RADAR DE VISTORIA (CENTRAL)
 * Usa a excelente API da comunidade ADSB.fi
 */

const CACHE_TIME_SECONDS = 15; 

// Joinville (Ponto Central) e Raio em Milhas Náuticas (100NM = 185km)
const CONFIG = {
  lat: -26.2245,
  lon: -48.7974,
  raio: 100
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
    return JSON.parse(cached); // Cache hits são super rápidos
  }

  // API ADSB.fi rodando livre via backend Google
  const url = `https://api.adsb.fi/v2/lat/${CONFIG.lat}/lon/${CONFIG.lon}/dist/${CONFIG.raio}`;
  
  const options = {
    method: "get",
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const jsonString = response.getContentText();
  
  if (responseCode !== 200) {
     return { error: true, code: responseCode, message: "ADSB.fi retornou erro", details: jsonString };
  }
  
  try {
    const parsedData = JSON.parse(jsonString);
    cache.put("radar_data", jsonString, CACHE_TIME_SECONDS);
    return parsedData;
  } catch (parseErr) {
    return { error: true, message: "Erro ao ler dados da ADSB.fi: " + parseErr.toString() };
  }
}
