import { NextRequest, NextResponse } from 'next/server';
import {
  DepartureOption,
  HourlySeries,
  Recommendation,
  Waypoint,
  WaypointForecast,
  recommend,
  sweepDepartures,
} from '@/lib/departureSweep';
import { generateSmartRoutePointsFromGeometry, SmartRoutePoint, GeoJSONGeometry } from '@/lib/smartWaypoints';

interface RouteAnalysisResponse {
  origin: string;
  destination: string;
  totalDistance: number;
  totalDuration: number;
  // Curva de risco × hora de partida
  options: DepartureOption[];
  // Recomendação extraída da curva
  recommendation: Recommendation;
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
  'florianópolis': { lat: -27.5954, lng: -48.5477, state: 'SC' },
  'são paulo': { lat: -23.5505, lng: -46.6333, state: 'SP' },
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

async function getWeatherForecast(lat: number, lng: number): Promise<HourlySeries | null> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,precipitation_probability,temperature_2m,wind_gusts_10m,visibility&timezone=auto`
    );
    const data = await response.json();

    if (!data.hourly) return null;

    // Retorna série completa; quem chamar é responsável por recortar horizonte
    return {
      time: data.hourly.time,
      precipitation: data.hourly.precipitation ?? [],
      precipitationProbability: data.hourly.precipitation_probability ?? [],
      windGusts: data.hourly.wind_gusts_10m ?? [],
      visibility: data.hourly.visibility ?? [],
      temperature: data.hourly.temperature_2m ?? [],
    };
  } catch (error) {
    console.error('Erro ao buscar previsão:', error);
    return null;
  }
}

/**
 * Converte SmartRoutePoint para Waypoint (formato esperado pelo departureSweep)
 */
function smartPointToWaypoint(point: SmartRoutePoint, avgSpeedKmH: number): Waypoint {
  return {
    label: `Km ${point.distanceFromStartKm.toFixed(0)}`,
    lat: point.lat,
    lng: point.lng,
    distanceFromStartKm: point.distanceFromStartKm,
    travelMinutesFromStart: point.etaMinutes,
  };
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

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

    // Gerar pontos inteligentes usando a geometria real do OSRM
    const smartPoints = generateSmartRoutePointsFromGeometry(
      route.geometry as GeoJSONGeometry,
      route.distance
    );

    // Calcular velocidade média para ETA
    const avgSpeedKmH = route.distance / (route.duration / 3600);

    // Converter SmartRoutePoints para Waypoints (compatível com departureSweep)
    const waypoints: Waypoint[] = smartPoints.map((point) => {
      const nearestCity = findNearestCity(point.lat, point.lng);
      return {
        label: nearestCity ? `${nearestCity.name}, ${nearestCity.state}` : `Km ${point.distanceFromStartKm.toFixed(0)}`,
        lat: point.lat,
        lng: point.lng,
        distanceFromStartKm: point.distanceFromStartKm,
        travelMinutesFromStart: point.etaMinutes,
      };
    });

    // Buscar previsão para cada waypoint
    const forecasts: WaypointForecast[] = await Promise.all(
      waypoints.map(async (wp) => {
        const hourly = await getWeatherForecast(wp.lat, wp.lng);
        return {
          waypoint: wp,
          hourly: hourly || emptyHourlySeries(),
        };
      })
    );

    // Varrer horários de partida (próximas 48h, a cada 30 min)
    const now = new Date();
    const options = sweepDepartures(forecasts, {
      from: now,
      horizonHours: 48,
      stepMinutes: 30,
    });

    // Gerar recomendação
    const rec = recommend(options);

    const response: RouteAnalysisResponse = {
      origin: from,
      destination: to,
      totalDistance: Math.round(route.distance * 10) / 10,
      totalDuration: Math.round(route.duration),
      options,
      recommendation: rec,
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

function emptyHourlySeries(): HourlySeries {
  return {
    time: [],
    precipitation: [],
    precipitationProbability: [],
    windGusts: [],
    visibility: [],
    temperature: [],
  };
}
