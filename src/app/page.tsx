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

interface RouteInfo {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  forecast: ForecastData[];
  riskLevel: 'baixo' | 'moderado' | 'alto' | 'critico';
  bestTime: string;
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
      // Exemplo: converter endereço em coordenadas (simplificado)
      // Para produção, usar Nominatim ou similar
      const originCoords = await geocodeAddress(origin);
      const destCoords = await geocodeAddress(destination);

      // Buscar rota
      const routeRes = await fetch(
        `/api/routes?from=${originCoords}&to=${destCoords}`
      );
      if (!routeRes.ok) throw new Error('Erro ao calcular rota');
      const route: RouteData = await routeRes.json();

      // Buscar previsão de chuva para o local de origem
      const [lat, lng] = originCoords.split(',');
      const forecastRes = await fetch(
        `/api/forecast?latitude=${lat}&longitude=${lng}`
      );
      if (!forecastRes.ok) throw new Error('Erro ao buscar previsão');
      const forecast = await forecastRes.json();

      // Calcular nível de risco
      const rainyHours = forecast.hourly.filter(
        (h: ForecastData) => h.precipitation_probability > 30
      ).length;
      const totalHours = forecast.hourly.length;
      const rainPercentage = (rainyHours / totalHours) * 100;

      let riskLevel: 'baixo' | 'moderado' | 'alto' | 'critico';
      if (rainPercentage === 0) riskLevel = 'baixo';
      else if (rainPercentage < 30) riskLevel = 'moderado';
      else if (rainPercentage < 70) riskLevel = 'alto';
      else riskLevel = 'critico';

      // Encontrar melhor horário (sem chuva)
      const bestHour = forecast.hourly.find(
        (h: ForecastData) => !h.willRain
      ) || forecast.hourly[0];

      setRouteInfo({
        origin,
        destination,
        distance: `${(route.distance).toFixed(1)} km`,
        duration: `${route.duration} min`,
        forecast: forecast.hourly,
        riskLevel,
        bestTime: new Date(bestHour.time).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const geocodeAddress = async (address: string): Promise<string> => {
    // Geocoding simplificado (usar Nominatim em produção)
    const examples: { [key: string]: string } = {
      'são paulo': '-23.5505,-46.6333',
      'sjc': '-23.2237,-45.9011',
      'illhabela': '-23.8633,-45.3562',
      'campinas': '-22.9068,-47.0616',
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8 mt-8">
          <h1 className="text-5xl font-bold text-blue-900 mb-2">🚗 Rota Segura</h1>
          <p className="text-gray-600">Previsão de chuva para sua rota</p>
        </div>

        {/* Formulário de busca */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <form onSubmit={calculateRoute}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📍 Ponto de Saída
                </label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Ex: São Paulo"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎯 Ponto de Chegada
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Ex: Ilhabela"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Calculando rota...' : 'Buscar Rota'}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              Erro: {error}
            </div>
          )}
        </div>

        {/* Resultado da rota */}
        {routeInfo && (
          <div className="space-y-6">
            {/* Header com informações principais */}
            <div
              className={`rounded-lg shadow-lg p-6 border-l-4 ${getRiskColor(
                routeInfo.riskLevel
              )}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {routeInfo.origin} → {routeInfo.destination}
                  </h2>
                  <p className="text-lg font-semibold">
                    {routeInfo.distance} | {routeInfo.duration}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold">{getRiskEmoji(routeInfo.riskLevel)}</p>
                  <p className="text-sm font-bold capitalize">
                    Risco {routeInfo.riskLevel}
                  </p>
                </div>
              </div>

              <div className="bg-white bg-opacity-50 rounded p-4">
                <p className="font-semibold text-sm">
                  ⏰ Melhor horário: <span className="text-lg">{routeInfo.bestTime}</span>
                </p>
              </div>
            </div>

            {/* Previsão por hora */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800">
                📊 Previsão por Hora
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-96 overflow-y-auto">
                {routeInfo.forecast.map((hour, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded text-center ${
                      hour.willRain
                        ? 'bg-yellow-100 border-2 border-yellow-400'
                        : 'bg-gray-100 border border-gray-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-gray-700">
                      {new Date(hour.time).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-lg font-bold text-blue-600 my-1">
                      {hour.precipitation_probability}%
                    </p>
                    {hour.willRain && <p className="text-sm">🌧️</p>}
                    {!hour.willRain && <p className="text-sm">☀️</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Legenda de risco */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Legenda de Risco</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 border-2 border-green-400 rounded p-3 text-center">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="font-bold text-green-800 text-sm">Baixo Risco</p>
                  <p className="text-xs text-green-700">Sem chuva</p>
                </div>
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded p-3 text-center">
                  <p className="text-2xl mb-1">⚠️</p>
                  <p className="font-bold text-yellow-800 text-sm">Moderado</p>
                  <p className="text-xs text-yellow-700">Chuva parcial</p>
                </div>
                <div className="bg-orange-50 border-2 border-orange-400 rounded p-3 text-center">
                  <p className="text-2xl mb-1">🌧️</p>
                  <p className="font-bold text-orange-800 text-sm">Alto Risco</p>
                  <p className="text-xs text-orange-700">Muita chuva</p>
                </div>
                <div className="bg-red-50 border-2 border-red-400 rounded p-3 text-center">
                  <p className="text-2xl mb-1">🚨</p>
                  <p className="font-bold text-red-800 text-sm">Crítico</p>
                  <p className="text-xs text-red-700">Não recomendado</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="mt-12 text-center text-gray-600 text-sm">
          <p>📍 Dados de previsão: Open-Meteo</p>
          <p>🗺️ Rotas calculadas com: OSRM</p>
        </div>
      </div>
    </main>
  );
}
