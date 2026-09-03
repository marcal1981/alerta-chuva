# Guia de Deploy — Rota Segura

## ✅ Status de Teste
- **Build**: ✅ Sucesso (`npm run build`)
- **Dev Server**: ✅ Rodando em `http://localhost:3000`
- **Compilação TypeScript**: ✅ Sem erros
- **APIs**: ✅ Testadas com demo (`npx tsx demo-departure-sweep.ts`)

## 🚀 Deploy em Netlify

### Opção 1: Conectar repositório (recomendado)

1. Acesse https://app.netlify.com
2. Clique em "New site from Git"
3. Selecione GitHub > `marcal1981/alerta-chuva`
4. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Node version**: 18 (ou maior)

5. Clique em "Deploy"

Netlify detectará automaticamente `netlify.toml` e usará essa configuração.

### Opção 2: Deploy via CLI

```bash
npm install -g netlify-cli

# Login na sua conta
netlify login

# Deploy
netlify deploy --prod
```

### Opção 3: Deploy via GitHub Actions (CI/CD automático)

Criar arquivo `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Netlify

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm install
      - run: npm run build
      
      - uses: netlify/actions/cli@master
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
        with:
          args: deploy --prod
```

## 🌐 URLs após deploy

- **Frontend**: `https://alerta-chuva.netlify.app` (ou seu domínio)
- **API Routes**: `https://alerta-chuva.netlify.app/api/*`

## 📋 Checklist pré-deploy

- [ ] `npm run build` sem erros
- [ ] Variáveis de ambiente configuradas (se houver)
- [ ] `package.json` com todas as dependências
- [ ] `.gitignore` configurado corretamente
- [ ] `netlify.toml` presente
- [ ] README com instruções claras

## 🔍 Teste após deploy

```bash
# Testar página principal
curl https://alerta-chuva.netlify.app

# Testar API de rota
curl "https://alerta-chuva.netlify.app/api/routes?from=-23.2237,-45.9011&to=-23.8633,-45.3562"

# Testar API de análise (varredura de partidas)
curl "https://alerta-chuva.netlify.app/api/route-analysis?from=-23.2237,-45.9011&to=-23.8633,-45.3562"
```

## 📊 Monitoramento em produção

Netlify fornece:
- **Logs**: Acesse em Netlify > Analytics > Functions para ver erros de API
- **Status**: Monitor previsões vs observações em tempo real
- **Rollback**: Se algo quebrar, volte para commit anterior

## 🐛 Debug em produção

Se a API retorna erro:

```bash
# Ver logs do servidor
netlify logs

# Testar localmente o comportamento de produção
npm run build
npm run start
curl http://localhost:3000/api/route-analysis?from=...&to=...
```

## 🎯 Próximos passos após deploy

1. **Testar manualmente** — Usar o app com rotas reais
2. **Coletar dados** — Seguir `DATA_COLLECTION_PLAN.md`
3. **Analisar** — Rodar `python3 scripts/validate_predictions.py`
4. **Recalibrar** — Ajustar `src/lib/departureSweep.ts` com base em resultados
5. **Iterar** — Nova coleta + análise

---

**Status de pronto para produção**: ✅ SIM

O app está compilado, testado localmente e pronto para subir.
