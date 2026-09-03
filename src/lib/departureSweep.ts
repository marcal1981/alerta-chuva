// Projeto: Rota Segura / Alerta Chuva
// Módulo: Varredura de horários de partida
//
// A pergunta que o app responde não é "vai chover?" e sim "a que horas eu saio?".
// São perguntas diferentes, e a segunda não se responde com uma única simulação.
//
// POR QUE VARRER, E NÃO CALCULAR UMA VEZ: mudar a partida muda TODOS os ETAs. Sair 2h
// mais tarde não desloca a mesma chuva 2h — cada ponto da rota passa a ser atingido em
// outra hora, e o tempo em cada ponto evoluiu de forma independente. Analisar uma partida
// e a partir dela recomendar outra é raciocínio circular: a simulação feita não diz nada
// sobre as partidas que não foram simuladas.
//
// O CUSTO É ZERO EM API: a série horária completa de cada ponto já foi baixada. A
// varredura é aritmética local sobre dados em memória. Testar 96 horários de partida custa
// exatamente o mesmo que testar um.
//
// ATUALIZAÇÃO v2.0: Risk Score baseado em motociclista (não apenas chuva)
// - 35% chuva + 20% intensidade + 15% pista molhada + 15% rajada + 10% visibilidade + 5% temp
// - Detecta pista molhada mesmo sem chuva agora (histórico 1h-3h)
// - Diferencia garoa (segura) de temporal (crítico)

import { calculateMotorcycleRisk } from './motorcycleRiskScore';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Waypoint {
  /** Rótulo legível: "Caraguatatuba, SP". Preenchido por geocodificação reversa. */
  label: string;
  lat: number;
  lng: number;
  distanceFromStartKm: number;
  /** Minutos de viagem desde a origem até este ponto, em fluxo livre. */
  travelMinutesFromStart: number;
}

/** Série horária de um ponto, como a Open-Meteo devolve (já recortada). */
export interface HourlySeries {
  /** ISO local, ex. "2026-08-28T14:00". Um item por hora. */
  time: string[];
  /** mm na hora. */
  precipitation: number[];
  /** 0-100. */
  precipitationProbability: number[];
  /** km/h. */
  windGusts: number[];
  /** metros. */
  visibility: number[];
  /** °C. */
  temperature: number[];
}

export interface WaypointForecast {
  waypoint: Waypoint;
  hourly: HourlySeries;
}

export type Hazard = "chuva" | "pista_molhada" | "rajada" | "neblina" | "frio_molhado";

export interface SegmentRisk {
  waypoint: Waypoint;
  /** Quando o piloto passa por aqui. */
  eta: Date;
  /** Minutos rodando neste trecho — o trecho que este ponto representa. */
  exposureMin: number;
  precipitationMm: number;
  precipitationProbability: number;
  windGustKmh: number;
  visibilityKm: number;
  temperatureC: number;
  /** 0-100. Quanto maior, pior. */
  risk: number;
  hazards: Hazard[];
}

export interface DepartureOption {
  departure: Date;
  /** 0-100 da viagem inteira. */
  score: number;
  /** Minutos estimados rodando na chuva. */
  wetMinutes: number;
  /** O trecho que define o score. É isso que a interface deve nomear. */
  worstSegment: SegmentRisk;
  segments: SegmentRisk[];
}

// ---------------------------------------------------------------------------
// Limiares
// ---------------------------------------------------------------------------

/**
 * Faixas de intensidade de chuva, em mm/h, e o que cada uma significa PARA QUEM ESTÁ
 * DE MOTO.
 *
 * Ancorar em consequência, não em escala arbitrária, é o que faz o alerta ser entendido.
 * "60% de chance" não diz nada; "chuva forte, aderência comprometida" diz.
 *
 * ATENÇÃO: estas faixas são ponto de partida, não medição. Devem ser corrigidas com
 * observação real — anotar, a cada viagem, o que o app previu e como a estrada estava.
 */
export const RAIN_BANDS_MM = {
  garoa: 0.1,
  moderada: 0.5,
  forte: 4,
  temporal: 10,
} as const;

/**
 * Rajada perigosa em duas rodas.
 *
 * Vento de través em viaduto alto — a Tamoios tem vários — desloca a moto de faixa. O
 * valor é conservador e precisa de calibração; um piloto experiente numa moto pesada
 * tolera bem mais que um iniciante numa 300.
 */
export const DANGEROUS_GUST_KMH = 45;

/** Visibilidade abaixo disso é neblina que atrapalha de verdade. */
export const LOW_VISIBILITY_KM = 1;

/** Abaixo disso, molhado, o risco deixa de ser desconforto e vira hipotermia. */
export const COLD_WET_C = 12;

/**
 * Janela olhada para trás ao decidir se a pista está molhada.
 *
 * ESTE É O DIFERENCIAL DO APP. "Não vai chover às 14h" não significa "pista seca às 14h":
 * se choveu forte às 12h, o asfalto ainda está molhado — e a primeira chuva depois de um
 * período seco levanta óleo, que é o clássico da queda de moto. O dado já está na mesma
 * série horária, nas horas anteriores. Custa zero e nenhuma previsão do tempo comum
 * entrega isso.
 */
export const WET_ROAD_LOOKBACK_HOURS = 2;
export const WET_ROAD_MIN_MM = 1;

// ---------------------------------------------------------------------------
// Pontuação
// ---------------------------------------------------------------------------

/** Severidade da chuva pela intensidade: o que acontece SE chover. */
function rainSeverity(mm: number): number {
  if (mm < RAIN_BANDS_MM.garoa) return 0;
  if (mm < RAIN_BANDS_MM.moderada) return 20;
  if (mm < RAIN_BANDS_MM.forte) return 50;
  if (mm < RAIN_BANDS_MM.temporal) return 80;
  return 100;
}

/**
 * Combina intensidade e probabilidade.
 *
 * Os dois números dizem coisas diferentes e nenhum sozinho basta: 90% de chance de 0,2mm
 * é garoa que não muda nada; 40% de chance de 20mm é temporal que muda a viagem inteira.
 * Mostrar só o percentual — como quase todo app de clima faz — alarma no primeiro caso e
 * silencia no segundo.
 *
 * A intensidade manda, e a probabilidade modula. O piso de 0,35 evita zerar um evento
 * severo só porque a probabilidade está baixa: 30% de chance de temporal ainda merece
 * aparecer para quem vai de moto.
 */
function rainRisk(mm: number, probabilityPct: number): number {
  const severidade = rainSeverity(mm);
  if (severidade === 0) return 0;
  const confianca = Math.max(0.35, probabilityPct / 100);
  return severidade * confianca;
}

function hourIndexFor(hourly: HourlySeries, at: Date): number {
  // Compara instantes, não strings de data: a série vem em horário local do ponto
  // (parâmetro `timezone` na requisição), e comparar texto formatado é a porta de entrada
  // do bug de UTC — se o carimbo local e o relógio do servidor estiverem em fusos
  // diferentes, a busca casa a hora errada em silêncio.
  let melhor = -1;
  let menorDiff = Infinity;

  for (let i = 0; i < hourly.time.length; i++) {
    const t = new Date(`${hourly.time[i]}:00`).getTime();
    const diff = Math.abs(t - at.getTime());
    if (diff < menorDiff) {
      menorDiff = diff;
      melhor = i;
    }
  }
  // Mais de 90 min de distância significa que a série não cobre este instante.
  return menorDiff <= 90 * 60_000 ? melhor : -1;
}

/** Choveu o bastante nas horas anteriores para a pista ainda estar molhada? */
function roadLikelyWet(hourly: HourlySeries, index: number): boolean {
  const inicio = Math.max(0, index - WET_ROAD_LOOKBACK_HOURS);
  for (let i = inicio; i < index; i++) {
    if ((hourly.precipitation[i] ?? 0) >= WET_ROAD_MIN_MM) return true;
  }
  return false;
}

function evaluateSegment(
  forecast: WaypointForecast,
  departure: Date,
  exposureMin: number
): SegmentRisk | null {
  const eta = new Date(departure.getTime() + forecast.waypoint.travelMinutesFromStart * 60_000);
  const i = hourIndexFor(forecast.hourly, eta);
  if (i < 0) return null; // fora do alcance da previsão

  const h = forecast.hourly;
  const mm = h.precipitation[i] ?? 0;
  const prob = h.precipitationProbability[i] ?? 0;
  const gust = h.windGusts[i] ?? 0;
  const visKm = (h.visibility[i] ?? 30_000) / 1000;
  const temp = h.temperature[i] ?? 20;

  // Histórico de precipitação para detecção de pista molhada
  const precipLast1h = i > 0 ? (h.precipitation[i - 1] ?? 0) : 0;
  const precipLast3h = i > 2
    ? ((h.precipitation[i - 3] ?? 0) + (h.precipitation[i - 2] ?? 0) + (h.precipitation[i - 1] ?? 0)) / 3
    : 0;

  // Usar novo Motorcycle Risk Score (35% chuva, 20% intensidade, 15% pista molhada, etc)
  const { risk, components } = calculateMotorcycleRisk(
    mm,
    prob,
    precipLast1h,
    precipLast3h,
    gust,
    visKm,
    temp
  );

  // Detectar hazards baseado nos componentes do risco
  const hazards: Hazard[] = [];

  if (components.rainScore > 0) {
    hazards.push("chuva");
  }

  if (components.roadWetnessScore > 30) {
    hazards.push("pista_molhada");
  }

  if (components.gustScore > 30) {
    hazards.push("rajada");
  }

  if (components.visibilityScore > 30) {
    hazards.push("neblina");
  }

  if (temp <= COLD_WET_C && (mm >= RAIN_BANDS_MM.moderada || components.roadWetnessScore > 0)) {
    hazards.push("frio_molhado");
  }

  return {
    waypoint: forecast.waypoint,
    eta,
    exposureMin,
    precipitationMm: mm,
    precipitationProbability: prob,
    windGustKmh: gust,
    visibilityKm: visKm,
    temperatureC: temp,
    risk,
    hazards,
  };
}

/**
 * Pontua a viagem inteira a partir dos trechos.
 *
 * Combina duas leituras que sozinhas enganam:
 *   - PIOR TRECHO: um temporal de 15 min na serra estraga a viagem, mesmo com o resto
 *     limpo. Média diluiria isso até desaparecer.
 *   - EXPOSIÇÃO: 5 min de garoa e 90 min de garoa não são a mesma viagem, e o pior
 *     trecho sozinho não distingue as duas.
 *
 * O pior trecho domina (peso 0,7) porque é ele que decide se dá para ir; a exposição
 * ajusta (0,3) para desempatar entre horários com pico parecido.
 */
function scoreTrip(segments: SegmentRisk[]): { score: number; wetMinutes: number } {
  if (segments.length === 0) return { score: 0, wetMinutes: 0 };

  const pior = Math.max(...segments.map((s) => s.risk));
  const totalMin = segments.reduce((soma, s) => soma + s.exposureMin, 0);
  const wetMinutes = segments
    .filter((s) => s.precipitationMm >= RAIN_BANDS_MM.moderada)
    .reduce((soma, s) => soma + s.exposureMin, 0);

  const exposicaoPonderada =
    totalMin > 0
      ? segments.reduce((soma, s) => soma + s.risk * s.exposureMin, 0) / totalMin
      : 0;

  return {
    score: Math.round(pior * 0.7 + exposicaoPonderada * 0.3),
    wetMinutes: Math.round(wetMinutes),
  };
}

// ---------------------------------------------------------------------------
// A varredura
// ---------------------------------------------------------------------------

export interface SweepOptions {
  /** Primeira partida avaliada. Padrão: agora. */
  from?: Date;
  /** Quantas horas à frente varrer. 48h cobre quem planeja na véspera. */
  horizonHours?: number;
  /** Granularidade da varredura. 30 min é fino o bastante e barato. */
  stepMinutes?: number;
}

/**
 * Avalia todas as partidas candidatas e devolve a curva completa de risco.
 *
 * O retorno é a fonte do gráfico principal do app: RISCO DA VIAGEM × HORA DE PARTIDA.
 * Esse gráfico responde diretamente a pergunta do usuário — o vale da curva É o horário
 * de sair. O gráfico atual (chuva × hora do dia) responde outra coisa, e obriga a pessoa
 * a fazer a tradução de cabeça.
 */
export function sweepDepartures(
  forecasts: WaypointForecast[],
  options: SweepOptions = {}
): DepartureOption[] {
  const from = options.from ?? new Date();
  const horizonHours = options.horizonHours ?? 48;
  const stepMinutes = options.stepMinutes ?? 30;

  const ordenados = [...forecasts].sort(
    (a, b) => a.waypoint.travelMinutesFromStart - b.waypoint.travelMinutesFromStart
  );

  // Cada ponto representa o trecho que vai dele até o próximo. O último herda a duração
  // do anterior, por não ter sucessor.
  const exposicoes = ordenados.map((f, i) => {
    const proximo = ordenados[i + 1];
    if (proximo) {
      return proximo.waypoint.travelMinutesFromStart - f.waypoint.travelMinutesFromStart;
    }
    const anterior = ordenados[i - 1];
    return anterior
      ? f.waypoint.travelMinutesFromStart - anterior.waypoint.travelMinutesFromStart
      : 30;
  });

  const opcoes: DepartureOption[] = [];
  const passos = Math.floor((horizonHours * 60) / stepMinutes);

  for (let p = 0; p <= passos; p++) {
    const departure = new Date(from.getTime() + p * stepMinutes * 60_000);

    const segments: SegmentRisk[] = [];
    let incompleto = false;

    for (let i = 0; i < ordenados.length; i++) {
      const seg = evaluateSegment(ordenados[i], departure, exposicoes[i]);
      if (!seg) {
        incompleto = true;
        break;
      }
      segments.push(seg);
    }

    // Partida cuja chegada cai fora da previsão é descartada, não pontuada com o que
    // sobrou. Pontuar viagem parcial produziria um falso "horário ótimo" no fim do
    // horizonte, justamente onde faltam dados — o tipo de erro que parece resultado.
    if (incompleto || segments.length === 0) continue;

    const { score, wetMinutes } = scoreTrip(segments);
    const worstSegment = segments.reduce((pior, s) => (s.risk > pior.risk ? s : pior));

    opcoes.push({ departure, score, wetMinutes, worstSegment, segments });
  }

  return opcoes;
}

// ---------------------------------------------------------------------------
// Leitura do resultado
// ---------------------------------------------------------------------------

export interface Recommendation {
  best: DepartureOption | null;
  /** Faixa contínua de partidas com score baixo, contendo a melhor. */
  safeWindow: { start: Date; end: Date } | null;
  /** Faixa contínua de maior risco — o que evitar. */
  avoidWindow: { start: Date; end: Date } | null;
  /** true quando nenhuma partida evita a chuva: aí a escolha é a menos ruim. */
  noDryOption: boolean;
}

export const SAFE_SCORE = 20;
export const RISKY_SCORE = 55;

/**
 * Reduz a curva à recomendação exibida.
 *
 * `noDryOption` existe porque a resposta honesta às vezes é "não tem horário seco". Nesse
 * caso o app não deve inventar uma janela verde: deve dizer qual é a viagem menos ruim e
 * onde ela molha. Prometer seco num dia inteiro de chuva é o tipo de alarme falso que
 * destrói a confiança no aviso seguinte.
 */
export function recommend(options: DepartureOption[]): Recommendation {
  if (options.length === 0) {
    return { best: null, safeWindow: null, avoidWindow: null, noDryOption: true };
  }

  const best = options.reduce((m, o) => (o.score < m.score ? o : m));

  const faixaAoRedor = (predicado: (o: DepartureOption) => boolean, centro: number) => {
    if (!predicado(options[centro])) return null;
    let ini = centro;
    let fim = centro;
    while (ini > 0 && predicado(options[ini - 1])) ini--;
    while (fim < options.length - 1 && predicado(options[fim + 1])) fim++;
    return { start: options[ini].departure, end: options[fim].departure };
  };

  const indiceMelhor = options.indexOf(best);
  const safeWindow = faixaAoRedor((o) => o.score <= SAFE_SCORE, indiceMelhor);

  const pior = options.reduce((m, o) => (o.score > m.score ? o : m));
  const avoidWindow =
    pior.score >= RISKY_SCORE
      ? faixaAoRedor((o) => o.score >= RISKY_SCORE, options.indexOf(pior))
      : null;

  return { best, safeWindow, avoidWindow, noDryOption: best.score > SAFE_SCORE };
}
