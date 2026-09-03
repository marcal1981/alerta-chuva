# Estratégia de Evolução: Rota Segura v2.0
## Transformando de "Consultor de Clima" para "Motor de Simulação de Viagem"

---

## Visão Geral

O app atual simula múltiplos horários de saída (correto).
O próximo nível é fazer isso com precisão, granularidade e inteligência de motociclista.

### 3 Eixos de Desenvolvimento

```
EIXO 1: INTELIGÊNCIA DA ROTA
├─ Amostragem inteligente de pontos (P2)
├─ Detectar trechos críticos por altitude
└─ Reduzir intervalo em serra/litoral

EIXO 2: INTELIGÊNCIA METEOROLÓGICA
├─ Risk Score para motociclistas (P3)
├─ Pista molhada (P4)
└─ Vento direcionado + visibilidade

EIXO 3: INTELIGÊNCIA DE DECISÃO
├─ Gráfico Risco × Horário (UI)
├─ Timeline visual da viagem (UI)
├─ Feature "Sair agora"
└─ Confidence score da previsão
```

---

## Fase 1: Smart Waypoint Sampling (P2)

**Objetivo:** Amostragem inteligente de pontos, não 50km fixo

### Mudança de Lógica

**ANTES:**
```
Origem ──[50km]── Ponto ──[50km]── Ponto ──[50km]── Destino
```

**DEPOIS:**
```
Origem ──[40km]── Interior ──[20km]── Transição ──[5km]── Serra ──[5km]── 
Serra ──[10km]── Litoral ──[20km]── Destino
```

### Implementação

1. Extrair elevação da resposta OSRM geometry
2. Detectar mudanças de altitude > 200m em < 10km → zona crítica
3. Detectar tipo de zona (serra, litoral, urbano)
4. Adaptar espaçamento dinamicamente

### Código

```typescript
// Novo tipo
interface SmartWaypoint extends Waypoint {
  zoneType: 'urbano' | 'interior' | 'transicao' | 'serra' | 'litoral';
  elevationM: number;
  urgency: 'normal' | 'critical';
}

// Nova função
function generateSmartWaypoints(
  startCoords, endCoords, distance, geometry
): SmartWaypoint[] {
  // 1. Extrair elevação
  // 2. Detectar mudanças rápidas
  // 3. Classificar trechos
  // 4. Gerar pontos com espaçamento variável
}
```

---

## Fase 2: Risk Score para Motociclistas (P3)

**Objetivo:** Score único que motociclista entende

### Fórmula

```
MOTORCYCLE_RISK = (
  35% × rainRisk(precipitation_mm, probability) +
  20% × intensityRisk(precipitation_mm) +
  15% × roadWetnessRisk(recent_history) +
  15% × gustRisk(wind_gust_kmh) +
  10% × visibilityRisk(visibility_km) +
  5% × temperatureRisk(temp_c, is_wet)
)
```

### Implementação

```typescript
interface SegmentRiskEnhanced extends SegmentRisk {
  rainScore: number;        // 0-100
  intensityScore: number;   // 0-100
  roadWetnessScore: number; // 0-100
  gustScore: number;        // 0-100
  visibilityScore: number;  // 0-100
  temperatureScore: number; // 0-100
  motorcycleRisk: number;   // 0-100 (weighted)
}
```

---

## Fase 3: Road Wetness Detection (P4)

**Objetivo:** Saber como a estrada estará, não apenas se está chovendo agora

### Variáveis

```typescript
ROAD_WETNESS_SCORE = (
  40% × precipitation_last_1h +
  30% × precipitation_last_3h +
  20% × temperature_effect +
  10% × wind_drying_effect
)

// Resultado: 0 (seca) → 4 (crítica)
```

### Lógica

- Se choveu 20mm há 30min → pista molhada (mesmo que não chova agora)
- Se temp > 25°C e sem chuva 2h → pista secando
- Se vento > 30km/h → acelera secagem

---

## Fase 4: UI Redesign (Interface)

### Gráfico 1: Risco × Hora de Saída

```
Risco da Viagem (0-100)
100 ┤        🔴
 80 ┤      🔴   🔴
 60 ┤ 🟡             🟡
 40 ┤
 20 ┤         🟢🟢
  0 └─────────────────────
    06  08  10  12  14
       HORÁRIO DE SAÍDA
```

**Destaque:**
- Melhor horário com badge
- Janela segura (score < 20) em verde
- Janela de risco (score > 55) em vermelho

### Gráfico 2: Timeline da Viagem

```
10:00 São José      🟢 Seguro
10:40 Paraibuna     🟢 Seguro
11:20 Serra         🟡 Neblina (visib. 500m)
12:00 Caraguatatuba 🟢 Seguro
12:40 São Sebastião 🟢 Seguro (pista molhada)
13:10 Ilhabela      🟢 Chegada segura
```

### Feature: "Sair Agora"

```
Botão no header
↓
Pega horário atual
↓
Mostra: "Se sair agora (14:20)"
↓
Exibe timeline + recomendação
↓
"Aguarde 1h30 e risco cai de 48% → 18%"
```

---

## Checklist de Implementação

### Fase 1: Smart Sampling
- [ ] Extrair elevação de OSRM geometry
- [ ] Detectar mudanças de altitude
- [ ] Classificar zonas (serra, litoral, etc)
- [ ] Gerar waypoints com espaçamento variável
- [ ] Testar com SJC → Florianópolis

### Fase 2: Risk Score
- [ ] Implementar rainRisk()
- [ ] Implementar intensityRisk()
- [ ] Implementar gustRisk()
- [ ] Implementar visibilityRisk()
- [ ] Implementar temperatureRisk()
- [ ] Calcular motorcycleRisk como weighted average
- [ ] Atualizar sweepDepartures para usar nova métrica

### Fase 3: Road Wetness
- [ ] Implementar roadWetnessRisk()
- [ ] Considerar precipitação histórica (1h, 3h)
- [ ] Considerar efeito temperatura
- [ ] Considerar efeito vento
- [ ] Integrar ao SegmentRisk

### Fase 4: UI
- [ ] Novo gráfico AreaChart com referências de janelas
- [ ] Timeline com cores por risco
- [ ] Feature "Sair agora"
- [ ] Confidence score da previsão (95% para 6h, 70% para 24h)

---

## Ordem de Execução

1. **Fase 1 (Smart Sampling)** - Melhor base = melhor resultado
2. **Fase 2 (Risk Score)** - Core da inteligência
3. **Fase 3 (Road Wetness)** - Diferencial forte
4. **Fase 4 (UI)** - Visualizar tudo

Cada fase = 1 commit com testes

---

## Como Medir Sucesso

✅ Teste local: SJC → Florianópolis mostra curva de risco diferente dos anteriores
✅ Beta: Usuários conseguem descobrir melhor horário em < 10 segundos
✅ Coleta de dados: Validar predictions vs observações reais (DATA_COLLECTION_PLAN.md)
✅ Confiança: Score de 90%+ em previsões de 6-12h

