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
 * Gera pontos inteligentes para uma rota
 *
 * Entrada: Origem, destino, distância total
 * Saída: Array de SmartRoutePoint com densidade adaptativa
 */
export function generateSmartRoutePoints(
  startCoords: [number, number],
  endCoords: [number, number],
  totalDistanceKm: number,
  findNearestCity: (lat: number, lng: number) => { name: string; state: string } | null
): SmartRoutePoint[] {
  const points: SmartRoutePoint[] = [];

  // Passo 1: Gerar amostragem base (a cada BASE_SAMPLING_INTERVAL_KM)
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

  for (let i = 0; i < finalPoints.length; i++) {
    const point = finalPoints[i];
    const nextPoint = finalPoints[i + 1];

    // Adicionar ponto atual
    const etaMinutes = Math.round((point.distKm / AVG_SPEED_KMH) * 60);
    const nearestCity = findNearestCity(point.lat, point.lng);
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

    // Se próximo ponto é crítico, adicionar pontos intermediários
    if (nextPoint && point.criticality > 50) {
      const interval = getSamplingInterval(point.criticality);
      let intermediateDist = point.distKm + interval;

      while (intermediateDist < nextPoint.distKm) {
        const ratio = intermediateDist / totalDistanceKm;
        const lat = startCoords[0] + (endCoords[0] - startCoords[0]) * ratio;
        const lng = startCoords[1] + (endCoords[1] - startCoords[1]) * ratio;
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
