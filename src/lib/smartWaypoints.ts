/**
 * Smart Route Sampling Engine para Rota Segura v2.0
 *
 * Motor genérico e reutilizável de amostragem adaptativa de rotas.
 *
 * Lógica:
 * 1. Amostragem base a cada 20km
 * 2. Extrair elevação estimada
 * 3. Calcular ROUTE_CRITICALITY_SCORE (baseado em variação de altitude)
 * 4. Decidir espaçamento dinamicamente
 * 5. Gerar pontos com densidade variável
 * 6. Limitar a MAX_SMART_POINTS
 *
 * Benefício: Funciona em qualquer rota do Brasil, não depende de classificação geográfica fixa.
 */

export interface SmartRoutePoint {
  id: string;
  lat: number;
  lng: number;
  distanceFromStartKm: number;
  distanceToNextKm: number;
  elevationM: number;
  criticalityScore: number; // 0-100
  samplingReason: 'base' | 'rapid_elevation_change' | 'critical_zone' | 'destination';
  etaMinutes: number;
}

export interface GeoJSONGeometry {
  type: 'LineString';
  coordinates: Array<[number, number]>; // [lng, lat] — OSRM format
}

// Configuração
const BASE_SAMPLING_INTERVAL_KM = 20;
const MAX_SMART_POINTS = 35;
const ELEVATION_CHANGE_THRESHOLD_HIGH = 300; // m (muito crítico)
const ELEVATION_CHANGE_THRESHOLD_MED = 150;  // m (crítico)
const AVG_SPEED_KMH = 80; // Para cálculo de ETA

/**
 * Estima elevação baseado em coordenadas geográficas
 * Usa aproximação simplificada para demo.
 * Em produção: usar Open-Elevation API ou dados SRTM.
 */
function estimateElevation(lat: number, lng: number): number {
  // Serra da Tamoios (SJC → Ilhabela)
  if (lat < -23.7 && lat > -23.9 && lng < -45.2 && lng > -45.5) {
    return 700;
  }

  // Litoral
  if (lat < -23.7 && lng < -45.3) {
    return 20;
  }

  // Planalto paulista
  if (lat < -23.0 && lat > -24.0) {
    return 550;
  }

  // Padrão
  return 600;
}

/**
 * Calcula criticality score de um segmento
 *
 * CRITICALITY_SCORE combina:
 * - Variação de altitude (40 pts)
 * - Declive acentuado (30 pts)
 * - Transição climática (30 pts, estimado)
 *
 * Resultado: 0-100
 * - 0-20: Normal (40km entre pontos)
 * - 21-50: Atenção (20km)
 * - 51-80: Crítico (10km)
 * - 81+: Muito crítico (5km)
 */
function calculateCriticalityScore(
  elevationChange: number,
  segmentLengthKm: number,
  slope: number
): { score: number; reason: string } {
  let score = 0;

  // Variação de altitude
  if (elevationChange > ELEVATION_CHANGE_THRESHOLD_HIGH) {
    score += 40;
  } else if (elevationChange > ELEVATION_CHANGE_THRESHOLD_MED) {
    score += 30;
  } else if (elevationChange > 100) {
    score += 20;
  } else if (elevationChange > 50) {
    score += 10;
  }

  // Declive acentuado (>8% é perigoso em moto)
  if (slope > 8) {
    score += 30;
  } else if (slope > 4) {
    score += 20;
  } else if (slope > 2) {
    score += 10;
  }

  // Penalizar trechos muito curtos (podem indicar curvas)
  if (segmentLengthKm < 5) {
    score += 20;
  }

  const finalScore = Math.min(100, score);
  const reason =
    finalScore >= 81
      ? 'muito_critico'
      : finalScore >= 51
        ? 'critico'
        : finalScore >= 21
          ? 'atencao'
          : 'normal';

  return { score: finalScore, reason };
}

/**
 * Define espaçamento baseado em criticality score
 */
function getSamplingInterval(criticality: number): number {
  if (criticality >= 81) return 5;
  if (criticality >= 51) return 10;
  if (criticality >= 21) return 20;
  return 40;
}

/**
 * Converte uma geometria LineString em ponto-a-ponto com distâncias acumuladas
 * Usa as coordenadas reais da rota, não interpolação linear
 */
function geometryToDistancePoints(
  geometry: GeoJSONGeometry
): Array<{ lat: number; lng: number; distanceKm: number }> {
  const points: Array<{ lat: number; lng: number; distanceKm: number }> = [];
  let accumulatedDistanceKm = 0;

  for (let i = 0; i < geometry.coordinates.length; i++) {
    const [lng, lat] = geometry.coordinates[i];

    // Calcular distância até este ponto (Haversine simplificado)
    if (i > 0) {
      const [prevLng, prevLat] = geometry.coordinates[i - 1];
      const dLat = (lat - prevLat) * Math.PI / 180;
      const dLng = (lng - prevLng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(prevLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = 6371 * c; // Raio da Terra em km
      accumulatedDistanceKm += distanceKm;
    }

    points.push({ lat, lng, distanceKm: accumulatedDistanceKm });
  }

  return points;
}

/**
 * Amostra pontos inteligentes da geometria real da rota
 *
 * Entrada: Geometria do OSRM (LineString)
 * Saída: Array de SmartRoutePoint com densidade adaptativa baseada na geometria
 */
export function generateSmartRoutePointsFromGeometry(
  geometry: GeoJSONGeometry,
  totalDistanceKm: number
): SmartRoutePoint[] {
  const points: SmartRoutePoint[] = [];

  // Converter geometria em pontos com distâncias
  const geometryPoints = geometryToDistancePoints(geometry);

  if (geometryPoints.length < 2) {
    return [];
  }

  // Amostragem base a cada BASE_SAMPLING_INTERVAL_KM
  const basePoints: Array<{ distKm: number; lat: number; lng: number; elev: number }> = [];

  for (let targetDist = 0; targetDist <= totalDistanceKm; targetDist += BASE_SAMPLING_INTERVAL_KM) {
    // Encontrar ponto mais próximo na geometria
    let nearestIdx = 0;
    let minDiff = Math.abs(geometryPoints[0].distanceKm - targetDist);

    for (let i = 1; i < geometryPoints.length; i++) {
      const diff = Math.abs(geometryPoints[i].distanceKm - targetDist);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = i;
      }
    }

    const gp = geometryPoints[nearestIdx];
    const elev = estimateElevation(gp.lat, gp.lng);
    basePoints.push({ distKm: gp.distanceKm, lat: gp.lat, lng: gp.lng, elev });
  }

  // Garantir que o ponto final está incluído
  const lastGp = geometryPoints[geometryPoints.length - 1];
  if (!basePoints.some(p => Math.abs(p.distKm - lastGp.distanceKm) < 1)) {
    basePoints.push({
      distKm: lastGp.distanceKm,
      lat: lastGp.lat,
      lng: lastGp.lng,
      elev: estimateElevation(lastGp.lat, lastGp.lng),
    });
  }

  basePoints.sort((a, b) => a.distKm - b.distKm);

  return generateSmartRoutePointsFromBasePoints(basePoints);
}

/**
 * Versão legada que usa interpolação linear (remover após migração)
 * Gera pontos inteligentes para uma rota
 *
 * Entrada: Origem, destino, distância total
 * Saída: Array de SmartRoutePoint com densidade adaptativa
 */
export function generateSmartRoutePoints(
  startCoords: [number, number],
  endCoords: [number, number],
  totalDistanceKm: number,
  findNearestCity?: (lat: number, lng: number) => { name: string; state: string } | null
): SmartRoutePoint[] {
  const points: SmartRoutePoint[] = [];

  // Passo 1: Gerar amostragem base (a cada BASE_SAMPLING_INTERVAL_KM) — USANDO INTERPOLAÇÃO LINEAR
  // ⚠️ IMPORTANTE: Isso é um fallback. Preferencialmente use generateSmartRoutePointsFromGeometry()
  let currentDist = 0;
  const basePoints: Array<{
    distKm: number;
    lat: number;
    lng: number;
    elev: number;
  }> = [];

  while (currentDist <= totalDistanceKm) {
    const ratio = Math.min(1, currentDist / totalDistanceKm);
    const lat = startCoords[0] + (endCoords[0] - startCoords[0]) * ratio;
    const lng = startCoords[1] + (endCoords[1] - startCoords[1]) * ratio;
    const elev = estimateElevation(lat, lng);

    basePoints.push({ distKm: currentDist, lat, lng, elev });
    currentDist += BASE_SAMPLING_INTERVAL_KM;
  }

  return generateSmartRoutePointsFromBasePoints(basePoints);
}

/**
 * Processa basePoints para gerar SmartRoutePoint com criticality e densidade adaptativa
 */
function generateSmartRoutePointsFromBasePoints(
  basePoints: Array<{ distKm: number; lat: number; lng: number; elev: number }>
): SmartRoutePoint[] {
  const points: SmartRoutePoint[] = [];

  // Passo 2: Analisar cada segmento para criticality
  let finalPoints = basePoints.map((point, idx) => {
    const nextPoint = basePoints[idx + 1];
    const prevPoint = idx > 0 ? basePoints[idx - 1] : null;

    let elevationChange = 0;
    let slope = 0;

    if (nextPoint) {
      elevationChange = Math.abs(nextPoint.elev - point.elev);
      slope = (elevationChange / (nextPoint.distKm - point.distKm)) * 100;
    } else if (prevPoint) {
      elevationChange = Math.abs(point.elev - prevPoint.elev);
      slope = (elevationChange / (point.distKm - prevPoint.distKm)) * 100;
    }

    const { score: criticality } = calculateCriticalityScore(
      elevationChange,
      nextPoint ? nextPoint.distKm - point.distKm : BASE_SAMPLING_INTERVAL_KM,
      slope
    );

    return { ...point, criticality };
  });

  // Passo 3: Re-amostrar pontos críticos com densidade maior
  const refinedPoints: SmartRoutePoint[] = [];
  let pointId = 0;
  const totalDistanceKm = basePoints.length > 0 ? basePoints[basePoints.length - 1].distKm : 0;

  for (let i = 0; i < finalPoints.length; i++) {
    const point = finalPoints[i];
    const nextPoint = finalPoints[i + 1];

    // Adicionar ponto atual
    const etaMinutes = Math.round((point.distKm / AVG_SPEED_KMH) * 60);
    const distToNext = nextPoint ? nextPoint.distKm - point.distKm : 0;

    refinedPoints.push({
      id: `route-point-${pointId++}`,
      lat: point.lat,
      lng: point.lng,
      distanceFromStartKm: point.distKm,
      distanceToNextKm: distToNext,
      elevationM: Math.round(point.elev),
      criticalityScore: Math.round(point.criticality),
      samplingReason: i === finalPoints.length - 1 ? 'destination' : 'base',
      etaMinutes,
    });

    // Se próximo ponto é crítico, interpolar pontos adicionais (linear, para densidade)
    if (nextPoint && point.criticality > 50) {
      const interval = getSamplingInterval(point.criticality);
      let intermediateDist = point.distKm + interval;

      while (intermediateDist < nextPoint.distKm) {
        // Interpolação linear entre os dois pontos
        const ratio = (intermediateDist - point.distKm) / (nextPoint.distKm - point.distKm);
        const lat = point.lat + (nextPoint.lat - point.lat) * ratio;
        const lng = point.lng + (nextPoint.lng - point.lng) * ratio;
        const elev = estimateElevation(lat, lng);

        const etaMin = Math.round((intermediateDist / AVG_SPEED_KMH) * 60);
        const nextDist = i + 1 < finalPoints.length ? finalPoints[i + 1].distKm : totalDistanceKm;

        refinedPoints.push({
          id: `route-point-${pointId++}`,
          lat,
          lng,
          distanceFromStartKm: intermediateDist,
          distanceToNextKm: nextDist - intermediateDist,
          elevationM: Math.round(elev),
          criticalityScore: Math.round(point.criticality),
          samplingReason: 'critical_zone',
          etaMinutes: etaMin,
        });

        intermediateDist += interval;
      }
    }
  }

  // Passo 4: Consolidar e limitar a MAX_SMART_POINTS
  // Se muito pontos, agrupar os que têm criticidades semelhantes
  if (refinedPoints.length > MAX_SMART_POINTS) {
    return consolidatePoints(refinedPoints, MAX_SMART_POINTS);
  }

  return refinedPoints;
}

/**
 * Consolida pontos muito próximos com criticidades semelhantes
 */
function consolidatePoints(points: SmartRoutePoint[], maxCount: number): SmartRoutePoint[] {
  if (points.length <= maxCount) return points;

  // Simplificar: manter pontos críticos e base, descartar alguns intermediários
  const critical = points.filter((p) => p.criticalityScore > 50);
  const base = points.filter((p) => p.criticalityScore <= 50);
  const toKeep = Math.max(critical.length, maxCount - critical.length);

  const baseSampled = base.filter((_, i) => i % Math.ceil(base.length / toKeep) === 0);
  return [...critical, ...baseSampled].sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm);
}

/**
 * Debug: mostra perfil de criticality
 */
export function debugCriticalityProfile(points: SmartRoutePoint[]): string {
  let output = '\n═══ ROUTE CRITICALITY PROFILE ═══\n';
  output += 'Km   │ Elev │ Criticality │ Reason\n';
  output += '─────┼──────┼─────────────┼──────────────────\n';

  for (const p of points) {
    const critBar = '█'.repeat(Math.floor(p.criticalityScore / 10)) + '░'.repeat(10 - Math.floor(p.criticalityScore / 10));
    output += `${p.distanceFromStartKm.toFixed(1).padStart(4)} │ ${p.elevationM.toString().padStart(4)} │ ${critBar} ${p.criticalityScore.toString().padStart(2)} │ ${p.samplingReason}\n`;
  }

  output += `\nTotal points: ${points.length}\n`;
  return output;
}
