import { NextRequest, NextResponse } from 'next/server';

interface TimeSlotAnalysis {
  departure_time: string;
  risk_score: number;
  rain_probability: number;
  risk_level: 'baixo' | 'moderado' | 'alto' | 'critico';
  points_forecast: PointForecast[];
}

interface PointForecast {
  km: number;
  time: string;
  precipitation_probability: number;
  risk_value: number;
}

const GEOCODING_CACHE: Record<string, string> = {
  'são paulo': '-23.5505,-46.6333',
  'sjc': '-23.2237,-45.9011',
  'ilhabela': '-23.7786,-45.3553',
  'campinas': '-22.9068,-47.4616',
  'sorocaba': '-23.5006,-47.4779',
  'paraibuna': '-23.3456,-45.6789',
  'salesópolis': '-23.5136,-45.7578',
  'caraguatatuba': '-23.6159,-45.4131',
  'são sebastião': '-23.7597,-45.3873',
};

async function geocodeAddress(address: string): Promise<string> {
  const key = address.toLowerCase().trim();
  for (const [city, coords] of Object.entries(GEOCODING_CACHE)) {
    if (key.includes(city)) return coords;
  }
  return '-23.5505,-46.6333';
}

async function fetchRoute(from: string, to: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/routes?from=${from}&to=${to}`
  );
  if (!response.ok) throw new Error('Erro ao calcular rota');
  return response.json();
}

async function fetchForecast(latitude: string, longitude: string, date: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/forecast?latitude=${latitude}&longitude=${longitude}&date=${date}`
  );
  if (!response.ok) throw new Error('Erro ao buscar previsão');
  return response.json();
}

function calculateRiskValue(precipitationProbability: number): number {
  if (precipitationProbability > 50) return 10; // Chuva forte
  if (precipitationProbability > 30) return 5;  // Chuva moderada
  if (precipitationProbability > 20) return 3;  // Probabilidade média
  if (precipitationProbability > 0) return 1;   // Pequena chance
  return 0; // Sem chuva
}

function getRiskLevel(totalScore: number): 'baixo' | 'moderado' | 'alto' | 'critico' {
  if (totalScore <= 5) return 'baixo';
  if (totalScore <= 15) return 'moderado';
  if (totalScore <= 30) return 'alto';
  return 'critico';
}

function calculateRainProbability(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Converter score médio para porcentagem (aproximado)
  // Score 0-2: 0-15%, Score 2-4: 15-30%, etc
  return Math.min(Math.max(avgScore * 10, 0), 100);
}

function addHoursToTime(timeStr: string, hours: number): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(h + hours, m, 0, 0);
  return date;
}

function timeToString(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, destination, date, available_period_start = '06:00', available_period_end = '18:00' } = body;

    if (!origin || !destination || !date) {
      return NextResponse.json(
        { error: 'origin, destination e date são obrigatórios' },
        { status: 400 }
      );
    }

    // Step 1: Geocodificação
    const originCoords = await geocodeAddress(origin);
    const destCoords = await geocodeAddress(destination);
    const [originLat, originLng] = originCoords.split(',');

    // Step 2: Cálculo da rota
    const routeData = await fetchRoute(originCoords, destCoords);
    const distanceKm = routeData.distance;
    const durationMinutes = routeData.duration;

    // Step 3: Previsão meteorológica
    const forecastData = await fetchForecast(originLat, originLng, date);
    const hourlyForecast = forecastData.hourly;

    // Step 4: Simular múltiplos horários de saída
    const [startHour, startMin] = available_period_start.split(':').map(Number);
    const [endHour, endMin] = available_period_end.split(':').map(Number);

    const analysisResults: TimeSlotAnalysis[] = [];

    // Testar cada hora disponível
    for (let hour = startHour; hour <= endHour; hour++) {
      const departureTime = `${String(hour).padStart(2, '0')}:00`;
      const departureDate = addHoursToTime(departureTime, 0);

      // Calcular horário de chegada
      const arrivalDate = new Date(departureDate);
      arrivalDate.setMinutes(arrivalDate.getMinutes() + durationMinutes);

      // Simular pontos intermediários da rota (origem, meio, destino)
      const points = [
        {
          km: 0,
          fraction: 0,
          percentageTime: 0,
        },
        {
          km: distanceKm / 2,
          fraction: 0.5,
          percentageTime: 50,
        },
        {
          km: distanceKm,
          fraction: 1,
          percentageTime: 100,
        },
      ];

      let totalRiskScore = 0;
      const pointsForecasts: PointForecast[] = [];
      const riskValues: number[] = [];

      for (const point of points) {
        // Calcular horário estimado para cada ponto
        const pointDate = new Date(departureDate);
        pointDate.setMinutes(pointDate.getMinutes() + Math.round(durationMinutes * point.fraction));

        // Encontrar previsão mais próxima
        const pointTime = pointDate.toISOString().split('T')[1].substring(0, 5);
        const closestForecast = hourlyForecast.reduce((prev: any, curr: any) => {
          const prevTime = new Date(prev.time).getTime();
          const currTime = new Date(curr.time).getTime();
          const pointTime = pointDate.getTime();
          return Math.abs(currTime - pointTime) < Math.abs(prevTime - pointTime) ? curr : prev;
        });

        const precipProb = closestForecast.precipitation_probability || 0;
        const riskValue = calculateRiskValue(precipProb);

        pointsForecasts.push({
          km: point.km,
          time: pointTime,
          precipitation_probability: precipProb,
          risk_value: riskValue,
        });

        totalRiskScore += riskValue;
        riskValues.push(riskValue);
      }

      const riskLevel = getRiskLevel(totalRiskScore);
      const rainProbability = calculateRainProbability(riskValues);

      analysisResults.push({
        departure_time: departureTime,
        risk_score: totalRiskScore,
        rain_probability: Math.round(rainProbability),
        risk_level: riskLevel,
        points_forecast: pointsForecasts,
      });
    }

    // Step 5: Ordenar por risco (menor é melhor)
    analysisResults.sort((a, b) => a.risk_score - b.risk_score);

    // Step 6: Preparar recomendação
    const bestOption = analysisResults[0];
    const alternatives = analysisResults.slice(1, 3);
    const timesToAvoid = analysisResults.filter((r) => r.risk_level === 'critico' || r.risk_level === 'alto').slice(0, 3);

    return NextResponse.json({
      route_info: {
        origin,
        destination,
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        date,
      },
      recommendation: {
        best_time: bestOption.departure_time,
        risk_level: bestOption.risk_level,
        rain_probability: `${bestOption.rain_probability}%`,
        risk_score: bestOption.risk_score,
        alternatives: alternatives.map((alt) => ({
          time: alt.departure_time,
          risk_level: alt.risk_level,
          rain_probability: `${alt.rain_probability}%`,
        })),
        times_to_avoid: timesToAvoid.map((avoid) => ({
          time: avoid.departure_time,
          risk_level: avoid.risk_level,
          rain_probability: `${avoid.rain_probability}%`,
        })),
      },
      all_hours_analysis: analysisResults,
    });
  } catch (error) {
    console.error('Erro ao analisar rota:', error);
    return NextResponse.json(
      { error: 'Erro ao analisar rota', details: String(error) },
      { status: 500 }
    );
  }
}
