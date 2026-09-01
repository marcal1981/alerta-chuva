'use client';

import { useState } from 'react';

interface RouteData {
  distance: number;
  duration: number;
  geometry: any;
}

interface ForecastData {
  time: string;
  precipitation_probability: number;
  willRain: boolean;
}

interface RoutePoint {
  name: string;
  temp: number;
  precipitation: number;
  riskLevel: 'baixo' | 'moderado' | 'alto' | 'critico';
}

interface RouteInfo {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  forecast: ForecastData[];
  riskLevel: 'baixo' | 'moderado' | 'alto' | 'critico';
  bestTime: string;
  points: RoutePoint[];
  temp: number;
}

export default function Home() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  const calculateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRouteInfo(null);

    try {
      const originCoords = await geocodeAddress(origin);
      const destCoords = await geocodeAddress(destination);

      const routeRes = await fetch(
        `/api/routes?from=${originCoords}&to=${destCoords}`
      );
      if (!routeRes.ok) throw new Error('Erro ao calcular rota');
      const route: RouteData = await routeRes.json();

      const [lat, lng] = originCoords.split(',');
      const forecastRes = await fetch(
        `/api/forecast?latitude=${lat}&longitude=${lng}`
      );
      if (!forecastRes.ok) throw new Error('Erro ao buscar previsão');
      const forecast = await forecastRes.json();

      // Filtrar apenas horários futuros
      const now = new Date();
      const futureHourly = forecast.hourly.filter((h: ForecastData) => {
        const hourTime = new Date(h.time);
        return hourTime > now;
      });

      if (futureHourly.length === 0) {
        throw new Error('Nenhum horário futuro disponível para análise');
      }

      // Calcular nível de risco
      const rainyHours = futureHourly.filter(
        (h: ForecastData) => h.precipitation_probability > 30
      ).length;
      const totalHours = futureHourly.length;
      const rainPercentage = (rainyHours / totalHours) * 100;

      let riskLevel: 'baixo' | 'moderado' | 'alto' | 'critico';
      if (rainPercentage === 0) riskLevel = 'baixo';
      else if (rainPercentage < 30) riskLevel = 'moderado';
      else if (rainPercentage < 70) riskLevel = 'alto';
      else riskLevel = 'critico';

      // Encontrar melhor horário (sem chuva) - apenas futuros
      const bestHour = futureHourly.find(
        (h: ForecastData) => !h.willRain
      ) || futureHourly[0];

      // Simular pontos da rota
      const points: RoutePoint[] = [
        {
          name: origin,
          temp: 24.5,
          precipitation: 0.0,
          riskLevel: 'baixo',
        },
        {
          name: 'Ponto intermediário',
          temp: 22.3,
          precipitation: 0.5,
          riskLevel: 'moderado',
        },
        {
          name: destination,
          temp: 21.8,
          precipitation: 0.0,
          riskLevel: 'baixo',
        },
      ];

      setRouteInfo({
        origin,
        destination,
        distance: `${(route.distance).toFixed(1)} km`,
        duration: `${route.duration} min`,
        forecast: futureHourly,
        riskLevel,
        bestTime: new Date(bestHour.time).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        points,
        temp: 24.6,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const geocodeAddress = async (address: string): Promise<string> => {
    const examples: { [key: string]: string } = {
      'são paulo': '-23.5505,-46.6333',
      'sjc': '-23.2237,-45.9011',
      'illhabela': '-23.8633,-45.3562',
      'campinas': '-22.9068,-47.4616',
      'sorocaba': '-23.5006,-47.4779',
    };

    const key = address.toLowerCase();
    for (const [city, coords] of Object.entries(examples)) {
      if (key.includes(city)) return coords;
    }

    return '-23.5505,-46.6333';
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'baixo':
        return 'bg-green-100 border-green-400 text-green-800';
      case 'moderado':
        return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      case 'alto':
        return 'bg-orange-100 border-orange-400 text-orange-800';
      case 'critico':
        return 'bg-red-100 border-red-400 text-red-800';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  };

  const getRiskEmoji = (level: string) => {
    switch (level) {
      case 'baixo':
        return '✅';
      case 'moderado':
        return '⚠️';
      case 'alto':
        return '🌧️';
      case 'critico':
        return '🚨';
      default:
        return '❓';
    }
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'baixo':
        return 'bg-green-500 text-white';
      case 'moderado':
        return 'bg-yellow-500 text-black';
      case 'alto':
        return 'bg-orange-500 text-white';
      case 'critico':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 mt-4">
          <h1 className="text-5xl font-bold text-white mb-2">🏍️ Rota Segura</h1>
          <p className="text-gray-400">Análise de clima em tempo real para sua jornada</p>
        </div>

        {/* Formulário de busca */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg shadow-2xl p-6 mb-8 border border-slate-500">
          <form onSubmit={calculateRoute}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-gray-200 mb-2">
                  📍 Ponto de Saída
                </label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Ex: São Paulo"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-200 mb-2">
                  🎯 Ponto de Chegada
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Ex: Ilhabela"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? '⏳ Analisando clima...' : '🔍 Analisar Rota'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Resultado da rota */}
        {routeInfo && (
          <div className="space-y-6">
            {/* Header Principal */}
            <div className={`rounded-lg shadow-2xl p-8 border-l-8 ${getRiskColor(
              routeInfo.riskLevel
            )} bg-opacity-90 bg-slate-700`}>
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {routeInfo.origin} → {routeInfo.destination}
                  </h2>
                  <p className="text-xl text-gray-300 font-semibold">
                    {routeInfo.distance} | ⏱️ {routeInfo.duration}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-6xl mb-2">{getRiskEmoji(routeInfo.riskLevel)}</div>
                  <div className={`px-4 py-2 rounded-full font-bold capitalize text-sm ${getRiskBadgeColor(routeInfo.riskLevel)}`}>
                    Risco {routeInfo.riskLevel}
                  </div>
                </div>
              </div>

              {/* Informações de temperatura e melhor horário */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 bg-opacity-50 rounded p-4 border border-slate-600">
                  <p className="text-gray-400 text-sm">🌡️ Temperatura Atual</p>
                  <p className="text-3xl font-bold text-white">{routeInfo.temp}°C</p>
                </div>
                <div className="bg-slate-800 bg-opacity-50 rounded p-4 border border-slate-600">
                  <p className="text-gray-400 text-sm">⏰ Melhor Horário para Viajar</p>
                  <p className="text-3xl font-bold text-green-400">{routeInfo.bestTime}</p>
                </div>
              </div>
            </div>

            {/* Pontos da rota */}
            <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
              <h3 className="text-2xl font-bold text-white mb-6">📍 Pontos da Rota</h3>
              <div className="space-y-4">
                {routeInfo.points.map((point, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg p-4 border-l-4 ${getRiskColor(point.riskLevel)} bg-opacity-50 bg-slate-800`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-lg">{point.name}</h4>
                        <div className="grid grid-cols-3 gap-4 mt-2">
                          <div>
                            <p className="text-gray-400 text-sm">🌡️ Temperatura</p>
                            <p className="text-white font-bold">{point.temp}°C</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm">💧 Precipitação</p>
                            <p className="text-white font-bold">{point.precipitation}mm</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm">Chance de Chuva</p>
                            <p className="text-white font-bold">0%</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-4 py-2 rounded-full font-bold text-sm ${getRiskBadgeColor(point.riskLevel)}`}>
                          {point.riskLevel === 'baixo' && '✅ Baixo Risco'}
                          {point.riskLevel === 'moderado' && '⚠️ Moderado'}
                          {point.riskLevel === 'alto' && '🌧️ Alto'}
                          {point.riskLevel === 'critico' && '🚨 Crítico'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Previsão por hora */}
            <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
              <h3 className="text-2xl font-bold text-white mb-6">📊 Previsão por Hora (Próximas 24h)</h3>
              <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2 max-h-48 overflow-y-auto">
                {routeInfo.forecast.map((hour, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded text-center text-xs ${
                      hour.willRain
                        ? 'bg-red-900 border-2 border-red-500 text-red-100'
                        : 'bg-green-900 border-2 border-green-600 text-green-100'
                    }`}
                  >
                    <p className="font-bold mb-1">
                      {new Date(hour.time).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-base font-bold">{hour.precipitation_probability}%</p>
                    <p className="text-lg">{hour.willRain ? '🌧️' : '☀️'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Legenda */}
            <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
              <h3 className="text-xl font-bold text-white mb-4">📋 Legenda de Risco</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-900 rounded p-4 text-center border border-green-600">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="font-bold text-green-300">Baixo Risco</p>
                  <p className="text-xs text-green-200">Sem chuva</p>
                </div>
                <div className="bg-yellow-900 rounded p-4 text-center border border-yellow-600">
                  <p className="text-3xl mb-2">⚠️</p>
                  <p className="font-bold text-yellow-300">Moderado</p>
                  <p className="text-xs text-yellow-200">Chuva parcial</p>
                </div>
                <div className="bg-orange-900 rounded p-4 text-center border border-orange-600">
                  <p className="text-3xl mb-2">🌧️</p>
                  <p className="font-bold text-orange-300">Alto Risco</p>
                  <p className="text-xs text-orange-200">Muita chuva</p>
                </div>
                <div className="bg-red-900 rounded p-4 text-center border border-red-600">
                  <p className="text-3xl mb-2">🚨</p>
                  <p className="font-bold text-red-300">Crítico</p>
                  <p className="text-xs text-red-200">Não recomendado</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>📍 Dados de previsão: Open-Meteo | 🗺️ Rotas: OSRM</p>
        </div>
      </div>
    </main>
  );
}
