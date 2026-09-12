# 🌊 Maré Alta

Previsão de **clima e maré do litoral de Recife/Olinda** com **tábua oficial DHN/Marinha** + histórico em **SQLite**. Instalável como app (PWA).

> Projeto real, feito pra aprender: front-end puro consumindo APIs REST + mini back-end em Flask.
> Status: **v2.0 funcionando** — tábua oficial, gráfico de maré, PWA.

## O que ele faz

- 🌡️ **Agora**: temperatura do ar, sensação térmica, condição, vento, umidade
- 🌊 **Mar agora**: altura das ondas, temperatura da água, nível do mar + tendência (enchendo/vazando)
- ⚓ **Tábua oficial**: preia-mares e baixa-mares da DHN/Marinha (porto mais próximo de cada pico), com **gráfico de maré** e linha do AGORA
- 🔀 **2 fontes de maré**: Oficial DHN (padrão) ou Modelo (fallback automático)
- ⏭️ **Próximas 24h** + 📅 **3 dias** + 🕘 **Histórico** (com a fonte usada em cada consulta)
- 📲 **PWA**: instalável no celular, funciona com cache offline básico

## Fontes de dados (a parte importante)

| Dado | Fonte | Chave? |
|---|---|---|
| Clima (ar) | [Open-Meteo Forecast](https://open-meteo.com/en/docs) | não |
| Ondas + temp. água | [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api) | não |
| **Maré oficial** | **DHN/Marinha** via [Tábua de Maré API](https://tabuamare.api.br/) (`GET /api/v2/geo-tabua-mare`) | não (limite por IP) |
| Maré alternativa | Open-Meteo `sea_level_height_msl` (modelo MFWAM ~8km) | não |

**Validação real (12/09/2026, Porto do Recife):** a API DHN retornou
04:23/2.54m · 10:46/0.13m · 16:46/2.37m · 22:53/0.14m —
batendo com a tábua publicada pro dia (4:02/2.5m · 10:15/0.2m · 16:17/2.4m · 22:28/0.2m,
pequenas diferenças de modelo). Instituição coletora: **DHN**, carta 902, nível médio 1.28m.

O que **não** foi usado de propósito: scraping do tabuademares (site comercial, sem API pública —
usar raspagem quebraria fácil e violaria os termos deles). A ferramenta oficial da Marinha
([TábuaMares/REMO](https://pam.marinha.mil.br/tabuamares/tabuamares.html)) também não expõe API;
ela está linkada no app como referência oficial.

> Uso respeitoso da Tábua de Maré API: chamadas sob demanda por visualização, sem cópia em massa
> nem cache público. Em `429` o app cai sozinho pro modelo. ([Termos](https://tabuamare.api.br/termos))

## Estrutura

```
mare-alta/
├── index.html      # app (tabs, gráfico, seletor de fonte)
├── styles.css      # visual dark
├── app.js          # lógica: 3 APIs, maré oficial/modelo, gráfico canvas, PWA
├── manifest.json   # PWA
├── sw.js           # service worker (offline básico)
├── icons/          # ícone 192 + 512 (gerados com PIL)
├── api/
│   ├── app.py          # Flask: salva/lista consultas em SQLite
│   └── requirements.txt
└── README.md
```

## Como rodar — front

```bash
cd mare-alta
python -m http.server 8000
# abre http://127.0.0.1:8000
```

> `file://` direto também abre, mas o PWA/service worker exige `http://localhost` ou `https`.

### Instalar como app (PWA)

1. Rode o servidor acima (ou publique em HTTPS, ex. Vercel).
2. No Chrome/Edge do celular: menu ⋮ → **Instalar app / Adicionar à tela inicial**.
3. Abre em tela cheia, com ícone e splash na cor do app.

## Como rodar — back-end (histórico em SQLite, opcional)

```bash
cd mare-alta
pip install -r api/requirements.txt
python api/app.py
# API em http://127.0.0.1:5000
```

| Método | Rota | Pra quê |
|---|---|---|
| GET | `/api/health` | checa se o back tá vivo |
| GET | `/api/consultas?limit=20` | lista últimas (com `fonte`) |
| POST | `/api/consultas` | salva: `{spot_id, spot_nome, temp_ar, onda_m, nivel_mar, resumo, fonte}` |

O front detecta sozinho: back vivo → SQLite; senão → `localStorage`. Nada quebra.

## Git + GitHub

```bash
# repo vazio no GitHub com nome mare-alta (sem README, sem .gitignore), depois:
git remote add origin https://github.com/itsnyxenn/mare-alta.git
git push -u origin main
```

## Roadmap

- [x] Tábua oficial DHN (v2.0)
- [x] PWA instalável (v2.0)
- [ ] Deploy: front na Vercel + back no Render
- [ ] Cache da tábua no back-end (1 chamada/dia/pico em vez de por view)
- [ ] Alerta de preia-mar + widget "dá praia?"
- [ ] Stormglass/WorldTides como 3ª fonte (exige chave grátis do usuário)
- [ ] Testes no back-end (pytest)

## ⚠️ Aviso honesto

Tábua oficial DHN é referência, mas maré real varia com vento e pressão.
**Não usar para navegação** — pra isso, as [Tábuas oficiais da Marinha](https://www.marinha.mil.br/chm/tabuas-de-mare).
