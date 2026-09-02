import { NextRequest, NextResponse } from 'next/server';

async function fetchOSRM(from: string, to: string) {
  const [fromLat, fromLng] = from.split(',');
  const [toLat, toLng] = to.split(',');

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.routes.length === 0) {
    throw new Error('Nenhuma rota encontrada');
  }

  const route = data.routes[0];

  // Retornar dados reais do OSRM sem aproximações excessivas
  // distance: em km (com 1 casa decimal)
  // duration: em segundos (será convertido em minutos no frontend)
  return {
    distance: Math.round((route.distance / 1000) * 10) / 10, // 1 casa decimal
    duration: Math.round(route.duration), // em segundos
    geometry: route.geometry,
    source: 'OSRM',
  };
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
    const route = await fetchOSRM(from, to);
    return NextResponse.json(route);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao calcular rota', details: String(error) },
      { status: 500 }
    );
  }
}
