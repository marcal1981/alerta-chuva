import { NextRequest, NextResponse } from 'next/server';

interface RoutePoint {
  index: number;
  distance: number;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  estimatedArrivalTime?: string;
  weather?: {
    temp: number;
    precipitation_probability: number;
    willRain: boolean;
  };
}

interface RouteAnalysisResponse {
  origin: string;
  destination: string;
  totalDistance: number;
  totalDuration: number;
  points: RoutePoint[];
  riskAnalysis: {
    safestTimeRange: string;
    highestRiskPeriod: string;
    overallRiskLevel: string;
    rainyPoints: number;
  };
}

// Banco de dados de cidades com coordenadas
const CITIES_DB: { [key: string]: { lat: number; lng: number; state: string } } = {
  'são josé dos campos': { lat: -23.2237, lng: -45.9011, state: 'SP' },
  'sorocaba': { lat: -23.5006, lng: -47.4779, state: 'SP' },
  'itapetininga': { lat: -23.5949, lng: -48.0486, state: 'SP' },
  'ponta grossa': { lat: -25.0955, lng: -50.1596, state: 'PR' },
  'curitiba': { lat: -25.4284, lng: -49.2733, state: 'PR' },
  'ilhabela': { lat: -23.8633, lng: -45.3562, state: 'SP' },
  'campinas': { lat: -22.9068, lng: -47.4616, state: 'SP' },
  'santos': { lat: -23.9608, lng: -46.3304, state: 'SP' },
};

async function fetchOSRMRoute(from: string, to: string) {
  const [fromLat, fromLng] = from.split(',');
  const [toLat, toLng] = to.split(',');

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.routes.length === 0) {
    throw new Error('Nenhuma rota encontrada');
  }

  const route = data.routes[0];
  return {
    distance: route.distance / 1000,
    duration: route.duration,
    geometry: route.geometry,
  };
}

async function getWeatherForecast(lat: number, lng: number) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation_probability,temperature_2m`
    );
    const data = await response.json();

    if (!data.hourly) return null;

    const now = new Date();
    const futureData = data.hourly.time
      .map((time: string, idx: number) => ({
        time,
        temp: data.hourly.temperature_2m[idx],
        precipitation_probability: data.hourly.precipitation_probability[idx],
      }))
      .filter((h: any) => new Date(h.time) > now)
      .slice(0, 48); // Próximas 48 horas

    return futureData;
  } catch (error) {
    console.error('Erro ao buscar previsão:', error);
    return null;
  }
}

function interpolateCoordinates(
  start: [number, number],
  end: [number, number],
  distanceKm: number,
  interval: number = 50 // a cada 50km
): Array<{ lat: number; lng: number; distance: number }> {
  const points: Array<{ lat: number; lng: number; distance: number }> = [];
  const numPoints = Math.floor(distanceKm / interval);

  for (let i = 1; i <= numPoints; i++) {
    const ratio = (i * interval) / distanceKm;
    const lat = start[0] + (end[0] - start[0]) * ratio;
    const lng = start[1] + (end[1] - start[1]) * ratio;
    points.push({
      lat,
      lng,
      distance: i * interval,
    });
  }

  return points;
}

function findNearestCity(
  lat: number,
  lng: number,
  maxDistance: number = 30
): { name: string; state: string } | null {
  let nearest: { name: string; state: string; distance: number } | null = null;

  for (const [cityName, cityData] of Object.entries(CITIES_DB)) {
    const distance = Math.sqrt(Math.pow(lat - cityData.lat, 2) + Math.pow(lng - cityData.lng, 2));
    const distanceKm = distance * 111; // aproximação: 1 grau ≈ 111km

    if (distanceKm < maxDistance && (!nearest || distanceKm < nearest.distance)) {
      nearest = {
        name: cityName.charAt(0).toUpperCase() + cityName.slice(1),
        state: cityData.state,
        distance: distanceKm,
      };
    }
  }

  return nearest;
}

function getWeatherAtTime(
  forecastData: any[],
  estimatedTime: Date
): { temp: number; precipitation_probability: number; willRain: boolean } | null {
  const targetHour = estimatedTime.getHours();
  const targetDate = estimatedTime.toISOString().split('T')[0];

  const weatherPoint = forecastData.find((w: any) => {
    const wDate = w.time.split('T')[0];
    const wHour = new Date(w.time).getHours();
    return wDate === targetDate && wHour === targetHour;
  });

  if (!weatherPoint) return null;

  return {
    temp: weatherPoint.temp,
    precipitation_probability: weatherPoint.precipitation_probability,
    willRain: weatherPoint.precipitation_probability > 30,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const departureTime = searchParams.get('departure_time') || new Date().toISOString();

  if (!from || !to) {
    return NextResponse.json(
      { error: 'from e to são obrigatórios (formato: lat,lng)' },
      { status: 400 }
    );
  }

  try {
    // Obter rota do OSRM
    const route = await fetchOSRMRoute(from, to);
    const [fromLat, fromLng] = from.split(',').map(Number);
    const [toLat, toLng] = to.split(',').map(Number);

    // Interpolar pontos a cada 50km
    const interpolatedPoints = interpolateCoordinates([fromLat, fromLng], [toLat, toLng], route.distance);

    // Buscar previsão do tempo para o ponto de origem
    const originForecast = await getWeatherForecast(fromLat, fromLng);

    // Processar cada ponto
    const analysisPoints: RoutePoint[] = [];
    let rainyPoints = 0;

    const departureDate = new Date(departureTime);
    const averageSpeed = route.distance / (route.duration / 3600); // km/h

    for (let i = 0; i < interpolatedPoints.length; i++) {
      const point = interpolatedPoints[i];

      // Calcular tempo estimado de chegada
      const hoursToPoint = point.distance / averageSpeed;
      const estimatedArrival = new Date(departureDate.getTime() + hoursToPoint * 60 * 60 * 1000);

      // Encontrar cidade mais próxima
      const nearestCity = findNearestCity(point.lat, point.lng);

      // Buscar previsão para este ponto
      let weatherAtPoint = null;
      if (originForecast) {
        weatherAtPoint = getWeatherAtTime(originForecast, estimatedArrival);
      }

      if (weatherAtPoint?.willRain) {
        rainyPoints++;
      }

      analysisPoints.push({
        index: i + 1,
        distance: point.distance,
        latitude: point.lat,
        longitude: point.lng,
        city: nearestCity?.name,
        state: nearestCity?.state,
        estimatedArrivalTime: estimatedArrival.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        weather: weatherAtPoint || undefined,
      });
    }

    // Análise de risco
    let safestTimeRange = '';
    let highestRiskPeriod = '';
    let overallRiskLevel = 'baixo';

    if (originForecast && originForecast.length > 0) {
      const next24h = originForecast.slice(0, 24);
      const dryPeriods = next24h.filter((h: any) => h.precipitation_probability < 30);
      const wetPeriods = next24h.filter((h: any) => h.precipitation_probability > 50);

      if (dryPeriods.length > 0) {
        safestTimeRange = `${new Date(dryPeriods[0].time).getHours()}:00 - ${new Date(dryPeriods[dryPeriods.length - 1].time).getHours()}:00`;
      }

      if (wetPeriods.length > 0) {
        highestRiskPeriod = `${new Date(wetPeriods[0].time).getHours()}:00 - ${new Date(wetPeriods[wetPeriods.length - 1].time).getHours()}:00`;
      }

      const rainPercentage = (rainyPoints / analysisPoints.length) * 100;
      if (rainPercentage === 0) overallRiskLevel = 'baixo';
      else if (rainPercentage < 30) overallRiskLevel = 'moderado';
      else if (rainPercentage < 70) overallRiskLevel = 'alto';
      else overallRiskLevel = 'crítico';
    }

    const response: RouteAnalysisResponse = {
      origin: from,
      destination: to,
      totalDistance: Math.round(route.distance * 10) / 10,
      totalDuration: Math.round(route.duration),
      points: analysisPoints,
      riskAnalysis: {
        safestTimeRange,
        highestRiskPeriod,
        overallRiskLevel,
        rainyPoints,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro na análise de rota:', error);
    return NextResponse.json(
      { error: 'Erro ao analisar rota', details: String(error) },
      { status: 500 }
    );
  }
}
