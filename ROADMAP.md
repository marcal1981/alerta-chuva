# 🚀 Roadmap de Desenvolvimento — Rota Sem Chuva

## Visão de Curto Prazo (Próximas 4 Semanas)

### Semana 1: Risk Engine & Teste de Múltiplos Horários
**Prioridade**: 🔴 CRÍTICA

**Objetivo**: Sistema conseguir testar automaticamente múltiplos horários de saída e recomendar o melhor.

**Tarefas**:
- [ ] Implementar algoritmo de score de risco na API
- [ ] Endpoint `/api/analyze-route` que:
  - Recebe: origem, destino, data, período disponível (06h-18h)
  - Testa cada hora: 06h, 07h, 08h... 20h
  - Calcula score para cada horário
  - Retorna: melhor horário + alternativas + horários a evitar
- [ ] Atualizar front-end para exibir recomendações
- [ ] Testar com rotas reais (SJC → Ilhabela)

**Estimativa**: 3-4 dias

**Definição de Pronto**: 
- ✅ API retorna múltiplos horários com scores
- ✅ Front-end mostra "Sair às 08h para menor chance de chuva"
- ✅ Testado manualmente com 3 rotas diferentes

---

### Semana 2: Integração PostGIS & Base de Municípios
**Prioridade**: 🟠 ALTA

**Objetivo**: Sistema identifica automaticamente cidades atravessadas pela rota.

**Tarefas**:
- [ ] Provisionar PostgreSQL com PostGIS
- [ ] Importar base de municípios brasileiros (IBGE)
- [ ] Criar Location Service que:
  - Extrai pontos a cada 20 km da rota
  - Para cada ponto, descobre qual município pertence
  - Remove duplicatas
  - Retorna lista ordenada de cidades
- [ ] Integrar com Route Analysis Engine
- [ ] Testar com rotas conhecidas

**Estimativa**: 3-4 dias

**Dados**: 
- Download: https://www.ibge.gov.br/ (shapefile de municípios)
- Import no PostGIS

**Definição de Pronto**:
- ✅ PostGIS configurado e acessível
- ✅ Base de municípios carregada
- ✅ Location Service retorna cidades corretas

---

### Semana 3: Route Analysis Completo & Timeline
**Prioridade**: 🟠 ALTA

**Objetivo**: Sistema distribui tempo da viagem ao longo dos pontos e calcula horário de chegada em cada um.

**Tarefas**:
- [ ] Route Analysis Engine que:
  - Recebe: rota (origem → destino)
  - Retorna: lista de pontos com {km, cidade, horário_estimado}
- [ ] Calcular velocidade média da rota
- [ ] Distribuir tempo ao longo dos km
- [ ] Estimar chegada em cada cidade
- [ ] Atualizar Risk Engine para usar esses horários
- [ ] Testar precisão (comparar com Waze/Google Maps)

**Estimativa**: 3-4 dias

**Exemplo de Output**:
```json
{
  "timeline": [
    {"km": 0, "city": "São José dos Campos", "time": "08:00", "lat": -23.22, "lng": -45.90},
    {"km": 30, "city": "Paraibuna", "time": "08:35", "lat": -23.34, "lng": -45.67},
    {"km": 145, "city": "Ilhabela", "time": "10:40", "lat": -23.77, "lng": -45.35}
  ]
}
```

**Definição de Pronto**:
- ✅ Timeline calculado corretamente
- ✅ Risk Engine usa esses horários
- ✅ Recomendações são precisas

---

### Semana 4: UI Refinada & Deploy v1.0
**Prioridade**: 🟡 MÉDIA

**Objetivo**: Plataforma pronta para uso público (MVP completo).

**Tarefas**:
- [ ] UI mostra jornada visual (cidades + horários + ícones de clima)
- [ ] Componente de resultado com:
  - Melhor horário (grande destaque)
  - Alternativas (2-3 opções)
  - Horários a evitar (com warning)
  - Gráfico de risco por horário
  - Timeline visual da rota
- [ ] Performance: otimizar queries, cachear previsões
- [ ] Tratamento de erros robusto
- [ ] Testes em múltiplos navegadores/celulares
- [ ] Deploy em staging (Netlify)
- [ ] Testes de carga
- [ ] Deploy em produção

**Estimativa**: 4-5 dias

**Definição de Pronto**:
- ✅ UI responsiva (mobile + desktop)
- ✅ Sem erros em produção
- ✅ Tempo de resposta < 3 segundos
- ✅ Documentação de uso

---

## Visão de Médio Prazo (Mês 2)

### Cache & Performance
- [ ] Redis para cachear previsões (12h)
- [ ] Precomputar análises de rotas populares
- [ ] Otimização de queries PostGIS
- [ ] Índices de banco de dados

### Analytics & Monitoring
- [ ] Logger centralizado (Sentry)
- [ ] Dashboard de métricas
- [ ] Alerts para erros críticos

### Histórico de Rotas
- [ ] Salvar análise de cada rota
- [ ] Permitir usuário comparar horários
- [ ] "Rotas frequentes" do usuário

---

## Visão de Longo Prazo (Mês 3+)

### Mapa Interativo
- [ ] Visualizar rota no mapa
- [ ] Mostrar cidades/pontos de interesse
- [ ] Clima visualizado na rota

### GPS em Tempo Real
- [ ] Usuário compartilha localização
- [ ] Recalcular recomendação durante viagem
- [ ] Alertas: "Chuva 20 km à frente"

### App Mobile
- [ ] React Native
- [ ] Notificações push
- [ ] Integração com contatos

### Dashboard para Motoristas Profissionais
- [ ] Histórico de viagens
- [ ] Estatísticas de segurança
- [ ] Planejamento de rotas semanais

---

## Métricas de Sucesso

### Fase 1 (MVP)
- [ ] Sistema consegue recomendar horário correto
- [ ] Tempo de resposta < 3s
- [ ] Funciona para 90% das combinações de origem/destino

### Fase 2
- [ ] Precisão de recomendação > 85%
- [ ] 500+ rotas analisadas
- [ ] Taxa de satisfação > 4/5 (feedback)

### Fase 3
- [ ] 10k+ usuários ativos/mês
- [ ] Taxa de retenção > 40%
- [ ] Expansão para novas cidades/estados

---

## Tecnologia Adicional Necessária

### Imediato
- [x] PostgreSQL + PostGIS
- [x] Base de municípios brasileiros
- [x] Nominatim (Geocoding)
- [x] Open-Meteo (Previsão)
- [x] OSRM (Rotas)

### Curto Prazo
- [ ] Redis (cache)
- [ ] Bull/BullMQ (filas)
- [ ] Sentry (error tracking)

### Médio Prazo
- [ ] MapBox ou Folium (mapa interativo)
- [ ] Firebase ou Auth0 (autenticação)
- [ ] Stripe/PagSeguro (monetização futura)

---

## Dependências & Blockers

**Nenhum blocker identificado no MVP.**

Possíveis riscos:
- ⚠️ Limite de requisições da Open-Meteo (1.0 requisições/segundo) → Solução: cache com Redis
- ⚠️ Performance do PostGIS com geometrias grandes → Solução: índices GIST
- ⚠️ Limite de requisições Nominatim → Solução: cachear ou migrar para provedor pago

---

## Estimativa Total

| Fase | Semanas | Status |
|---|---|---|
| 1. Risk Engine | 1 | ⏳ Iniciando |
| 2. PostGIS + Municípios | 1 | ⏳ Próximo |
| 3. Route Analysis | 1 | ⏳ Próximo |
| 4. UI + Deploy | 1 | ⏳ Próximo |
| **Total MVP** | **4** | **Em Progresso** |
| 5. Performance + Analytics | 2 | 🔵 Fase 2 |
| 6. Features Avançadas | 3-4 | 🔵 Fase 3 |

---

## Como Contribuir / Próximos Passos

1. **Clone o projeto**:
   ```bash
   git clone https://github.com/marcal1981/alerta-chuva.git
   cd alerta-chuva
   npm install
   ```

2. **Setup local**:
   ```bash
   # Criar banco PostgreSQL local
   # Atualizar .env.local com credenciais
   npm run dev
   ```

3. **Trabalhar na Semana 1**:
   - Criar novo arquivo: `src/app/api/analyze-route/route.ts`
   - Implementar Risk Engine
   - Testar com scripts de exemplo

4. **Fazer commit & PR**:
   - Criar branch: `feat/risk-engine`
   - Commitar com mensagens descritivas
   - Abrir PR com descrição das mudanças

---

**Última atualização**: 2026-09-01
**Próxima revisão**: 2026-09-08
**Responsável**: Arquiteto do Projeto
