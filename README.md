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
| GET | `/api/tabua?lat=&lon=&estado=&mes=&dias=` | proxy da tábua oficial (com sua chave, fora do IP compartilhado) |

### Chave grátis da tábua (recomendado)

O front tenta a tábua direto no navegador; se o navegador for bloqueado (403),
ele usa o proxy acima. Pra cota isolada (64 req/min só suas), crie a chave grátis:

1. [tabuamare.api.br](https://tabuamare.api.br/) → **Criar/Logar** (Google) → dashboard → nova api_key
2. No Render: seu serviço → **Environment** → add `TABUAMARE_KEY` = sua chave → salva
   (redeploy automático). Local: `set TABUAMARE_KEY=sua_chave` antes do `python api/app.py`.
3. Sem chave também funciona (anônimo, 16 req/min por IP) — a chave só dá folga.

O front detecta sozinho: back vivo → SQLite; senão → `localStorage`. Nada quebra.

## Como publicar online (grátis)

**1. GitHub** — cria a conta (se não tem), cria um repo vazio chamado `mare-alta`
(sem README/.gitignore), depois aqui na pasta:

```bash
git remote add origin https://github.com/itsnyxenn/mare-alta.git
git push -u origin main
```

**2. Front na Vercel** (app + PWA, HTTPS automático):
1. [vercel.com](https://vercel.com) → login com GitHub → **Add New → Project**
2. Importa o repo `mare-alta` → Framework: **Other**, sem build command
3. **Deploy**. Pronto: `https://mare-alta-seuuser.vercel.app` no ar.

**3. Back no Render** (opcional — o app vive sem ele):
1. [render.com](https://render.com) → login com GitHub → **New → Web Service**
2. Seleciona `mare-alta` → **Build Command:** `pip install -r api/requirements.txt`
3. **Start Command:** `python api/app.py` → env `FLASK_DEBUG=0` → Deploy
4. Copia a URL (ex. `https://mare-alta-api.onrender.com`)

**4. Liga os dois:** abre teu app online → seção **Histórico** → cola a URL do Render
no campo `back-end` → salvar. Feito, histórico vai pro SQLite online.

> Limites honestos do grátis: o Render **dorme** sem acesso (~50s pra acordar no
> primeiro clique) e o **SQLite zera** a cada restart (disco efêmero). O app foi
> feito pra isso: cai pro `localStorage` sozinho, nada quebra. Quando virar
> projeto sério, o passo seguinte é Postgres.

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

## Licença

Uso pessoal e educacional do autor. Todos os direitos reservados — ver [LICENSE](LICENSE).
