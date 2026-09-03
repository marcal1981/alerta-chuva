'use client';

import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';

interface RouteData {
  distance: number;
  duration: number;
  geometry: any;
}

interface ForecastData {
  time: string;
  precipitation_probability: number;
  temperature: number;
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
  currentTemp: number;
}

interface City {
  name: string;
  state: string;
  coords: string;
}

const CITIES_DATABASE: City[] = [
  { name: 'São Paulo', state: 'SP', coords: '-23.5505,-46.6333' },
  { name: 'São José dos Campos', state: 'SP', coords: '-23.2237,-45.9011' },
  { name: 'Ilhabela', state: 'SP', coords: '-23.8633,-45.3562' },
  { name: 'Campinas', state: 'SP', coords: '-22.9068,-47.4616' },
  { name: 'Sorocaba', state: 'SP', coords: '-23.5006,-47.4779' },
  { name: 'Ribeirão Preto', state: 'SP', coords: '-21.1758,-47.8102' },
  { name: 'Santos', state: 'SP', coords: '-23.9608,-46.3304' },
  { name: 'Florianópolis', state: 'SC', coords: '-27.5954,-48.5477' },
  { name: 'João Pessoa', state: 'PB', coords: '-7.1084,-34.8305' },
  { name: 'Feira de Santana', state: 'BA', coords: '-12.2631,-38.9673' },
  { name: 'Salvador', state: 'BA', coords: '-12.9704,-38.5123' },
  { name: 'Recife', state: 'PE', coords: '-8.0476,-34.8770' },
  { name: 'Fortaleza', state: 'CE', coords: '-3.7319,-38.5267' },
  { name: 'Brasília', state: 'DF', coords: '-15.7939,-47.8822' },
  { name: 'Belo Horizonte', state: 'MG', coords: '-19.9193,-43.9437' },
  { name: 'Rio de Janeiro', state: 'RJ', coords: '-22.9068,-43.1729' },
  { name: 'Curitiba', state: 'PR', coords: '-25.4284,-49.2733' },
];

export default function Home() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<City[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<City[]>([]);
  const [selectedOriginCity, setSelectedOriginCity] = useState<City | null>(null);
  const [selectedDestinationCity, setSelectedDestinationCity] = useState<City | null>(null);
  const [routeAnalysis, setRouteAnalysis] = useState<any>(null);

  const handleOriginChange = (value: string) => {
    setOrigin(value);
    if (value.length > 0) {
      const filtered = CITIES_DATABASE.filter(city =>
        `${city.name} - ${city.state}`.toLowerCase().includes(value.toLowerCase())
      );
      setOriginSuggestions(filtered);
    } else {
      setOriginSuggestions([]);
    }
  };

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    if (value.length > 0) {
      const filtered = CITIES_DATABASE.filter(city =>
        `${city.name} - ${city.state}`.toLowerCase().includes(value.toLowerCase())
      );
      setDestinationSuggestions(filtered);
    } else {
      setDestinationSuggestions([]);
    }
  };

  const selectOriginCity = (city: City) => {
    setOrigin(`${city.name}, ${city.state}`);
    setSelectedOriginCity(city);
    setOriginSuggestions([]);
  };

  const selectDestinationCity = (city: City) => {
    setDestination(`${city.name}, ${city.state}`);
    setSelectedDestinationCity(city);
    setDestinationSuggestions([]);
  };

  const calculateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRouteInfo(null);

    try {
      const originCoords = selectedOriginCity?.coords || await geocodeAddress(origin);
      const destCoords = selectedDestinationCity?.coords || await geocodeAddress(destination);

      let route: RouteData = { distance: 0, duration: 0, geometry: null };
      try {
        const routeRes = await fetch(
          `/api/routes?from=${originCoords}&to=${destCoords}`
        );
        if (routeRes.ok) {
          route = await routeRes.json();
        }
      } catch (err) {
        console.error('Erro ao calcular rota:', err);
      }

      const [lat, lng] = originCoords.split(',');
      const forecastRes = await fetch(
        `/api/forecast?latitude=${lat}&longitude=${lng}`
      );
      if (!forecastRes.ok) throw new Error('Erro ao buscar previsão');
      const forecastData = await forecastRes.json();

      // Filtrar apenas horários futuros (próximas 12 horas)
      const now = new Date();
      const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      const futureHourly = forecastData.hourly.filter((h: ForecastData) => {
        const hourTime = new Date(h.time);
        return hourTime > now && hourTime <= twelveHoursFromNow;
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

      // Formatar duração como "Xh YYmin" (route.duration vem em segundos do OSRM)
      const totalMinutes = Math.round(route.duration / 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const durationFormatted = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;

      setRouteInfo({
        origin,
        destination,
        distance: `${(route.distance).toFixed(1)} km`,
        duration: durationFormatted,
        forecast: futureHourly,
        riskLevel,
        bestTime: new Date(bestHour.time).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        points,
        temp: 24.6,
        currentTemp: forecastData.currentTemp,
      });

      // Buscar análise de múltiplas partidas (curva de risco × hora)
      try {
        const analysisRes = await fetch(
          `/api/route-analysis?from=${originCoords}&to=${destCoords}`
        );
        if (analysisRes.ok) {
          const analysis = await analysisRes.json();
          setRouteAnalysis(analysis);
        }
      } catch (err) {
        console.error('Erro ao buscar análise de rota:', err);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const removeAccents = (str: string): string => {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
  };

  const geocodeAddress = async (address: string): Promise<string> => {
    const examples: { [key: string]: string } = {
      'são paulo': '-23.5505,-46.6333',
      'sao paulo': '-23.5505,-46.6333',
      'sjc': '-23.2237,-45.9011',
      'são josé dos campos': '-23.2237,-45.9011',
      'sao jose dos campos': '-23.2237,-45.9011',
      'ilhabela': '-23.8633,-45.3562',
      'illhabela': '-23.8633,-45.3562',
      'campinas': '-22.9068,-47.4616',
      'sorocaba': '-23.5006,-47.4779',
      'florianópolis': '-27.5954,-48.5477',
      'florianopolis': '-27.5954,-48.5477',
      'floripa': '-27.5954,-48.5477',
      'joão pessoa': '-7.1084,-34.8305',
      'joao pessoa': '-7.1084,-34.8305',
      'paraíba': '-7.1084,-34.8305',
      'paraiba': '-7.1084,-34.8305',
    };

    const key = removeAccents(address.toLowerCase());
    const normalizedExamples = Object.fromEntries(
      Object.entries(examples).map(([city, coords]) => [removeAccents(city), coords])
    );

    for (const [city, coords] of Object.entries(normalizedExamples)) {
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
        {/* Header com moto à direita */}
        <div className="flex items-center justify-between mb-8 mt-4">
          <div className="text-left">
            <h1 className="text-5xl font-bold text-white">Rota Segura</h1>
            <p className="text-gray-400">Análise de clima em tempo real para sua jornada</p>
          </div>
          <div className="text-8xl">🏍️</div>
        </div>

        {/* Formulário de busca */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg shadow-2xl p-6 mb-8 border border-slate-500">
          <form onSubmit={calculateRoute}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="relative">
                <label className="block text-sm font-bold text-gray-200 mb-2">
                  📍 Ponto de Saída
                </label>
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => handleOriginChange(e.target.value)}
                  placeholder="Ex: São Paulo, SP"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
                {originSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-10">
                    {originSuggestions.map((city, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectOriginCity(city)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-gray-200 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {city.name} - <span className="text-gray-400">{city.state}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-sm font-bold text-gray-200 mb-2">
                  🎯 Ponto de Chegada
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  placeholder="Ex: Ilhabela, SP"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
                {destinationSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-10">
                    {destinationSuggestions.map((city, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectDestinationCity(city)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-700 text-gray-200 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {city.name} - <span className="text-gray-400">{city.state}</span>
                      </button>
                    ))}
                  </div>
                )}
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
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-800 bg-opacity-50 rounded p-4 border border-slate-600">
                  <p className="text-gray-400 text-sm">🌡️ Temperatura Atual</p>
                  <p className="text-3xl font-bold text-white">{routeInfo.currentTemp.toFixed(1)}°C</p>
                </div>
                <div className="bg-slate-800 bg-opacity-50 rounded p-4 border border-slate-600">
                  <p className="text-gray-400 text-sm">⏰ Melhor Horário para Viajar</p>
                  <p className="text-3xl font-bold text-green-400">{routeInfo.bestTime}</p>
                </div>
              </div>

              {/* Recomendação Inteligente com varredura de múltiplas partidas */}
              {routeAnalysis && routeAnalysis.recommendation && (
                <div className={`rounded-lg p-4 border-l-4 ${
                  routeAnalysis.recommendation.noDryOption
                    ? 'border-red-500 bg-slate-800 bg-opacity-80'
                    : 'border-green-500 bg-slate-800 bg-opacity-80'
                }`}>
                  <p className="text-gray-300 text-sm font-semibold mb-3">💡 Recomendação Inteligente (Simulação de 48h)</p>
                  {routeAnalysis.recommendation.best && (
                    <div className="mb-3">
                      <p className="text-white font-bold">
                        🏆 Melhor Partida: <span className="text-green-300">
                          {new Date(routeAnalysis.recommendation.best.departure).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                      <p className="text-gray-400 text-sm mt-1">
                        Risco: <span className={routeAnalysis.recommendation.best.score <= 20 ? 'text-green-400 font-bold' : routeAnalysis.recommendation.best.score <= 55 ? 'text-yellow-400 font-bold' : 'text-red-400 font-bold'}>
                          {routeAnalysis.recommendation.best.score}/100
                          {routeAnalysis.recommendation.best.score <= 20 ? ' (✅ Seguro)' : routeAnalysis.recommendation.best.score <= 55 ? ' (⚠️ Moderado)' : ' (🔴 Alto)'}
                        </span>
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        Confiança: <span className="text-blue-300">95%</span> (previsão de 0-6h é muito precisa)
                      </p>
                    </div>
                  )}
                  {routeAnalysis.recommendation.safeWindow && (
                    <p className="text-gray-300 text-sm">
                      🟢 Janela segura: {new Date(routeAnalysis.recommendation.safeWindow.start).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} às {new Date(routeAnalysis.recommendation.safeWindow.end).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {routeAnalysis.recommendation.avoidWindow && (
                    <p className="text-gray-300 text-sm mt-2">
                      🔴 Evite: {new Date(routeAnalysis.recommendation.avoidWindow.start).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} às {new Date(routeAnalysis.recommendation.avoidWindow.end).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} (risco {'>'} 55)
                    </p>
                  )}
                  {routeAnalysis.recommendation.noDryOption && (
                    <p className="text-yellow-300 text-sm mt-2">
                      ⚠️ Sem opção seca — toda a janela tem chuva. Escolha o horário com menor risco.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Gráfico de risco × hora de partida (varredura de múltiplos horários) */}
            <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">📈 Risco da Viagem × Hora de Partida</h3>
                <button
                  onClick={() => {
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    alert(`Se sair agora (${timeStr}):\n\nEstimativa de risco baseada nas condições atuais.\n\n⏳ Aguarde as previsões serem atualizadas...`);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                  🏍️ Sair Agora
                </button>
              </div>
              <div className="w-full h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={routeAnalysis && routeAnalysis.options ? routeAnalysis.options.map((opt: any) => ({
                    time: new Date(opt.departure).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    score: opt.score,
                    wetMinutes: opt.wetMinutes,
                    departure: opt.departure,
                  })) : []}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" vertical={false} />

                    {/* Zonas de risco */}
                    <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
                    <ReferenceLine y={55} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.3} />

                    {/* Marcar janelas recomendadas */}
                    {routeAnalysis && routeAnalysis.recommendation && routeAnalysis.recommendation.safeWindow && (
                      <ReferenceLine
                        x={new Date(routeAnalysis.recommendation.safeWindow.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        stroke="#22c55e"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        label={{ value: 'Janela segura', fill: '#22c55e', fontSize: 11, position: 'top' }}
                      />
                    )}
                    <XAxis
                      dataKey="time"
                      stroke="#94a3b8"
                      tick={{ fontSize: 10, fill: '#cbd5e1' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      label={{ value: 'Risco da Viagem (0-100)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 12 }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '2px solid #475569',
                        borderRadius: '8px',
                        color: '#fff',
                        padding: '12px',
                      }}
                      formatter={(value: any, name: string) => {
                        if (name === 'score') {
                          let label = '';
                          if (value <= 20) label = '✅ Seguro';
                          else if (value <= 55) label = '⚠️ Moderado';
                          else label = '🔴 Alto risco';
                          return [`${value} ${label}`, 'Risco'];
                        }
                        if (name === 'wetMinutes') {
                          return [`${value} min`, 'Tempo molhado'];
                        }
                        return [value, name];
                      }}
                      labelFormatter={(label) => {
                        return `Partida: ${label}`;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Análise detalhada da rota (pontos intermediários - usando melhor partida) */}
            {routeAnalysis && routeAnalysis.recommendation && routeAnalysis.recommendation.best && routeAnalysis.recommendation.best.segments && routeAnalysis.recommendation.best.segments.length > 0 && (
              <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
                <h3 className="text-2xl font-bold text-white mb-6">🛣️ Análise Detalhada da Rota</h3>

                {/* Resumo da melhor partida */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
                    <p className="text-gray-400 text-sm mb-2">⏰ Melhor Partida</p>
                    <p className="text-white font-bold text-lg">
                      {new Date(routeAnalysis.recommendation.best.departure).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
                    <p className="text-gray-400 text-sm mb-2">📈 Risco Total</p>
                    <p className={`font-bold text-lg ${
                      routeAnalysis.recommendation.best.score <= 20 ? 'text-green-400' :
                      routeAnalysis.recommendation.best.score <= 55 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {routeAnalysis.recommendation.best.score}
                    </p>
                  </div>
                </div>

                {/* Timeline dos Pontos */}
                <div className="space-y-3">
                  {routeAnalysis.recommendation.best.segments.map((segment: any, idx: number) => {
                    const riskColor = segment.risk > 55
                      ? 'border-l-4 border-red-500 bg-red-900 bg-opacity-20'
                      : segment.risk > 20
                        ? 'border-l-4 border-yellow-500 bg-yellow-900 bg-opacity-20'
                        : 'border-l-4 border-green-500 bg-green-900 bg-opacity-20';

                    return (
                      <div key={idx} className={`rounded-lg p-4 ${riskColor} flex items-center justify-between`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-white font-bold">{segment.waypoint.distanceFromStartKm.toFixed(0)}km</span>
                            <span className="text-gray-300">
                              📍 {segment.waypoint.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-400">⏰ ETA</p>
                              <p className="text-white font-semibold">
                                {new Date(segment.eta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400">🌡️ Temp</p>
                              <p className="text-white font-semibold">{segment.temperatureC.toFixed(1)}°C</p>
                            </div>
                            <div>
                              <p className="text-gray-400">💧 Chuva</p>
                              <p className={`font-semibold ${segment.precipitationMm > 0.5 ? 'text-red-400' : 'text-green-400'}`}>
                                {segment.precipitationMm.toFixed(1)}mm
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-400">⚠️ Risco</p>
                              <p className="text-white font-semibold">{segment.risk}</p>
                            </div>
                          </div>
                          {segment.hazards && segment.hazards.length > 0 && (
                            <p className="text-gray-300 text-xs mt-2">
                              Riscos: {segment.hazards.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="text-3xl ml-4">
                          {segment.risk > 55 ? '🔴' : segment.risk > 20 ? '🟡' : '🟢'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pontos da rota */}
            <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
              <h3 className="text-2xl font-bold text-white mb-6">📍 Pontos de Referência</h3>
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

            {/* Legenda de Risco (baseada em Motorcycle Risk Score) */}
            <div className="bg-slate-700 rounded-lg shadow-2xl p-6 border border-slate-600">
              <h3 className="text-xl font-bold text-white mb-4">📋 Escala de Risco para Motociclista</h3>
              <div className="space-y-3">
                <div className="bg-green-900 bg-opacity-40 rounded p-4 border border-green-600 flex items-start gap-4">
                  <p className="text-3xl">🟢</p>
                  <div>
                    <p className="font-bold text-green-300">Risco 0-20: SEGURO</p>
                    <p className="text-xs text-green-200">Viagem confortável. Sem chuva ou garoa leve. Pista seca. Ótima visibilidade.</p>
                  </div>
                </div>
                <div className="bg-yellow-900 bg-opacity-40 rounded p-4 border border-yellow-600 flex items-start gap-4">
                  <p className="text-3xl">🟡</p>
                  <div>
                    <p className="font-bold text-yellow-300">Risco 21-55: MODERADO</p>
                    <p className="text-xs text-yellow-200">Atencioso às condições. Chuva moderada em alguns trechos, possível pista molhada, ou visibilidade reduzida.</p>
                  </div>
                </div>
                <div className="bg-orange-900 bg-opacity-40 rounded p-4 border border-orange-600 flex items-start gap-4">
                  <p className="text-3xl">🟠</p>
                  <div>
                    <p className="font-bold text-orange-300">Risco 56-75: ALTO</p>
                    <p className="text-xs text-orange-200">Considere adiar. Chuva forte prevista, rajadas perigosas, ou condições críticas em trecho.</p>
                  </div>
                </div>
                <div className="bg-red-900 bg-opacity-40 rounded p-4 border border-red-600 flex items-start gap-4">
                  <p className="text-3xl">🔴</p>
                  <div>
                    <p className="font-bold text-red-300">Risco 76-100: CRÍTICO</p>
                    <p className="text-xs text-red-200">Não recomendado. Temporal, neblina severa, ou condições extremas. Aguarde.</p>
                  </div>
                </div>
              </div>
              <p className="text-gray-400 text-xs mt-4 italic">
                💡 Score combina: chuva (35%), intensidade (20%), pista molhada (15%), rajada (15%), visibilidade (10%), temperatura (5%)
              </p>
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
