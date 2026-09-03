# Plano de Coleta de Dados — Rota Segura

## Objetivo
Validar previsões do app contra observações reais de viagem para calibrar limiares de risco.

## Metodologia

### Para cada viagem, registrar:

```
Data: YYYY-MM-DD
Horário saída: HH:MM
Origem: [cidade, lat, lng]
Destino: [cidade, lat, lng]

Previsão do app:
- Score: [0-100]
- Recomendação: [safeWindow / avoidWindow]
- Hazards previstos: [chuva / pista_molhada / rajada / neblina / frio_molhado]

Observação real (preencher após viagem):
- Chuva? SIM/NÃO
- Intensidade: [garoa / moderada / forte / temporal]
- Duração: [0-180] minutos
- Pista molhada? SIM/NÃO (mesmo sem estar chovendo)
- Visibilidade: [excelente / boa / reduzida / neblina]
- Vento lateral? SIM/NÃO / km/h
- Temperatura: [°C]
- Incidentes? [nenhum / aquaplanagem / queda / desvio de faixa / outro]

Validação:
- Previsão ✅ ou ❌
- Motivo se ❌: [falso positivo / falso negativo / intensidade errada]
```

## Início da coleta

### Fase 1: Primeiras 10 viagens (próximas 2 semanas)
- **Rotas prioritárias**: SJC ↔ Ilhabela (prototipagem), São Paulo ↔ Campinas
- **Objetivo**: Detectar erros óbvios no algoritmo
- **Calibração provisória**: RAIN_BANDS_MM, DANGEROUS_GUST_KMH

### Fase 2: Dados sazonais (1 mês)
- **Expandir rotas**: Adicionar outras travessias de serra, litoral
- **Objetivo**: Padrões por estação, terreno, hora do dia
- **Threshold**: Atingir 30+ viagens

### Fase 3: Validação (2 meses)
- **Curva ROC**: Plotar precisão vs recall por score
- **Falsos positivos**: Quantas vezes dissemos "risco" e estava seco?
- **Falsos negativos**: Quantas vezes perdemos uma chuva forte?

## Limiares a calibrar

```python
# Atual (ponto de partida)
RAIN_BANDS_MM = {
  garoa: 0.1,
  moderada: 0.5,
  forte: 4,
  temporal: 10,
}
DANGEROUS_GUST_KMH = 45
LOW_VISIBILITY_KM = 1
COLD_WET_C = 12
WET_ROAD_LOOKBACK_HOURS = 2
```

**Ajustar com base em:**
- Quantas garoas vocês viram sem problema? Subir para 0.2?
- Rajadas de 35 km/h molham a moto ou é só 45+? Abaixar threshold?
- Quanto tempo leva a pista secar? 2h está certo?

## Entrega dos dados

Criar arquivo `data/observations.json`:
```json
[
  {
    "date": "2026-09-10",
    "departure": "14:30",
    "route": { "from": "SJC", "to": "Ilhabela" },
    "forecast": { "score": 45, "hazards": ["chuva"] },
    "observation": {
      "rained": true,
      "intensity": "moderada",
      "duration_min": 35,
      "wet_road": true,
      "visibility": "reduzida",
      "wind_gust_kmh": 30,
      "temperature": 18,
      "incidents": "nenhum"
    },
    "validation": "✅"
  }
]
```

## Análise após coleta

```bash
python3 scripts/validate_predictions.py data/observations.json
```

Saída esperada:
```
Acurácia: 92%
Falsos positivos: 2
Falsos negativos: 1
Sugestões de recalibração:
  - Abaixar RAIN_BANDS_MM.moderada de 0.5 para 0.3
  - Subir DANGEROUS_GUST_KMH de 45 para 55
```

## Contato/Feedback

- **Problemas previstos não ocorreram?** → Falso positivo (o app é conservador)
- **Chuva forte não prevista?** → Falso negativo (há bug ou previsão ruim)
- **Pista molhada horas depois?** → Validar WET_ROAD_LOOKBACK_HOURS

---

**Começa quando?** Próxima viagem. Leve o app no celular, tire screenshot da previsão, anote observações na volta.
