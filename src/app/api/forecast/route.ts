import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const latitude = searchParams.get('latitude');
  const longitude = searchParams.get('longitude');
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  if (!latitude || !longitude) {
    return NextResponse.json(
      { error: 'latitude e longitude são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation_probability&date=${date}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.hourly) {
      return NextResponse.json(
        { error: 'Sem dados de previsão disponíveis' },
        { status: 404 }
      );
    }

    const hourlyData = data.hourly.time.map((time: string, idx: number) => ({
      time,
      precipitation_probability: data.hourly.precipitation_probability[idx],
      willRain: data.hourly.precipitation_probability[idx] > 30,
    }));

    return NextResponse.json({
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      date,
      hourly: hourlyData,
      nextRainTime: hourlyData.find((h: any) => h.willRain)?.time || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar dados de previsão' },
      { status: 500 }
    );
  }
}
