/**
 * Motorcycle Risk Score for Rota Segura
 *
 * Combina múltiplas variáveis meteorológicas em um score único que um motociclista entende:
 *
 * MOTORCYCLE_RISK = (
 *   35% × rain_risk +
 *   20% × intensity_risk +
 *   15% × road_wetness_risk +
 *   15% × gust_risk +
 *   10% × visibility_risk +
 *   5% × temperature_risk
 * )
 *
 * Cada componente é 0-100, e o resultado também é 0-100.
 */

export const RAIN_BANDS_MM = {
  garoa: 0.1,
  moderada: 0.5,
  forte: 4,
  temporal: 10,
} as const;

export const DANGEROUS_GUST_KMH = 45;
export const LOW_VISIBILITY_KM = 1;
export const COLD_WET_C = 12;
export const WET_ROAD_LOOKBACK_HOURS = 2;

/**
 * Risk Score 1: Chuva (precipitação + probabilidade)
 * 0% = sem chuva
 * 100% = chuva certa e forte
 */
export function rainRisk(precipitationMm: number, probability: number): number {
  // Se precipitação é zero, risk é baixo mesmo que probabilidade seja alta
  if (precipitationMm < 0.1) {
    return 0;
  }

  // Combinar: precipitação × probabilidade
  // Exemplo: 0.3mm com 100% = risco moderado (garoa certa)
  //          4mm com 50% = risco alto (chuva forte, possível)
  const precipRisk = Math.min(100, (precipitationMm / RAIN_BANDS_MM.forte) * 80);
  const probRisk = (probability / 100) * 80;

  // Média ponderada: precipitation tem mais peso
  return Math.round(precipRisk * 0.6 + probRisk * 0.4);
}

/**
 * Risk Score 2: Intensidade (volume de precipitação)
 * Diferencia entre garoa, chuva moderada e temporal
 */
export function intensityRisk(precipitationMm: number): number {
  if (precipitationMm < RAIN_BANDS_MM.garoa) {
    return 0;
  }

  if (precipitationMm < RAIN_BANDS_MM.moderada) {
    // Garoa: 0.1 - 0.5 mm
    return 15;
  }

  if (precipitationMm < RAIN_BANDS_MM.forte) {
    // Moderada: 0.5 - 4 mm
    return 45;
  }

  if (precipitationMm < RAIN_BANDS_MM.temporal) {
    // Forte: 4 - 10 mm
    return 75;
  }

  // Temporal: > 10 mm
  return 100;
}

/**
 * Risk Score 3: Pista molhada (histórico de chuva recente)
 *
 * Detecta que a estrada estará molhada mesmo que não esteja chovendo AGORA
 * Crucial para motociclista: aderência comprometida é risco!
 */
export function roadWetnessRisk(
  precipLast1h: number,
  precipLast3h: number,
  temperatureC: number,
  windGustKmh: number
): number {
  // Baseline: se choveu recentemente, pista molhada
  const recentRain = Math.max(precipLast1h * 1.5, precipLast3h * 0.8);

  if (recentRain < 0.2) {
    return 0; // Pista seca
  }

  let risk = Math.min(100, recentRain * 30);

  // Temperatura: frio segura menos rápido
  if (temperatureC < 15) {
    risk = Math.min(100, risk * 1.3);
  }

  // Vento: acelera secagem
  if (windGustKmh > 30) {
    risk = Math.max(0, risk * 0.7);
  }

  return Math.round(risk);
}

/**
 * Risk Score 4: Rajadas de vento
 * Para motociclista, rajada > 45 km/h é perigosa (desequilíbrio)
 */
export function gustRisk(windGustKmh: number): number {
  if (windGustKmh < 30) {
    return 0;
  }

  if (windGustKmh < DANGEROUS_GUST_KMH) {
    // 30-45 km/h: incômodo, mas controlável
    return 30;
  }

  if (windGustKmh < 60) {
    // 45-60 km/h: perigoso
    return 65;
  }

  // > 60 km/h: muito perigoso
  return 95;
}

/**
 * Risk Score 5: Visibilidade
 * Neblina/chuva reduz visibilidade → risco crítico para moto
 */
export function visibilityRisk(visibilityKm: number): number {
  if (visibilityKm > 5) {
    return 0; // Excelente visibilidade
  }

  if (visibilityKm > 2) {
    return 20; // Boa, mas reduzia
  }

  if (visibilityKm > 1) {
    return 50; // Reduzida (neblina)
  }

  if (visibilityKm > 0.5) {
    return 80; // Muito reduzida
  }

  // < 0.5 km: crítico
  return 100;
}

/**
 * Risk Score 6: Temperatura
 * Frio + molhado = risco adicional (motociclista perde motricidade, pode derrapar)
 * Apenas importa se há precipitação/pista molhada
 */
export function temperatureRisk(temperatureC: number, isWet: boolean): number {
  if (!isWet || temperatureC > COLD_WET_C) {
    return 0;
  }

  // Frio molhado: 12°C ou menos com água
  if (temperatureC > 5) {
    return 30; // Desconforto, risco leve
  }

  if (temperatureC > 0) {
    return 60; // Frio severo, mãos dormem
  }

  // < 0°C: possível gelo
  return 100;
}

/**
 * MOTORCYCLE_RISK_SCORE: Combina tudo
 *
 * Pesos refinados para realidade de motociclista:
 * - Chuva é o maior risco (35%)
 * - Intensidade diferencia garoa de temporal (20%)
 * - Pista molhada é tão perigosa quanto intensidade (15%)
 * - Rajada desequilibra (15%)
 * - Visibilidade impede ver obstáculos (10%)
 * - Temperatura é secundária, apenas com molhado (5%)
 */
export interface MotorcycleRiskComponents {
  rainScore: number;
  intensityScore: number;
  roadWetnessScore: number;
  gustScore: number;
  visibilityScore: number;
  temperatureScore: number;
}

export function calculateMotorcycleRisk(
  precipitationMm: number,
  precipitationProbability: number,
  precipLast1h: number = 0,
  precipLast3h: number = 0,
  windGustKmh: number,
  visibilityKm: number,
  temperatureC: number
): { risk: number; components: MotorcycleRiskComponents } {
  const isWet = precipitationMm > 0 || precipLast1h > 0.1 || precipLast3h > 0.2;

  const components: MotorcycleRiskComponents = {
    rainScore: rainRisk(precipitationMm, precipitationProbability),
    intensityScore: intensityRisk(precipitationMm),
    roadWetnessScore: roadWetnessRisk(precipLast1h, precipLast3h, temperatureC, windGustKmh),
    gustScore: gustRisk(windGustKmh),
    visibilityScore: visibilityRisk(visibilityKm),
    temperatureScore: temperatureRisk(temperatureC, isWet),
  };

  const weights = {
    rain: 0.35,
    intensity: 0.2,
    wetness: 0.15,
    gust: 0.15,
    visibility: 0.1,
    temperature: 0.05,
  };

  const risk =
    components.rainScore * weights.rain +
    components.intensityScore * weights.intensity +
    components.roadWetnessScore * weights.wetness +
    components.gustScore * weights.gust +
    components.visibilityScore * weights.visibility +
    components.temperatureScore * weights.temperature;

  return {
    risk: Math.round(risk),
    components,
  };
}

/**
 * Função auxiliar para debug: mostra breakdown do risco
 */
export function debugRiskBreakdown(
  precipitation: number,
  probability: number,
  wind: number,
  visibility: number,
  temp: number
): string {
  const { risk, components } = calculateMotorcycleRisk(
    precipitation,
    probability,
    0,
    0,
    wind,
    visibility,
    temp
  );

  let output = '\n═══ MOTORCYCLE RISK BREAKDOWN ═══\n';
  output += `Chuva:         ${components.rainScore.toString().padStart(3)} (35% weight)\n`;
  output += `Intensidade:   ${components.intensityScore.toString().padStart(3)} (20% weight)\n`;
  output += `Pista Molhada: ${components.roadWetnessScore.toString().padStart(3)} (15% weight)\n`;
  output += `Rajada:        ${components.gustScore.toString().padStart(3)} (15% weight)\n`;
  output += `Visibilidade:  ${components.visibilityScore.toString().padStart(3)} (10% weight)\n`;
  output += `Temperatura:   ${components.temperatureScore.toString().padStart(3)} (5% weight)\n`;
  output += '─────────────────────────────\n';
  output += `RISK TOTAL:    ${risk.toString().padStart(3)} (0-100)\n`;

  // Interpretação
  if (risk <= 20) {
    output += '🟢 SEGURO: Viagem confortável\n';
  } else if (risk <= 55) {
    output += '🟡 MODERADO: Atento às condições\n';
  } else if (risk <= 75) {
    output += '🟠 ALTO: Considere atrasar\n';
  } else {
    output += '🔴 CRÍTICO: Não recomendado sair\n';
  }

  return output;
}
