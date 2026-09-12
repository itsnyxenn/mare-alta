# 🌊 Maré Alta

Previsão de **clima e maré do litoral de Recife/Olinda** com API pública gratuita (sem chave) + histórico de consultas em **SQLite**.

> Projeto real, feito pra aprender: front-end puro consumindo API REST + mini back-end em Flask.
> Status: **v1.0 funcionando** — frontend 100% real, backend opcional.

## O que ele faz

- 🌡️ **Agora**: temperatura do ar, sensação térmica, condição, vento, umidade
- 🌊 **Mar agora**: altura das ondas, temperatura da água, nível do mar + tendência (enchendo/vazando)
- 🌕 **Tábua de maré**: próximas preia-mares e baixa-mares (derivadas do nível do mar do modelo)
- ⏭️ **Próximas 24h**: temperatura + ondas hora a hora
- 📅 **3 dias**: máx/mín, chance de chuva, onda máxima
- 🕘 **Histórico**: últimas consultas salvas (no backend se estiver rodando, senão no navegador)

## Stack

| Parte | Tech |
|---|---|
| Front-end | HTML + CSS + JavaScript puro (fetch, sem lib) |
| Clima | [Open-Meteo Forecast](https://open-meteo.com/en/docs) — grátis, sem chave |
| Mar e maré | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api) — `wave_height`, `sea_surface_temperature`, `sea_level_height_msl` |
| Back-end | Python + Flask + SQLite (stdlib) |
| Fuso | America/Recife |

## Estrutura

```
mare-alta/
├── index.html      # app
├── styles.css      # visual dark
├── app.js          # lógica: APIs, maré, histórico
├── api/
│   ├── app.py          # Flask: salva/lista consultas em SQLite
│   └── requirements.txt
└── README.md
```

## Como rodar — front (só isso já funciona)

Opção 1 — abrir o arquivo:
> Duplo clique em `index.html`. Pronto, dados reais na tela.

Opção 2 — servidor local (recomendado):
```bash
cd mare-alta
python -m http.server 8000
# abre http://127.0.0.1:8000
```

## Como rodar — back-end (histórico em SQLite, opcional)

```bash
cd mare-alta
pip install -r api/requirements.txt
python api/app.py
# API em http://127.0.0.1:5000
```

Endpoints:

| Método | Rota | Pra quê |
|---|---|---|
| GET | `/api/health` | checa se o back tá vivo |
| GET | `/api/consultas?limit=20` | lista últimas consultas |
| POST | `/api/consultas` | salva uma: `{spot_id, spot_nome, temp_ar, onda_m, nivel_mar, resumo}` |

O front detecta sozinho: se o back responde, salva lá; se não, salva no `localStorage`. Nada quebra.

## Git + GitHub

O repo já foi iniciado localmente (`git init`, branch `main`, commit inicial).
Pra publicar:

```bash
# 1. cria o repo vazio no GitHub com nome mare-alta (sem README, sem .gitignore)
# 2. conecta e sobe:
git remote add origin https://github.com/itsnyxenn/mare-alta.git
git push -u origin main
```

Aí o link do portfólio (`github.com/itsnyxenn/mare-alta`) vira real. 🤘

## Roadmap

- [ ] Tábua oficial da Marinha (CHM) como fonte de maré (mais precisa na costa)
- [ ] Deploy: front na Vercel + back no Render
- [ ] PWA (instalar no celular, ver a maré antes da praia)
- [ ] Alertas: "preia-mar às 14h, corre pra Boa Viagem"
- [ ] Testes no back-end (pytest)

## ⚠️ Aviso honesto

A maré aqui vem de **modelo numérico** (`sea_level_height_msl` — MFWAM/SMOC via Open-Meteo),
não da tábua oficial. A doc deles avisa: precisão limitada na costa, **não serve pra navegação**.
Pra banho de mar tá valendo; pra pilotar barco, consulta a [Marinha (CHM)](https://www.marinha.mil.br/chm/).
