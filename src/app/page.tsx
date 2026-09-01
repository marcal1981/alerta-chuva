'use client';

import { useState, useEffect } from 'react';

interface ForecastData {
  latitude: number;
  longitude: number;
  date: string;
  nextRainTime: string | null;
  hourly: Array<{
    time: string;
    precipitation_probability: number;
    willRain: boolean;
  }>;
}

export default function Home() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (err) => setError('Erro ao obter localização')
      );
    }
  }, []);

  useEffect(() => {
    if (!location) return;

    const fetchForecast = async () => {
      setLoading(true);
      setError(null);

      try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(
          `/api/forecast?latitude=${location.lat}&longitude=${location.lng}&date=${today}`
        );

        if (!response.ok) throw new Error('Erro na API');

        const data = await response.json();
        setForecast(data);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
  }, [location]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center text-blue-900 mb-8 mt-8">
          🌧️ Alerta Chuva
        </h1>

        {loading && (
          <div className="text-center p-8">
            <p className="text-lg text-gray-600">Carregando previsão...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p>Erro: {error}</p>
          </div>
        )}

        {forecast && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
              Previsão para hoje
            </h2>

            <div className="mb-6 p-4 bg-blue-50 rounded">
              <p className="text-gray-600 mb-2">
                <strong>Localização:</strong> {location?.lat?.toFixed(4)}, {location?.lng?.toFixed(4)}
              </p>
              <p className="text-gray-600">
                <strong>Data:</strong> {new Date(forecast.date).toLocaleDateString('pt-BR')}
              </p>
            </div>

            {forecast.nextRainTime ? (
              <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                <p className="text-yellow-800 font-bold">
                  ⚠️ Chuva esperada às {new Date(forecast.nextRainTime).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-400 rounded">
                <p className="text-green-800 font-bold">✅ Sem chuva prevista hoje</p>
              </div>
            )}

            <h3 className="text-lg font-bold mb-4 text-gray-800">Detalhes por hora</h3>
            <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto">
              {forecast.hourly.map((hour) => (
                <div
                  key={hour.time}
                  className={`p-3 rounded text-center ${
                    hour.willRain
                      ? 'bg-yellow-100 border border-yellow-400'
                      : 'bg-gray-100'
                  }`}
                >
                  <p className="text-xs font-bold text-gray-700">
                    {new Date(hour.time).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-lg font-bold text-blue-600">
                    {hour.precipitation_probability}%
                  </p>
                  {hour.willRain && <p className="text-sm">🌧️</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && !forecast && (
          <div className="text-center p-8">
            <p className="text-gray-600">
              Permitir acesso à localização para ver a previsão
            </p>
          </div>
        )}

        <div className="mt-12 text-center text-gray-600 text-sm">
          <p>Dados fornecidos por Open-Meteo</p>
          <p>Rotas calculadas com OSRM</p>
        </div>
      </div>
    </main>
  );
}
