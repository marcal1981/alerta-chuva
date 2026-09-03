#!/usr/bin/env python3
"""
Análise de previsões vs observações reais.
Uso: python3 scripts/validate_predictions.py data/observations.json
"""

import json
import sys
from dataclasses import dataclass
from pathlib import Path

@dataclass
class Observation:
    date: str
    route: str
    forecast_score: int
    forecast_hazards: list
    rained: bool
    intensity: str
    wet_road: bool
    incidents: str
    validation: str

def load_observations(path: str) -> list[Observation]:
    with open(path) as f:
        raw = json.load(f)

    obs = []
    for item in raw:
        forecast = item['forecast']
        obs_data = item['observation']
        obs.append(Observation(
            date=item['date'],
            route=f"{item['route']['from']} → {item['route']['to']}",
            forecast_score=forecast['score'],
            forecast_hazards=forecast['hazards'],
            rained=obs_data['rained'],
            intensity=obs_data['intensity'],
            wet_road=obs_data['wet_road'],
            incidents=obs_data['incidents'],
            validation=item['validation'],
        ))
    return obs

def categorize_forecast(score: int) -> str:
    if score <= 20: return 'seguro'
    if score <= 55: return 'moderado'
    return 'alto_risco'

def analyze(obs_list: list[Observation]):
    print("\n" + "="*80)
    print("ANÁLISE DE PREVISÕES — ROTA SEGURA")
    print("="*80)

    total = len(obs_list)
    correct = sum(1 for o in obs_list if o.validation == '✅')
    accuracy = (correct / total * 100) if total > 0 else 0

    print(f"\nTotal de viagens: {total}")
    print(f"Acertos: {correct} ({accuracy:.1f}%)")
    print(f"Erros: {total - correct}")

    # Análise de falsos positivos (app disse risco, mas foi tranquilo)
    false_pos = [o for o in obs_list if o.validation == '❌' and not o.rained and o.forecast_score > 20]
    if false_pos:
        print(f"\n⚠️ FALSOS POSITIVOS: {len(false_pos)}")
        for o in false_pos:
            print(f"  {o.date} {o.route}: Score {o.forecast_score} (previsão: {o.forecast_hazards})")

    # Análise de falsos negativos (app disse seguro, mas choveu)
    false_neg = [o for o in obs_list if o.validation == '❌' and o.rained and o.forecast_score <= 20]
    if false_neg:
        print(f"\n❌ FALSOS NEGATIVOS: {len(false_neg)}")
        for o in false_neg:
            print(f"  {o.date} {o.route}: Chuva {o.intensity}, Score {o.forecast_score}")

    # Análise por intensidade
    print(f"\n📊 CHUVAS OBSERVADAS:")
    intensidades = {}
    for o in obs_list:
        if o.rained:
            intensidades.setdefault(o.intensity, []).append(o.forecast_score)

    for intensidade in ['garoa', 'moderada', 'forte', 'temporal']:
        scores = intensidades.get(intensidade, [])
        if scores:
            avg_score = sum(scores) / len(scores)
            print(f"  {intensidade}: {len(scores)} vezes, Score médio {avg_score:.0f}")

    # Análise de pista molhada
    wet_road_obs = [o for o in obs_list if o.wet_road]
    if wet_road_obs:
        print(f"\n💧 PISTA MOLHADA: {len(wet_road_obs)} observações")
        print(f"  Hazard 'pista_molhada' foi previsto em: ", end="")
        detected = sum(1 for o in wet_road_obs if 'pista_molhada' in o.forecast_hazards)
        print(f"{detected}/{len(wet_road_obs)}")

    # Recomendações de calibração
    print("\n🔧 SUGESTÕES DE CALIBRAÇÃO:")

    if false_pos:
        print(f"  • {len(false_pos)} falsos positivos → App é muito conservador")
        print("    Considerar aumentar thresholds (RAIN_BANDS_MM, DANGEROUS_GUST_KMH)")

    if false_neg:
        print(f"  • {len(false_neg)} falsos negativos → App perdeu chuvas")
        print("    Considerar baixar WET_ROAD_LOOKBACK_HOURS ou aumentar sensitivity")

    if accuracy >= 95:
        print("  ✅ Modelo está bem calibrado!")
    elif accuracy >= 85:
        print("  ⚠️ Modelo está aceitável, mas há espaço para melhora")
    else:
        print("  ❌ Modelo precisa de recalibração")

    print("\n" + "="*80 + "\n")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Uso: python3 validate_predictions.py <caminho_dados.json>")
        sys.exit(1)

    obs = load_observations(sys.argv[1])
    analyze(obs)
