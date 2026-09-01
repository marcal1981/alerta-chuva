# 🌧️ Rota Sem Chuva — Arquitetura do Projeto

## 1. Visão Geral

**Objetivo Principal**: Não basta saber se vai chover no destino. O usuário precisa saber **se vai chover no trecho que estará percorrendo naquele horário específico**.

A plataforma calcula automaticamente qual é o **melhor horário para sair** analisando a previsão de chuva para cada local da rota em cada horário do dia.

### Diferencial vs. Aplicações Convencionais

| Convencional | Rota Sem Chuva |
|---|---|
| "Vai chover em Ilhabela?" | "Se eu sair de SJC às 08h, qual chance de pegar chuva até Ilhabela?" |
| Previsão pontual | Previsão ao longo de TODA a rota |
| Mostra um horário | Testa múltiplos horários e recomenda o melhor |
| Usuário decide | Sistema recomenda com base em dados |

---

## 2. Fluxo de Dados Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUÁRIO                                  │
│  Origem | Destino | Data | Período Disponível (06h-18h)        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  API GATEWAY / ORQUESTRADOR    │
        │  Coordena os serviços          │
        └────────────┬───────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┐
        ▼            ▼            ▼              ▼
   ┌─────────┐  ┌────────┐  ┌─────────┐  ┌──────────────┐
   │GEOCODING│  │ ROUTE  │  │ LOCATION│  │   WEATHER    │
   │SERVICE  │  │SERVICE │  │SERVICE  │  │   SERVICE    │
   └────┬────┘  └───┬────┘  └────┬────┘  └──────┬───────┘
        │           │            │              │
        ▼           ▼            ▼              ▼
   Nominatim      OSRM      PostGIS        Open-Meteo
        │           │            │              │
        └────────────┼────────────┴──────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  ROUTE ANALYSIS ENGINE         │
        │                                │
        │ • Geocodificação das cidades   │
        │ • Geometria da rota            │
        │ • Cidades/pontos atravessados  │
        │ • Tempo estimado por trecho    │
        │ • Horário de chegada em c/ pt. │
        │ • Previsão para cada ponto     │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  RISK ENGINE                   │
        │                                │
        │ Cruza:                         │
        │ LOCAL + HORÁRIO + CHUVA        │
        │ ↓                              │
        │ Calcula score de risco         │
        │ para cada horário de saída     │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  RECOMMENDATION ENGINE         │
        │                                │
        │ • Melhor horário               │
        │ • Alternativas                 │
        │ • Horários a evitar            │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │  RESPONSE / UI                 │
        │  Apresenta resultado ao usuário│
        └────────────────────────────────┘
```

---

## 3. Componentes Principais

### 3.1 Geocoding Service
**Responsabilidade**: Converter endereços em coordenadas

**Entrada**: "São José dos Campos"
**Saída**: 
```json
{
  "latitude": -23.2237,
  "longitude": -45.9011,
  "city": "São José dos Campos",
  "state": "SP",
  "country": "Brazil"
}
```

**Provedor**: OpenStreetMap Nominatim (MVP) → Trocar por provedor pago no futuro se necessário

---

### 3.2 Route Service
**Responsabilidade**: Calcular rota entre dois pontos

**Entrada**: 
```json
{
  "from": "-23.2237,-45.9011",
  "to": "-23.7786,-45.3553"
}
```

**Saída**:
```json
{
  "distance_km": 145,
  "duration_minutes": 160,
  "geometry": { /* coordenadas da rota */ },
  "waypoints": [ /* pontos intermediários */ ]
}
```

**Provedor**: OSRM (MVP) → Pode evoluir para OpenRouteService ou Mapbox

---

### 3.3 Location Service
**Responsabilidade**: Identificar cidades/regiões ao longo da rota

**Entrada**: Geometria da rota + coordenadas

**Processo**:
1. Extrair pontos a cada 10-20 km da rota
2. Para cada ponto, descobrir qual município pertence
3. Remover duplicatas
4. Selecionar pontos estratégicos

**Saída**:
```json
{
  "route_points": [
    {
      "km": 0,
      "latitude": -23.2237,
      "longitude": -45.9011,
      "city": "São José dos Campos",
      "state": "SP"
    },
    {
      "km": 30,
      "latitude": -23.3456,
      "longitude": -45.6789,
      "city": "Paraibuna",
      "state": "SP"
    },
    /* ... mais pontos ... */
    {
      "km": 145,
      "latitude": -23.7786,
      "longitude": -45.3553,
      "city": "Ilhabela",
      "state": "SP"
    }
  ]
}
```

**Dados**: PostgreSQL + PostGIS (base de municípios brasileiros)

---

### 3.4 Weather Service
**Responsabilidade**: Consultar previsão horária para cada ponto da rota

**Entrada**: Lista de coordenadas + data

**Para cada coordenada, consulta**:
```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lng}
  &hourly=precipitation_probability,temperature_2m,weathercode
  &date={date}
```

**Saída**:
```json
{
  "points_forecast": [
    {
      "city": "São José dos Campos",
      "hourly": [
        {
          "time": "2026-09-05T08:00",
          "precipitation_probability": 0,
          "temperature": 22,
          "weathercode": 0
        },
        {
          "time": "2026-09-05T09:00",
          "precipitation_probability": 5,
          "temperature": 24,
          "weathercode": 1
        }
      ]
    }
  ]
}
```

---

### 3.5 Route Analysis Engine
**Responsabilidade**: Coordenar a análise da rota

**Processo**:
1. Receber origem, destino, data
2. Geocodificar ambos
3. Calcular rota
4. Identificar cidades/pontos
5. Calcular tempo de passagem em cada ponto
6. Distribuir tempo ao longo dos km (velocidade média)
7. Retornar estrutura: `ponto -> cidade -> horário estimado`

**Saída**:
```json
{
  "route_timeline": [
    {
      "km": 0,
      "city": "São José dos Campos",
      "time_from_start_minutes": 0,
      "estimated_arrival": "2026-09-05T08:00"
    },
    {
      "km": 30,
      "city": "Paraibuna",
      "time_from_start_minutes": 35,
      "estimated_arrival": "2026-09-05T08:35"
    },
    /* ... */
  ]
}
```

---

### 3.6 Risk Engine
**Responsabilidade**: Cruzar LOCAL + HORÁRIO + CHUVA para calcular risco

**Algoritmo**:
```
Para cada horário de saída desejado (ex: 06h, 07h, 08h...):
  score_total = 0
  
  Para cada ponto da rota:
    horário_passagem = horário_saída + tempo_para_chegar_no_ponto
    precipitação = obter_precipitação(ponto, horário_passagem)
    
    Se precipitação > 50%:
      score += 10 (chuva forte)
    Senão se precipitação > 30%:
      score += 5 (chuva moderada)
    Senão se precipitação > 20%:
      score += 3 (probabilidade média)
    Senão se precipitação > 0%:
      score += 1 (pequena chance)
    Senão:
      score += 0 (sem chuva)
  
  Armazenar: {horário_saída, score_total}

Retornar: horários ordenados por score (menor = melhor)
```

**Exemplo Prático**:

**Saída às 08h**:
| Ponto | Horário | Precipitação | Score |
|---|---|---|---|
| SJC | 08:00 | 0% | 0 |
| Paraibuna | 08:35 | 0% | 0 |
| Caraguatatuba | 09:50 | 15% | 1 |
| São Sebastião | 10:20 | 10% | 1 |
| Ilhabela | 10:40 | 0% | 0 |
| **TOTAL** | | | **2** 🟢 |

**Saída às 12h**:
| Ponto | Horário | Precipitação | Score |
|---|---|---|---|
| SJC | 12:00 | 40% | 5 |
| Paraibuna | 12:35 | 55% | 10 |
| Caraguatatuba | 13:50 | 60% | 10 |
| São Sebastião | 14:20 | 70% | 10 |
| Ilhabela | 14:40 | 45% | 5 |
| **TOTAL** | | | **40** 🔴 |

---

### 3.7 Recommendation Engine
**Responsabilidade**: Analisar resultados e recomendar

**Lógica**:
```
1. Ordenar resultados por score (menor primeiro)
2. Primeira opção: menor score
3. Alternativas: próximas 2-3 opções
4. Horários a evitar: acima de threshold (ex: >25)
5. Calcular % de chance de pegar chuva
```

**Saída**:
```json
{
  "recommendation": {
    "best_time": "08:00",
    "risk_level": "baixo",
    "rain_probability": "15%",
    "alternatives": [
      {
        "time": "07:00",
        "risk_level": "moderado",
        "rain_probability": "28%"
      },
      {
        "time": "09:00",
        "risk_level": "moderado",
        "rain_probability": "32%"
      }
    ],
    "times_to_avoid": [
      {
        "time": "12:00",
        "risk_level": "critico",
        "rain_probability": "75%"
      }
    ],
    "detailed_route": [
      {
        "city": "São José dos Campos",
        "time": "08:00",
        "weather": "☀️",
        "precipitation": "0%"
      },
      /* ... */
    ]
  }
}
```

---

## 4. Stack Tecnológico

### Front-end
- **Framework**: Next.js 14
- **UI**: React 18 + Tailwind CSS
- **Gráficos**: Recharts (já implementado)
- **Mapa**: Folium ou Leaflet (futuro)

### Back-end
- **Runtime**: Node.js (Express/Fastify ou Next.js API Routes)
- **Linguagem**: TypeScript
- **Banco de Dados**: PostgreSQL + PostGIS
- **Cache**: Redis (para cachear consultas de previsão)
- **Fila**: Bull/BullMQ (para processar análises em background)

### APIs Externas
- **Geocoding**: OpenStreetMap Nominatim
- **Rotas**: OSRM
- **Clima**: Open-Meteo
- **Dados Geográficos**: PostGIS (base de municípios)

### Deployment
- **Front-end**: Netlify / Vercel
- **Back-end**: Render / Railway / AWS EC2 (MVP)
- **Banco de Dados**: PostgreSQL Managed (Vercel Postgres / AWS RDS)

---

## 5. Roadmap de Implementação

### 🟢 Fase 1 — MVP (Atual → 2 semanas)
**Objetivo**: Versão funcional com análise de cidades principais

- [x] Geocoding simples (hardcoded)
- [x] Cálculo de rota (OSRM)
- [x] Previsão horária (Open-Meteo)
- [x] Visualização com gráfico (Recharts)
- [ ] Risk Engine básico
- [ ] Teste com múltiplos horários
- [ ] UI para mostrar recomendação

**Status Atual**:
- ✅ API de rotas funcionando
- ✅ API de previsão com temperatura funcionando
- ✅ Gráfico de precipitação implementado
- ❌ Risk Engine não simula múltiplos horários
- ❌ Não identifica cidades automaticamente

---

### 🟡 Fase 2 — Análise Geográfica (2-3 semanas)
**Objetivo**: Identificar automaticamente cidades/pontos da rota

- [ ] Integrar PostGIS com base de municípios brasileiros
- [ ] Location Service: extrair pontos a cada 20 km
- [ ] Vincular cada ponto a um município
- [ ] Route Analysis Engine completo
- [ ] Distribuir tempo ao longo da rota

**Entregável**: UI mostra cidades da rota + horário estimado em cada uma

---

### 🟠 Fase 3 — Risk Engine Avançado (2-3 semanas)
**Objetivo**: Simular múltiplos horários de saída

- [ ] Implementar algoritmo de score de risco
- [ ] Testar todos os horários entre 06h e 20h
- [ ] Calcular score para cada horário
- [ ] Recomendar melhor horário
- [ ] Mostrar alternativas e horários a evitar

**Entregável**: "Saia às 08h para menor chance de chuva"

---

### 🔵 Fase 4 — Refinamentos & Performance (1-2 semanas)
**Objetivo**: Cache, otimizações, testes

- [ ] Cache de previsões (Redis)
- [ ] Processamento assíncrono (Bull/BullMQ)
- [ ] Testes unitários & integração
- [ ] Otimização de queries PostGIS
- [ ] Tratamento de erros robusto

---

### 🟣 Fase 5 — Expansão (Futuro)
**Objetivo**: Novos recursos e melhorias

- [ ] Mapa interativo mostrando a rota
- [ ] Histórico de viagens
- [ ] Análise em tempo real (GPS + recalcular)
- [ ] Alertas: "Chuva 20 km à frente"
- [ ] App mobile (React Native)
- [ ] Dashboard de motoristas profissionais
- [ ] Integração com Waze/Google Maps

---

## 6. Banco de Dados — Schema

### Tabelas Principais

#### `routes` (Histórico de rotas analisadas)
```sql
CREATE TABLE routes (
  id UUID PRIMARY KEY,
  origin_lat DECIMAL,
  origin_lng DECIMAL,
  origin_city VARCHAR,
  destination_lat DECIMAL,
  destination_lng DECIMAL,
  destination_city VARCHAR,
  distance_km DECIMAL,
  duration_minutes INT,
  date DATE,
  created_at TIMESTAMP,
  geometry GEOMETRY(LineString, 4326)
);
```

#### `municipalities` (Base de municípios - importar IBGE)
```sql
CREATE TABLE municipalities (
  id INT PRIMARY KEY,
  name VARCHAR UNIQUE,
  state VARCHAR,
  latitude DECIMAL,
  longitude DECIMAL,
  geometry GEOMETRY(Polygon, 4326)
);
```

#### `forecast_cache` (Cache de previsões)
```sql
CREATE TABLE forecast_cache (
  id UUID PRIMARY KEY,
  latitude DECIMAL,
  longitude DECIMAL,
  date DATE,
  hourly_data JSONB,
  fetched_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

#### `route_analysis` (Análise completa de uma rota)
```sql
CREATE TABLE route_analysis (
  id UUID PRIMARY KEY,
  route_id UUID REFERENCES routes(id),
  analysis_date DATE,
  route_points JSONB, -- Lista de cidades + horários
  hourly_scores JSONB, -- {08:00: 2, 09:00: 5, ...}
  recommendation JSONB, -- melhor horário + alternativas
  created_at TIMESTAMP
);
```

---

## 7. Exemplo de Fluxo End-to-End

### Input do Usuário
```json
{
  "origin": "São José dos Campos",
  "destination": "Ilhabela",
  "date": "2026-09-05",
  "available_times": "06:00-18:00"
}
```

### Processamento

**1. Geocoding**
```
São José dos Campos → -23.2237, -45.9011
Ilhabela → -23.7786, -45.3553
```

**2. Rota**
```
Distância: 145 km
Tempo: 160 minutos (2h40)
Geometria: [...coordenadas...]
```

**3. Análise Geográfica**
```
KM 0 → São José dos Campos
KM 30 → Paraibuna
KM 60 → Salesópolis
KM 90 → Caraguatatuba
KM 120 → São Sebastião
KM 145 → Ilhabela
```

**4. Timeline de Saída (se sair às 08h)**
```
08:00 → São José dos Campos
08:35 → Paraibuna
09:10 → Salesópolis
10:00 → Caraguatatuba
10:40 → São Sebastião
11:40 → Ilhabela
```

**5. Previsão para cada ponto naquele horário**
```
08:00 SJC → 0% precipitação
08:35 Paraibuna → 5% precipitação
09:10 Salesópolis → 10% precipitação
10:00 Caraguatatuba → 15% precipitação
10:40 São Sebastião → 8% precipitação
11:40 Ilhabela → 0% precipitação
```

**6. Score de Risco**
```
0 + 1 + 1 + 1 + 1 + 0 = 4 (BAIXO RISCO) 🟢
```

**7. Testar outros horários**
```
06h → Score 3
07h → Score 5
08h → Score 4 ← MELHOR
09h → Score 8
10h → Score 15
11h → Score 22
12h → Score 35
...
```

### Output Final
```json
{
  "recommendation": {
    "best_time": "06:00",
    "risk_level": "baixo",
    "rain_probability": "12%",
    "alternatives": [
      {"time": "07:00", "rain_probability": "18%"},
      {"time": "08:00", "rain_probability": "22%"}
    ],
    "route_details": [
      {
        "city": "São José dos Campos",
        "time": "06:00",
        "weather": "☀️",
        "precipitation": "0%"
      },
      /* ... mais pontos ... */
    ]
  }
}
```

---

## 8. Próximos Passos

1. **Semana 1**: Implementar Risk Engine básico na API
2. **Semana 2**: Integrar PostGIS e base de municípios
3. **Semana 3**: Location Service + Route Analysis
4. **Semana 4**: UI melhorada para mostrar recomendações
5. **Semana 5**: Testes, cache e otimizações

---

## 9. Referências & Documentação

- [OSRM Documentation](http://project-osrm.org/docs/v5.5.1/api/overview/)
- [Open-Meteo API](https://open-meteo.com/en/docs)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [OpenStreetMap Nominatim](https://nominatim.org/release-docs/latest/api/Overview/)
- [Recharts Documentation](https://recharts.org/)

---

**Última atualização**: 2026-09-01
**Status**: Arquitetura definida, MVP iniciado, Fase 1 em progresso
