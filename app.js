/* ============================================================
   MARÉ ALTA v2.0 — clima + maré de Recife/Olinda (modo app/PWA)
   Fontes de MARÉ (seletor na tela):
     - oficial: DHN/Marinha via tabuamare.api.br (sem chave,
       limite por IP) — porto mais próximo de cada pico.
     - modelo:  Open-Meteo Marine (sea_level_height_msl),
       fallback automático se a oficial falhar/limitar.
   Clima e ondas: sempre Open-Meteo (forecast + marine).
   Recife = UTC-3 fixo (sem horário de verão).
   ============================================================ */

const SPOTS = [
  { id: 'porto',     nome: 'Porto do Recife',   lat: -8.058, lon: -34.871 },
  { id: 'boaviagem', nome: 'Boa Viagem',        lat: -8.120, lon: -34.900 },
  { id: 'olinda',    nome: 'Olinda · B. Novo',  lat: -8.008, lon: -34.850 },
  { id: 'janga',     nome: 'Janga · Paulista',  lat: -7.940, lon: -34.830 },
];

// Back Flask: local por padrão; p/ usar online, cola a URL do Render
// no campo "back-end" (seção Histórico) — fica salva no navegador.
const BACK_URL_PADRAO = 'http://127.0.0.1:5000';
// storage com colete: se o navegador bloquear, o app segue sem salvar
function lerLS(chave, padrao) { try { const v = localStorage.getItem(chave); return v == null ? padrao : v; } catch { return padrao; } }
function escLS(chave, valor) { try { if (valor) localStorage.setItem(chave, valor); else localStorage.removeItem(chave); } catch { /* segue o jogo */ } }
const BACK_URL = lerLS('marealta_backend', BACK_URL_PADRAO);
const TZ = 'America/Recife';
const UTC3 = 3 * 3600 * 1000;

// WMO weather code -> [descrição PT-BR, emoji]
const WMO = {
  0:['Céu limpo','☀'], 1:['Quase limpo','🌤'], 2:['Parcial nublado','⛅'], 3:['Nublado','☁'],
  45:['Nevoeiro','🌫'], 48:['Nevoeiro','🌫'],
  51:['Garoa leve','🌦'], 53:['Garoa','🌦'], 55:['Garoa forte','🌧'],
  56:['Garoa congelante','🌧'], 57:['Garoa congelante','🌧'],
  61:['Chuva fraca','🌧'], 63:['Chuva','🌧'], 65:['Chuva forte','⛈'],
  66:['Chuva congelante','🌧'], 67:['Chuva congelante','🌧'],
  71:['Neve fraca','🌨'], 73:['Neve','🌨'], 75:['Neve forte','🌨'], 77:['Granizo fino','🌨'],
  80:['Pancadas leves','🌦'], 81:['Pancadas','🌧'], 82:['Pancadas fortes','⛈'],
  85:['Pancada de neve','🌨'], 86:['Pancada de neve','🌨'],
  95:['Tempestade','⛈'], 96:['Tempestade c/ granizo','⛈'], 99:['Tempestade c/ granizo','⛈'],
};

let spotAtual = SPOTS[0];
let fonte = 'oficial';           // 'oficial' | 'modelo'
const cacheOficial = {};         // spot.id+dia -> {info, eventos}
let ultimoGrafico = null;        // p/ redesenhar no resize

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');

// parede de Recife (UTC-3) -> ms epoch (Recife não tem DST, offset fixo)
function msRecife(y, mo, d, H, Mi) {
  return Date.UTC(y, mo - 1, d, H, Mi) + UTC3;
}
// "2026-09-12T14:00" (parede Recife) -> ms
function msDaParede(iso) {
  const [D, H] = iso.split('T');
  const [y, mo, d] = D.split('-').map(Number);
  const [Hh, Mi] = H.split(':').map(Number);
  return msRecife(y, mo, d, Hh, Mi);
}
function hhMs(ms) {
  return new Date(ms).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
function etiquetaMs(ms) {
  const f = (t) => new Date(t).toLocaleDateString('pt-BR', { timeZone: TZ });
  const hoje = f(Date.now());
  const dia = f(ms);
  if (dia === hoje) return 'hoje';
  if (dia === f(Date.now() + 864e5)) return 'amanhã';
  return dia.slice(0, 5);
}

function urlClima(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=3`;
}
function urlMar(lat, lon) {
  return `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height,sea_surface_temperature,sea_level_height_msl` +
    `&hourly=wave_height,sea_surface_temperature,sea_level_height_msl` +
    `&daily=wave_height_max&timezone=${encodeURIComponent(TZ)}&forecast_days=3&cell_selection=sea`;
}

// ---------- fonte OFICIAL (DHN via tabuamare.api.br) ----------
// dias -1..+3 agrupados por (ano, mês), pq a rota pede mês + [dias]
function gruposDias() {
  const grupos = {};
  const hoje = new Date();
  for (let k = -1; k <= 3; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + k);
    const y = d.getFullYear(), m = d.getMonth() + 1, dia = d.getDate();
    const key = y + '-' + m;
    if (!grupos[key]) grupos[key] = { y, m, ds: [] };
    if (!grupos[key].ds.includes(dia)) grupos[key].ds.push(dia);
  }
  return Object.values(grupos);
}

async function tentaJson(url, timeoutMs) {
  try {
    const opt = timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {};
    const r = await fetch(url, opt);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function buscarOficial(spot) {
  const chave = spot.id + '@' + new Date().toLocaleDateString('pt-BR', { timeZone: TZ });
  if (cacheOficial[chave]) return cacheOficial[chave];

  let info = null;
  const eventos = [];
  const base = (localStorage.getItem('marealta_backend') || BACK_URL_PADRAO).replace(/\/$/, '');
  for (const g of gruposDias()) {
    const diasStr = `[${g.ds.join(',')}]`;
    // 1) direta (colchetes codificados: alguns WAFs barram [ ] crus)
    const direta = `https://tabuamare.api.br/api/v2/geo-tabua-mare/${encodeURIComponent(`[${spot.lat},${spot.lon}]`)}/pe/${g.m}/${encodeURIComponent(diasStr)}`;
    let j = await tentaJson(direta);
    if (!j && base) {
      // 2) proxy no nosso back (com chave própria, fora do IP compartilhado)
      const q = new URLSearchParams({ lat: String(spot.lat), lon: String(spot.lon), estado: 'pe', mes: String(g.m), dias: diasStr });
      j = await tentaJson(`${base}/api/tabua?${q.toString()}`, 12000);
    }
    if (!j || !j.data || !j.data.length) throw new Error('tábua oficial indisponível (tente o modo Modelo 🛰️)');
    const porto = j.data[0];
    if (!info) info = porto;
    (porto.months || []).forEach((mo) => (mo.days || []).forEach((d) => {
      (d.hours || []).forEach((h) => {
        const [H, Mi] = h.hour.split(':').map(Number);
        eventos.push({ ms: msRecife(g.y, g.m, d.day, H, Mi), h: h.level });
      });
    }));
  }
  eventos.sort((a, b) => a.ms - b.ms);
  if (!eventos.length) throw new Error('tábua oficial veio vazia');

  // tipo por direção: subiu em relação ao evento anterior = preia
  let prev = (info && info.mean_level != null) ? info.mean_level : eventos[0].h;
  eventos.forEach((e) => { e.tipo = e.h >= prev ? 'preia' : 'baixa'; prev = e.h; });

  const out = { info, eventos };
  cacheOficial[chave] = out;
  return out;
}

// interpola (senoidal) o nível entre dois extremos vizinhos
function nivelEm(eventos, ms) {
  if (ms <= eventos[0].ms) return { h: eventos[0].h, tend: 0, prox: eventos[0] };
  for (let i = 0; i < eventos.length - 1; i++) {
    const a = eventos[i], b = eventos[i + 1];
    if (ms >= a.ms && ms <= b.ms) {
      const f = (ms - a.ms) / (b.ms - a.ms);
      const h = a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2;
      return { h, tend: Math.sign(b.h - a.h), prox: b };
    }
  }
  const l = eventos[eventos.length - 1];
  return { h: l.h, tend: 0, prox: null };
}

// ---------- fonte MODELO (Open-Meteo): extremos na curva horária ----------
function acharMares(times, niveis) {
  const out = [];
  for (let i = 1; i < times.length - 1; i++) {
    const a = niveis[i - 1], b = niveis[i], c = niveis[i + 1];
    if (b == null || a == null || c == null) continue;
    let tipo = null;
    if (b > a && b >= c) tipo = 'preia';
    else if (b < a && b <= c) tipo = 'baixa';
    if (!tipo) continue;
    const prevEv = out[out.length - 1];
    if (prevEv && prevEv.tipo === tipo) {
      const melhor = tipo === 'preia' ? b > prevEv.h : b < prevEv.h;
      if (melhor) out[out.length - 1] = { ms: msDaParede(times[i]), h: b, tipo };
      continue;
    }
    if (prevEv && (msDaParede(times[i]) - prevEv.ms) / 36e5 < 4) continue;
    out.push({ ms: msDaParede(times[i]), h: b, tipo });
  }
  return out;
}

// ---------- gráfico de maré (canvas) ----------
function desenharGrafico(pontos, eventos) {
  ultimoGrafico = { pontos, eventos };
  const cv = $('grafico');
  const largura = Math.max(300, cv.parentElement.getBoundingClientRect().width);
  const W = largura, H = 220;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = '100%'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const L = 36, R = 10, T = 14, B = 24;
  const agora = Date.now();
  const t0 = Math.min(pontos[0].ms, agora - 12 * 36e5);
  const t1 = Math.max(pontos[pontos.length - 1].ms, agora + 12 * 36e5);
  let hmin = Infinity, hmax = -Infinity;
  pontos.forEach((p) => { if (p.ms >= t0 && p.ms <= t1) { hmin = Math.min(hmin, p.h); hmax = Math.max(hmax, p.h); } });
  const padH = Math.max(0.15, (hmax - hmin) * 0.2);
  hmin -= padH; hmax += padH;

  const X = (ms) => L + ((ms - t0) / (t1 - t0)) * (W - L - R);
  const Y = (h) => T + (1 - (h - hmin) / (hmax - hmin)) * (H - T - B);

  // grade horizontal
  ctx.font = '10px JetBrains Mono, monospace';
  for (let i = 0; i <= 3; i++) {
    const h = hmin + ((hmax - hmin) * i) / 3;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(L, Y(h)); ctx.lineTo(W - R, Y(h)); ctx.stroke();
    ctx.fillStyle = '#8b93b8';
    ctx.fillText(h.toFixed(1) + 'm', 2, Y(h) + 3);
  }
  // marcas de 6h
  ctx.fillStyle = '#8b93b8';
  const start6 = Math.ceil(t0 / 216e5) * 216e5;
  for (let t = start6; t <= t1; t += 216e5) {
    ctx.fillText(hhMs(t), X(t) - 12, H - 8);
  }

  // área + curva
  const grad = ctx.createLinearGradient(0, T, 0, H - B);
  grad.addColorStop(0, 'rgba(139,147,255,.30)');
  grad.addColorStop(1, 'rgba(139,147,255,0)');
  ctx.beginPath();
  let started = false;
  pontos.forEach((p) => {
    if (p.ms < t0 || p.ms > t1) return;
    if (!started) { ctx.moveTo(X(p.ms), Y(p.h)); started = true; }
    else ctx.lineTo(X(p.ms), Y(p.h));
  });
  ctx.strokeStyle = '#8b93ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineTo(X(Math.min(t1, pontos[pontos.length - 1].ms)), Y(hmin));
  ctx.lineTo(X(Math.max(t0, pontos[0].ms)), Y(hmin));
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // extremos
  eventos.forEach((e) => {
    if (e.ms < t0 || e.ms > t1) return;
    ctx.beginPath();
    ctx.arc(X(e.ms), Y(e.h), 4, 0, Math.PI * 2);
    ctx.fillStyle = e.tipo === 'preia' ? '#ffd166' : '#7cc4ff';
    ctx.fill();
    ctx.fillStyle = '#f2f4ff';
    ctx.fillText(hhMs(e.ms), X(e.ms) - 12, Y(e.h) - 8);
  });

  // linha AGORA
  if (agora >= t0 && agora <= t1) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffd166';
    ctx.beginPath(); ctx.moveTo(X(agora), T); ctx.lineTo(X(agora), H - B); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd166';
    ctx.fillText('AGORA', X(agora) - 16, T + 2);
  }
}

// ---------- render ----------
function renderClima(clima) {
  const agora = clima.current;
  const [desc, emoji] = WMO[agora.weather_code] || ['—', '🌊'];
  $('tAr').textContent = Math.round(agora.temperature_2m);
  $('tSens').textContent = Math.round(agora.apparent_temperature);
  $('tCond').textContent = `${emoji} ${desc}`;
  $('tVento').textContent = Math.round(agora.wind_speed_10m);
  $('tUmi').textContent = agora.relative_humidity_2m;
  return { agora, desc };
}

function renderMaresLista(futuras) {
  $('mares').innerHTML = '';
  futuras.slice(0, 6).forEach((e) => {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.className = 'tipo ' + e.tipo;
    s.textContent = e.tipo === 'preia' ? '▲ PREIA' : '▼ BAIXA';
    const q = document.createElement('span');
    q.className = 'quando';
    q.textContent = `${etiquetaMs(e.ms)} · ${hhMs(e.ms)}`;
    const h = document.createElement('span');
    h.className = 'altura';
    h.textContent = `${e.h >= 0 ? '+' : ''}${e.h.toFixed(2)} m`;
    li.append(s, q, h);
    $('mares').appendChild(li);
  });
}

function renderHorasDias(clima, mar) {
  const ht = clima.hourly.time, htemp = clima.hourly.temperature_2m;
  const mt = mar.hourly.time, mw = mar.hourly.wave_height;
  const agoraISO = clima.current.time.slice(0, 13);
  const start = Math.max(0, ht.findIndex((t) => t >= agoraISO));
  $('horas').innerHTML = '';
  for (let k = 0; k < 24 && start + k < ht.length; k++) {
    const d = document.createElement('div');
    d.className = 'hora';
    const hHora = document.createElement('div');
    hHora.textContent = ht[start + k].slice(11, 16);
    const b = document.createElement('b');
    b.textContent = Math.round(htemp[start + k]) + '°';
    const s = document.createElement('span');
    const j = mt.indexOf(ht[start + k]);
    s.textContent = '🌊 ' + (j >= 0 && mw[j] != null ? mw[j].toFixed(1) : '--') + 'm';
    d.append(hHora, b, s);
    $('horas').appendChild(d);
  }

  $('diasBox').innerHTML = '';
  // escala única p/ as barras de amplitude (estilo weather-app)
  const gmax = clima.daily.temperature_2m_max, gmin = clima.daily.temperature_2m_min;
  const lo = Math.min(...gmin) - 1, hi = Math.max(...gmax) + 1;
  clima.daily.time.forEach((dia, i) => {
    const row = document.createElement('div');
    row.className = 'dia';
    const [dd, ee] = WMO[clima.daily.weather_code[i]] || ['—', '🌊'];
    const titulo = i === 0 ? 'Hoje' : etiquetaMs(msDaParede(dia + 'T12:00'));

    const top = document.createElement('div');
    top.className = 'dia-top';
    const st = document.createElement('strong'); st.textContent = titulo;
    const sm = document.createElement('span'); sm.className = 'mono'; sm.textContent = ` ${ee} ${dd}`;
    top.append(st, sm);

    const mid = document.createElement('div');
    mid.className = 'dia-mid';
    const tmin = document.createElement('span'); tmin.className = 'tmin';
    tmin.textContent = Math.round(gmin[i]) + '°';
    const range = document.createElement('div'); range.className = 'range';
    const fill = document.createElement('span');
    const l = ((gmin[i] - lo) / (hi - lo)) * 100, w = ((gmax[i] - gmin[i]) / (hi - lo)) * 100;
    fill.style.left = l.toFixed(1) + '%';
    fill.style.width = Math.max(w, 4).toFixed(1) + '%';
    range.appendChild(fill);
    const tmax = document.createElement('strong'); tmax.className = 'tmax';
    tmax.textContent = Math.round(gmax[i]) + '°';
    mid.append(tmin, range, tmax);

    const sub = document.createElement('div');
    sub.className = 'dia-sub mono';
    sub.textContent = `☔ ${clima.daily.precipitation_probability_max[i] ?? '--'}% · 🌊 ${mar.daily.wave_height_max[i].toFixed(1)}m máx`;

    row.append(top, mid, sub);
    $('diasBox').appendChild(row);
  });
}

// ---------- histórico (back Flask ou localStorage) ----------
// Histórico é EXTRA: nunca pode quebrar o status online do app.
function msCriadoEm(s) { // "2026-09-12 16:45:15" (UTC do SQLite) -> ms
  const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

// dedupe de verdade: compara com a ÚLTIMA salva (back ou local). Mesmo pico+fonte <30min = não salva.
async function jaSalvouRecente(item) {
  const LIM = 18e5, agora = Date.now();
  const igual = (u) => u && u.spot_id === item.spot_id && (agora - msCriadoEm(u.criado_em || u.quando)) < LIM;
  try {
    const r = await fetch(`${BACK_URL}/api/consultas?limit=1`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) { const l = await r.json(); if (igual(l[0])) return true; }
  } catch { /* tenta o local */ }
  try {
    const v = JSON.parse(lerLS('marealta_hist', '[]') || '[]');
    const loc = Array.isArray(v) ? v : [];
    if (igual(loc[0])) return true;
  } catch { /* segue */ }
  return false;
}

async function salvarHistorico(entry) {
  try {
    const item = { ...entry, spot_id: spotAtual.id, spot_nome: spotAtual.nome, quando: new Date().toISOString() };
    if (await jaSalvouRecente(item)) return; // sem flood no histórico
    try {
      const r = await fetch(`${BACK_URL}/api/consultas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(1500),
      });
      if (!r.ok) throw new Error('back respondeu ' + r.status);
    } catch {
      const loc = JSON.parse(lerLS('marealta_hist', '[]') || '[]');
      loc.unshift(item);
      escLS('marealta_hist', JSON.stringify(loc.slice(0, 20)));
    }
    await carregarHistorico();
  } catch {
    /* histórico falhou (DOM/storage): o app segue online com os dados */
  }
}

async function carregarHistorico() {
  const ul = $('hist');
  const msg = $('histOrigem');
  if (!ul || !msg) return; // HTML sem a seção: histórico some, app segue
  ul.innerHTML = '';
  const mostra = (lista, origem) => {
    msg.textContent = origem;
    if (!lista.length) {
      const li = document.createElement('li');
      li.textContent = 'nada por aqui ainda — escolhe um pico 👆';
      ul.appendChild(li);
      return;
    }
    lista.slice(0, 8).forEach((e) => {
      const li = document.createElement('li');
      const tag = e.fonte === 'oficial' ? '⚓ DHN' : e.fonte === 'modelo' ? '🛰️ modelo' : '';
      li.textContent = `${e.spot_nome} · ${e.resumo ?? ''} ${tag}`;
      ul.appendChild(li);
    });
  };
  try {
    const r = await fetch(`${BACK_URL}/api/consultas?limit=8`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) throw new Error();
    mostra(await r.json(), 'salvo no back-end (SQLite) ✅');
  } catch {
    let loc = [];
    try { const v = JSON.parse(lerLS('marealta_hist', '[]') || '[]'); if (Array.isArray(v)) loc = v; } catch { loc = []; }
    mostra(loc, 'back off — só neste navegador (rode api/app.py p/ SQLite)');
  }
}

// ---------- fluxo principal ----------
async function carregar(spot) {
  spotAtual = spot;
  document.querySelectorAll('#picosList .pico').forEach((b) =>
    b.classList.toggle('active', b.dataset.id === spot.id));
  document.querySelectorAll('.seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.f === fonte));
  $('loading').hidden = false;
  $('erro').hidden = true;
  $('conteudo').hidden = true;
  $('statusPill').textContent = '● conectando…';
  $('statusPill').className = 'pill';

  try {
    // clima + mar (sempre) e tábua oficial (se fonte = oficial) em paralelo
    const [rc, rm, of] = await Promise.all([
      fetch(urlClima(spot.lat, spot.lon)),
      fetch(urlMar(spot.lat, spot.lon)),
      fonte === 'oficial' ? buscarOficial(spot).catch((e) => ({ __erro: String(e.message || e) })) : Promise.resolve(null),
    ]);
    if (!rc.ok || !rm.ok) throw new Error(`clima/mar HTTP ${rc.status}/${rm.status}`);
    const clima = await rc.json();
    const mar = await rm.json();
    if (clima.error || mar.error) throw new Error(clima.reason || mar.reason || 'resposta inválida');

    const { agora, desc } = renderClima(clima);
    const hs = $('heroSpot');
    if (hs) hs.textContent = spot.nome.toUpperCase();
    atualizaLinhaPico(spot, Math.round(agora.temperature_2m) + '°', (WMO[agora.weather_code] || ['—', '🌊'])[1]);
    tempsPicos(); // fire-and-forget: completa as outras linhas
    const m = mar.current || {};
    $('tOnda').textContent = m.wave_height != null ? m.wave_height.toFixed(2) : '--';
    $('tMar').textContent = m.sea_surface_temperature != null ? m.sea_surface_temperature.toFixed(1) : '--';
    renderHorasDias(clima, mar);

    let fonteUsada = 'modelo';
    let nivelTxt = '--', resumoNivel = '';

    if (of && !of.__erro) {
      // ===== OFICIAL DHN =====
      fonteUsada = 'oficial';
      const agoraMs = Date.now();
      const ev = of.eventos;
      const { h, tend, prox } = nivelEm(ev, agoraMs);
      nivelTxt = '~' + h.toFixed(2);
      const tendEl = $('tTend');
      if (tend > 0) { tendEl.textContent = '▲ subindo · enchendo'; tendEl.className = 'tend'; }
      else if (tend < 0) { tendEl.textContent = '▼ descendo · vazando'; tendEl.className = 'tend down'; }
      else { tendEl.textContent = '＝ estável (estaca)'; tendEl.className = 'tend'; }
      $('tProx').textContent = prox
        ? `${prox.tipo === 'preia' ? 'preia-mar' : 'baixa-mar'} ${etiquetaMs(prox.ms)} ${hhMs(prox.ms)}`
        : '--';

      const futuras = ev.filter((e) => e.ms >= agoraMs - 36e5);
      renderMaresLista(futuras);

      const nomePorto = of.info.harbor_name.split(' (')[0].toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
      $('fonteInfo').textContent = `${nomePorto} · carta ${of.info.card} · DHN ${of.info.year}`;
      $('avisoFonte').textContent =
        `Tábua oficial DHN/Marinha do Brasil via tabuamare.api.br (porto mais próximo: ${nomePorto}). ` +
        `Horários locais (UTC-3), alturas na carta do porto. Nível "agora" (~) interpolado entre eventos. Não usar para navegação. ⚓`;

      // gráfico: interpola a cada 30min dentro da cobertura
      const pts = [];
      const tIni = Math.max(agoraMs - 12 * 36e5, ev[0].ms);
      const tFim = Math.min(agoraMs + 36 * 36e5, ev[ev.length - 1].ms);
      for (let t = tIni; t <= tFim; t += 18e5) pts.push({ ms: t, h: nivelEm(ev, t).h });
      desenharGrafico(pts, ev);
      resumoNivel = `nível ~${h.toFixed(2)}m`;
    } else {
      // ===== MODELO (fallback) =====
      if (of && of.__erro) {
        $('fonteInfo').textContent = `oficial indisponível (${of.__erro}) — usando modelo`;
      } else {
        $('fonteInfo').textContent = 'Open-Meteo MFWAM · sem chave';
      }
      const times = mar.hourly.time, niveis = mar.hourly.sea_level_height_msl;
      const mares = acharMares(times, niveis);
      $('tNivel').textContent = m.sea_level_height_msl != null ? m.sea_level_height_msl.toFixed(2) : '--';

      const idx = times.findIndex((t) => t >= agora.time.slice(0, 13));
      const i0 = idx > 0 ? idx : 1;
      const diff = (niveis[i0] ?? 0) - (niveis[i0 - 1] ?? 0);
      const tendEl = $('tTend');
      if (diff > 0.02) { tendEl.textContent = '▲ subindo · enchendo'; tendEl.className = 'tend'; }
      else if (diff < -0.02) { tendEl.textContent = '▼ descendo · vazando'; tendEl.className = 'tend down'; }
      else { tendEl.textContent = '＝ estável (estaca)'; tendEl.className = 'tend'; }

      const futuras = mares.filter((e) => e.ms >= msDaParede(agora.time.slice(0, 13) + ':00'));
      const prox = futuras[0];
      $('tProx').textContent = prox
        ? `${prox.tipo === 'preia' ? 'preia-mar' : 'baixa-mar'} ${etiquetaMs(prox.ms)} ${hhMs(prox.ms)}`
        : '--';
      renderMaresLista(futuras);
      $('avisoFonte').textContent =
        'Maré estimada por modelo numérico (Open-Meteo/MFWAM, resolução ~8km) — pode divergir da tábua oficial. Não usar para navegação. ⚓';

      const pts = times.map((t, i) => ({ ms: msDaParede(t), h: niveis[i] })).filter((p) => p.h != null);
      desenharGrafico(pts, mares);
      resumoNivel = `nível ${m.sea_level_height_msl?.toFixed(2) ?? '--'}m (modelo)`;
    }

    if (fonteUsada === 'oficial') $('tNivel').textContent = nivelTxt;
    $('loading').hidden = true;
    $('conteudo').hidden = false;
    // redesenha com a largura real (antes o container estava hidden)
    if (ultimoGrafico) desenharGrafico(ultimoGrafico.pontos, ultimoGrafico.eventos);
    $('statusPill').textContent = fonteUsada === 'oficial' ? '● online · DHN' : '● online · modelo';
    $('statusPill').className = 'pill ok';

    await salvarHistorico({
      fonte: fonteUsada,
      temp_ar: agora.temperature_2m,
      onda_m: m.wave_height ?? null,
      nivel_mar: null,
      resumo: `${desc}, ${Math.round(agora.temperature_2m)}°C, onda ${m.wave_height?.toFixed(2) ?? '--'}m, ${resumoNivel}`,
    });
  } catch (e) {
    $('loading').hidden = true;
    $('erro').hidden = false;
    $('erroMsg').textContent = String((e && e.message) || e);
    $('statusPill').textContent = '● offline';
    $('statusPill').className = 'pill err';
  }
}

// ---------- boot ----------
function relogio() {
  try {
    $('clock').textContent = new Date().toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  } catch { /* mantém --:-- */ }
}
relogio();
setInterval(relogio, 10000);

SPOTS.forEach((s) => {
  const b = document.createElement('button');
  b.className = 'pico';
  b.dataset.id = s.id;
  const nome = document.createElement('span');
  nome.className = 'pico-nome';
  nome.textContent = s.nome;
  const ico = document.createElement('span');
  ico.className = 'pico-ico';
  ico.textContent = '🌊';
  const tmp = document.createElement('span');
  tmp.className = 'pico-temp';
  tmp.textContent = '--°';
  const go = document.createElement('span');
  go.className = 'pico-go';
  go.textContent = '›';
  b.append(nome, ico, tmp, go);
  b.addEventListener('click', () => carregar(s));
  $('picosList').appendChild(b);
});

function atualizaLinhaPico(spot, tempTxt, icone) {
  const row = document.querySelector(`#picosList [data-id="${spot.id}"]`);
  if (!row) return;
  const t = row.querySelector('.pico-temp');
  const ic = row.querySelector('.pico-ico');
  if (t && tempTxt) t.textContent = tempTxt;
  if (ic && icone) ic.textContent = icone;
}

// temps ao vivo pros outros picos (só Open-Meteo: barato e sem chave)
async function tempsPicos() {
  await Promise.all(SPOTS.filter((s) => s.id !== spotAtual.id).map(async (s) => {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(TZ)}&forecast_days=1`);
      if (!r.ok) return;
      const j = await r.json();
      atualizaLinhaPico(s, Math.round(j.current.temperature_2m) + '°', (WMO[j.current.weather_code] || ['—', '🌊'])[1]);
    } catch { /* linha fica com --° */ }
  }));
}

document.querySelectorAll('.seg button').forEach((b) =>
  b.addEventListener('click', () => { fonte = b.dataset.f; carregar(spotAtual); }));

$('retry').addEventListener('click', () => carregar(spotAtual));
const btnLimpar = $('limparHist');
if (btnLimpar) btnLimpar.addEventListener('click', async () => {
  escLS('marealta_hist', '');
  // limpa de verdade: apaga também no back (se estiver ao alcance)
  try { await fetch(`${BACK_URL}/api/consultas`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }); } catch { /* back off: limpa só o local */ }
  try { await carregarHistorico(); } catch { /* segue */ }
});

// URL do back-end configurável (p/ apontar pro Render quando online)
const campoBackend = $('backendUrl');
if (campoBackend) campoBackend.value = lerLS('marealta_backend', BACK_URL_PADRAO);
const btnBackend = $('salvarBackend');
if (btnBackend) btnBackend.addEventListener('click', () => {
  const v = campoBackend.value.trim().replace(/\/$/, '');
  escLS('marealta_backend', v);
  location.reload(); // recarrega já apontando pro back novo
});

// tabs do app: destaca conforme a seção visível
const tabLinks = document.querySelectorAll('.tabs a');
const tabIO = new IntersectionObserver((ents) => {
  ents.forEach((en) => {
    if (en.isIntersecting) {
      tabLinks.forEach((a) => a.classList.toggle('active', a.dataset.t === en.target.id));
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
['agora', 'mare', 'dias', 'hist'].forEach((id) => {
  const s = document.getElementById(id);
  if (s) tabIO.observe(s);
});

window.addEventListener('resize', () => {
  if (ultimoGrafico && !$('conteudo').hidden) {
    desenharGrafico(ultimoGrafico.pontos, ultimoGrafico.eventos);
  }
});

// PWA: registra o service worker (só em http/https, não em file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

carregar(SPOTS[0]);
