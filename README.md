# 🌧️ Alerta Chuva

Aplicação Next.js para previsão de chuva em tempo real usando a API OpenMeteo.

## Características

- 📍 Geolocalização automática
- 🌧️ Previsão de chuva por hora com OpenMeteo API
- 🗺️ Cálculo de rotas com OSRM
- 🎨 Interface responsiva com Tailwind CSS
- ⚡ Desenvolvido com Next.js 14

## APIs

### GET `/api/forecast`

Retorna previsão de chuva horária para uma localização.

**Parâmetros:**
- `latitude` (obrigatório): Latitude da localização
- `longitude` (obrigatório): Longitude da localização
- `date` (opcional): Data no formato YYYY-MM-DD (padrão: hoje)

**Exemplo:**
```bash
curl "http://localhost:3000/api/forecast?latitude=-23.5505&longitude=-46.6333&date=2024-01-01"
```

**Resposta:**
```json
{
  "latitude": -23.5505,
  "longitude": -46.6333,
  "timezone": "America/Sao_Paulo",
  "date": "2024-01-01",
  "nextRainTime": "2024-01-01T14:00",
  "hourly": [
    {
      "time": "2024-01-01T00:00",
      "precipitation_probability": 10,
      "willRain": false
    },
    {
      "time": "2024-01-01T14:00",
      "precipitation_probability": 65,
      "willRain": true
    }
  ]
}
```

### GET `/api/routes`

Calcula rota entre dois pontos usando OSRM.

**Parâmetros:**
- `from` (obrigatório): Ponto de origem no formato `lat,lng`
- `to` (obrigatório): Ponto de destino no formato `lat,lng`

**Exemplo:**
```bash
curl "http://localhost:3000/api/routes?from=-23.5505,-46.6333&to=-23.5900,-46.7000"
```

**Resposta:**
```json
{
  "distance": 5.2,
  "duration": 12,
  "geometry": {...},
  "source": "OSRM"
}
```

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Rodar servidor de desenvolvimento
npm run dev

# Build para produção
npm run build

# Iniciar servidor de produção
npm start
```

## Deploy

### Netlify

1. Conectar repositório GitHub em https://app.netlify.com
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Deploy!

### Vercel

1. Conectar repositório em https://vercel.com
2. Configurações automáticas
3. Deploy!

## Tecnologias

- [Next.js 14](https://nextjs.org/)
- [React 18](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Open-Meteo API](https://open-meteo.com/)
- [OSRM](https://project-osrm.org/)

## Licença

MIT
