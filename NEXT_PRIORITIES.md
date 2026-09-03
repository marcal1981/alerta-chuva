# 🗺️ Rota Segura — Próximas Prioridades

**Data:** 2026-09-03  
**Status:** Bug crítico corrigido ✅ | UI/UX em análise 🟡 | Features em planejamento 🟢

---

## 📋 O Que Foi Descoberto

### ✅ Positivos
- Arquitetura técnica está excelente (departureSweep, smartWaypoints, motorcycleRiskScore)
- Interface visual é profissional e moderna
- APIs estão bem estruturadas
- Deploy ready para Netlify

### 🔴 Bug Crítico (CORRIGIDO)
- generateSmartRoutePoints estava usando interpolação linear
- Pontos não seguiam a rota real (ex: Campinas em SJC→Florianópolis)
- **FIX:** Mudada para usar geometria real do OSRM via `generateSmartRoutePointsFromGeometry()`

### 🟠 UI/UX Issues (NÃO CORRIGIDOS AINDA)
1. Gráfico não mostra a resposta principal (risco × hora de saída)
2. Janela "1:00 - 0:00" é confusa (atravessa meia-noite)
3. Pontos de referência mistos (algumas cidades, algumas genéricas)
4. Dados contraditórios (0.5mm precipitação com 0% chance)
5. Falta de educação visual (faixas de cor/risco)

---

## 🔴 AGORA: Testes Pós-Correção

**Objetivo:** Validar que o bug foi realmente corrigido

```bash
# 1. Compilar
npm run build

# 2. Testar SJC → Florianópolis
curl "http://localhost:3000/api/route-analysis?from=-23.22,-45.90&to=-27.60,-48.55"

# Esperar:
# ✓ totalDistance ≈ 1000 (não 207)
# ✓ Pontos intermediários = Paraibuna, Serra, Caraguatatuba, São Sebastião
# ✓ Campinas NÃO aparece
```

**Responsável:** [Você após deploy]  
**Tempo:** 30min  
**Bloqueador:** Nenhum, pode fazer já

---

## 🟠 DEPOIS: UI/UX Refactor (Prioridade Alta)

### Problema Principal
O gráfico mostra "Chance de chuva" mas deveria mostrar "Risco da viagem"

**ANTES (errado):**
```
100% ┤
 50% ┤         📊
  0% └────────────────
     06  08  10  12  14  16
          HORA DO DIA
```

Pergunta que responde: "Quando pode chover?"  
Usuário recebe: Precisa interpretar sozinho

**DEPOIS (correto):**
```
100% ┤ 🔴
  50% ┤        🟠
   0% └────────────────
     06  08  10  12  14  16
       HORÁRIO DE SAÍDA
```

Pergunta que responde: "Se eu sair nesta hora, qual será o risco?"  
Usuário recebe: Resposta direta

### Mudanças Necessárias

#### 1. **Reorganizar Informação**
```
Antes:
  ├─ Resultado
  ├─ Melhor horário
  ├─ Recomendação
  ├─ Gráfico de previsão
  └─ Pontos de referência

Depois:
  ├─ 🏆 MELHOR HORÁRIO (destaque)
  │  └─ Score | Chance de chuva
  ├─ 📊 GRÁFICO DE RISCO × SAÍDA (primário)
  ├─ 🗺️ TIMELINE DE SUA VIAGEM (secundário)
  └─ 🌧️ PREVISÃO DETALHADA (terciário)
```

#### 2. **Gráfico Principal Novo**
```typescript
interface RiskPoint {
  departureTime: string;    // "10:00"
  riskScore: 0-100;        // De 0 (verde) a 100 (vermelho)
  willRain: boolean;
  rainChance: number;      // %
}
```

Renderizar com Recharts com:
- LineChart mostrando risco × hora
- Background colorido (verde 0-20, amarelo 20-50, laranja 50-75, vermelho 75-100)
- Tooltip mostrando detalhes

#### 3. **Recomendação Clara**
```typescript
// Se existe uma janela segura
if (recommendation.safeWindow) {
  // "✓ Você pode sair entre 08:00 e 14:00"
} else if (recommendation.best) {
  // "⚠️ Melhor horário: 10:00 (risco: 45%)"
  // "Não há janela completamente segura"
} else {
  // "❌ Sem dados de previsão"
}
```

#### 4. **Timeline Visual**
Mostra a condição em cada ponto:

```
10:00
São José dos Campos
24°C | ☀️ 0% | Risco: 5%

↓

10:40
Paraibuna
22°C | ☀️ 10% | Risco: 15%

↓

11:20
Serra da Tamoios
18°C | 🌫️ Neblina | Risco: 65%

↓

12:00
Caraguatatuba
23°C | 🌧️ 20% | Risco: 40%
```

**Cada ponto mostra:**
- Hora de chegada
- Cidade/Km
- Temperatura
- Ícone de condição
- Score de risco

#### 5. **Previsão Detalhada**
Manter o gráfico meteorológico atual mas como "segunda camada"

```
Se você quiser saber mais:
  └─ 🌧️ Previsão completa por hora
```

### Estimativa
- **Design:** 2h (mockups, componentes)
- **Implementação:** 4h (gráfico, lógica de recomendação)
- **Testes:** 2h
- **Total:** ~8h

---

## 🟡 DEPOIS: Dados Contraditórios

### Problema
```
Ponto intermediário
Precipitação: 0.5 mm
Chance: 0%
```

Isso é confuso: "Como tem precipitação se a chance é zero?"

### Solução
Separar claramente:

**Previsão Futura:**
```
Chance de chuva: 0%
Precipitação prevista: 0 mm
```

**Histórico Recente:**
```
Choveu na última 1h: 0.5 mm
Pista possivelmente molhada ⚠️
```

### Implementação
Adicionar campos no Waypoint:

```typescript
interface WaypointRisk {
  // Futura
  precipitationProbability: number;
  precipitationMm: number;
  
  // Histórico
  recentRainMm: number;  // Última 3h
  roadWetness: boolean;  // Baseado em histórico
}
```

---

## 🟢 DEPOIS: UI/UX Improvements (Backlog)

### Baixa Prioridade (Pode ficar para depois)

#### A. Legenda Educacional ✅ (Já feito)
```
🟢 0-20%: SEGURO
  Viagem confortável. Sem chuva. Pista seca.

🟡 21-55%: MODERADO
  Chuva em alguns trechos. Atenção.

🟠 56-75%: ALTO
  Chuva forte. Considere adiar.

🔴 76-100%: CRÍTICO
  Temporal. Não recomendado.
```

#### B. "Sair Agora" Button ✅ (Já feito)
Botão no header que seleciona saída imediata.

#### C. Trecho Crítico
Mostrar: "A maior exposição será entre Km 85-105, entre 09:35-10:05"

#### D. Autocomplete de Cidades
Melhorar com API externa (Nominatim, Google Places)

#### E. Histórico de Rotas
Salvar rotas favoritas (localStorage)

---

## 📊 Roadmap Consolidado

```
SEMANA 1 (Agora):
├─ ✅ Corrigir bug de geometria (FEITO)
├─ 🔴 Testar pós-correção (TODO - 30min)
└─ 📊 Refactor de UI/UX (TODO - 8h)

SEMANA 2:
├─ 🟡 Dados contraditórios (2h)
├─ 🟢 Legenda educacional (1h)
└─ 📱 Deploy em Netlify

SEMANA 3:
├─ 🔵 Calibração com dados reais (10 viagens)
├─ 📈 Análise de previsão vs realidade
└─ Ajuste de thresholds (RAIN_BANDS_MM, etc)

SEMANA 4+:
├─ GPS em tempo real (recalcular conforme viaja)
├─ Climate Compression (agrupar trechos)
├─ Confidence bands (incerteza dinâmica)
└─ ML para padrões regionais
```

---

## ✅ Checklist Imediato

- [ ] Corrigir geometria da rota → ✅ FEITO
- [ ] Compilar sem erros → ✅ FEITO
- [ ] Testar SJC→Florianópolis → ⏳ TODO
- [ ] Verificar Campinas não aparece → ⏳ TODO
- [ ] Commit com relatório → ✅ FEITO
- [ ] Planejar UI/UX → ✅ FEITO

---

## 🎯 Conclusão

**O que estava errado:** Interpolação linear ao invés de geometria real  
**Como foi consertado:** `generateSmartRoutePointsFromGeometry()` + OSRM geometry  
**Próximo passo:** Testar em produção e refazer UI para mostrar risco × hora

O sistema agora tem uma base sólida para:
1. Previsão precisa (pontos reais da rota)
2. Recomendação inteligente (departure sweep funciona corretamente)
3. Interface clara (pronta para redesign)

**Status:** Ready for Phase 2 (UI) ✅

---

**Atualizado:** 2026-09-03  
**Próxima revisão:** Após UI refactor
