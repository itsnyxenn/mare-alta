/* ============================================================
   MARÉ ALTA v1.0 — clima + maré de Recife/Olinda
   Front puro: fetch nas APIs Open-Meteo (grátis, sem chave)
   - Forecast: ar (temp, vento, umidade, condição)
   - Marine: ondas, temp da água, nível do mar (p/ maré)
   Histórico: tenta o back Flask, senão usa localStorage.
   ============================================================ */

const SPOTS = [
  { id: 'porto',     nome: 'Porto do Recife',   lat: -8.058, lon: -34.871 },
  { id: 'boaviagem', nome: 'Boa Viagem',        lat: -8.120, lon: -34.900 },
  { id: 'olinda',    nome: 'Olinda · B. Novo',  lat: -8.008, lon: -34.850 },
  { id: 'janga',     nome: 'Janga · Paulista',  lat: -7.940, lon: -34.830 },
];

const BACK_URL = 'http://127.0.0.1:5000'; // back Flask (opcional)
const TZ = 'America/Recife';

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

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

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

// "2026-09-12T14:00" -> "14:00" | etiqueta hoje/amanhã/data
function hh(iso) { return iso.slice(11, 16); }
function etiquetaDia(iso) {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: TZ });
  const d = new Date(iso + ':00-03:00').toLocaleDateString('pt-BR', { timeZone: TZ });
  if (d === hoje) return 'hoje';
  const amanha = new Date(Date.now() + 864e5).toLocaleDateString('pt-BR', { timeZone: TZ });
  if (d === amanha) return 'amanhã';
  return d.slice(0, 5);
}

// Acha preia-mares e baixa-mares na curva do nível do mar (máximos/mínimos locais,
// com separação mínima de 4h e alternância preia/baixa). Resolução: ±1h.
function acharMares(times, niveis) {
  const out = [];
  for (let i = 1; i < times.length - 1; i++) {
    const a = niveis[i - 1], b = niveis[i], c = niveis[i + 1];
    if (b == null || a == null || c == null) continue;
    let tipo = null;
    if (b > a && b >= c) tipo = 'preia';
    else if (b < a && b <= c) tipo = 'baixa';
    if (!tipo) continue;

    const prev = out[out.length - 1];
    if (prev && prev.tipo === tipo) {
      // mesmo tipo em sequência: fica só com o mais extremo
      const melhor = tipo === 'preia' ? b > prev.h : b < prev.h;
      if (melhor) out[out.length - 1] = { time: times[i], h: b, tipo };
      continue;
    }
    if (prev) {
      const gapH = (new Date(times[i]) - new Date(prev.time)) / 36e5;
      if (gapH < 4) continue;
    }
    out.push({ time: times[i], h: b, tipo });
  }
  return out;
}

// ---------- render ----------
function renderTudo(spot, clima, mar) {
  const agora = clima.current;
  const [desc, emoji] = WMO[agora.weather_code] || ['—', '🌊'];

  $('tAr').textContent = Math.round(agora.temperature_2m);
  $('tSens').textContent = Math.round(agora.apparent_temperature);
  $('tCond').textContent = `${emoji} ${desc}`;
  $('tVento').textContent = Math.round(agora.wind_speed_10m);
  $('tUmi').textContent = agora.relative_humidity_2m;

  const m = mar.current || {};
  $('tOnda').textContent = m.wave_height != null ? m.wave_height.toFixed(2) : '--';
  $('tMar').textContent = m.sea_surface_temperature != null ? m.sea_surface_temperature.toFixed(1) : '--';
  $('tNivel').textContent = m.sea_level_height_msl != null ? m.sea_level_height_msl.toFixed(2) : '--';

  const times = mar.hourly.time;
  const niveis = mar.hourly.sea_level_height_msl;
  const mares = acharMares(times, niveis);

  // tendência: compara nível atual com 1h atrás
  const idxAgora = times.findIndex(t => t >= agora.time.slice(0, 13));
  const i0 = idxAgora > 0 ? idxAgora : 1;
  const diff = (niveis[i0] ?? 0) - (niveis[i0 - 1] ?? 0);
  const tend = $('tTend');
  if (diff > 0.02) { tend.textContent = '▲ subindo · enchendo'; tend.className = 'tend'; }
  else if (diff < -0.02) { tend.textContent = '▼ descendo · vazando'; tend.className = 'tend down'; }
  else { tend.textContent = '＝ estável (estaca)'; tend.className = 'tend'; }

  const futuras = mares.filter(e => e.time >= agora.time.slice(0, 13));
  const prox = futuras[0];
  $('tProx').textContent = prox
    ? `${prox.tipo === 'preia' ? 'preia-mar' : 'baixa-mar'} ${etiquetaDia(prox.time)} ${hh(prox.time)}`
    : '--';

  // tábua: próximas 6
  $('mares').innerHTML = '';
  futuras.slice(0, 6).forEach(e => {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.className = 'tipo ' + e.tipo;
    s.textContent = e.tipo === 'preia' ? '▲ PREIA' : '▼ BAIXA';
    const q = document.createElement('span');
    q.className = 'quando';
    q.textContent = `${etiquetaDia(e.time)} · ${hh(e.time)}`;
    const h = document.createElement('span');
    h.className = 'altura';
    h.textContent = `${e.h >= 0 ? '+' : ''}${e.h.toFixed(2)} m`;
    li.append(s, q, h);
    $('mares').appendChild(li);
  });

  // próximas 24h: temp + onda
  const ht = clima.hourly.time, htemp = clima.hourly.temperature_2m;
  const mt = mar.hourly.time, mw = mar.hourly.wave_height;
  const start = ht.findIndex(t => t >= agora.time.slice(0, 13));
  $('horas').innerHTML = '';
  for (let k = 0; k < 24 && start + k < ht.length; k++) {
    const d = document.createElement('div');
    d.className = 'hora';
    const hHora = document.createElement('div'); hHora.textContent = hh(ht[start + k]);
    const b = document.createElement('b'); b.textContent = Math.round(htemp[start + k]) + '°';
    const s = document.createElement('span');
    const j = mt.indexOf(ht[start + k]);
    s.textContent = '🌊 ' + (j >= 0 ? mw[j].toFixed(1) : '--') + 'm';
    d.append(hHora, b, s);
    $('horas').appendChild(d);
  }

  // próximos dias
  $('dias').innerHTML = '';
  clima.daily.time.forEach((dia, i) => {
    const row = document.createElement('div');
    row.className = 'dia';
    const [dd, ee] = WMO[clima.daily.weather_code[i]] || ['—', '🌊'];
    const nome = document.createElement('div');
    nome.innerHTML = `<strong>${i === 0 ? 'Hoje' : etiquetaDia(dia + 'T12:00')}</strong> <span class="mono">${ee} ${dd}</span>`;
    const t = document.createElement('div');
    t.innerHTML = `<strong>${Math.round(clima.daily.temperature_2m_max[i])}°</strong> <span class="mono">/ ${Math.round(clima.daily.temperature_2m_min[i])}°</span>`;
    const ch = document.createElement('div');
    ch.className = 'mono';
    ch.textContent = `☔ ${clima.daily.precipitation_probability_max[i] ?? '--'}%`;
    const on = document.createElement('div');
    on.className = 'mono';
    on.textContent = `🌊 ${mar.daily.wave_height_max[i].toFixed(1)}m máx`;
    row.append(nome, t, ch, on);
    $('dias').appendChild(row);
  });

  return {
    temp_ar: agora.temperature_2m,
    onda_m: m.wave_height ?? null,
    nivel_mar: m.sea_level_height_msl ?? null,
    resumo: `${desc}, ${Math.round(agora.temperature_2m)}°C, onda ${m.wave_height?.toFixed(2) ?? '--'}m`,
  };
}

// ---------- histórico (back Flask ou localStorage) ----------
async function salvarHistorico(entry) {
  const item = { ...entry, spot_id: spotAtual.id, spot_nome: spotAtual.nome, quando: new Date().toISOString() };
  try {
    const r = await fetch(`${BACK_URL}/api/consultas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) throw new Error('back respondeu ' + r.status);
  } catch {
    const loc = JSON.parse(localStorage.getItem('marealta_hist') || '[]');
    loc.unshift(item);
    localStorage.setItem('marealta_hist', JSON.stringify(loc.slice(0, 20)));
  }
  await carregarHistorico();
}

async function carregarHistorico() {
  const ul = $('hist');
  ul.innerHTML = '';
  try {
    const r = await fetch(`${BACK_URL}/api/consultas?limit=8`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) throw new Error();
    const lista = await r.json();
    $('histOrigem').textContent = 'salvo no back-end (SQLite) ✅';
    if (!lista.length) ul.innerHTML = '<li class="mono">nada por aqui ainda — escolhe um pico 👆</li>';
    lista.forEach(e => {
      const li = document.createElement('li');
      li.textContent = `${e.spot_nome} · ${e.resumo ?? ''}`;
      ul.appendChild(li);
    });
    return;
  } catch { /* cai pro local */ }
  const loc = JSON.parse(localStorage.getItem('marealta_hist') || '[]');
  $('histOrigem').textContent = 'back off — salvo só neste navegador (rode api/app.py p/ SQLite)';
  if (!loc.length) ul.innerHTML = '<li class="mono">nada por aqui ainda — escolhe um pico 👆</li>';
  loc.slice(0, 8).forEach(e => {
    const li = document.createElement('li');
    li.textContent = `${e.spot_nome} · ${e.resumo ?? ''}`;
    ul.appendChild(li);
  });
}

// ---------- fluxo principal ----------
async function carregar(spot) {
  spotAtual = spot;
  document.querySelectorAll('#chips button').forEach(b =>
    b.classList.toggle('active', b.dataset.id === spot.id));
  $('loading').hidden = false;
  $('erro').hidden = true;
  $('conteudo').hidden = true;
  $('statusPill').textContent = '● conectando…';
  $('statusPill').className = 'pill';

  try {
    const [rc, rm] = await Promise.all([fetch(urlClima(spot.lat, spot.lon)), fetch(urlMar(spot.lat, spot.lon))]);
    if (!rc.ok || !rm.ok) throw new Error(`HTTP ${rc.status}/${rm.status}`);
    const clima = await rc.json();
    const mar = await rm.json();
    if (clima.error || mar.error) throw new Error((clima.reason || mar.reason || 'resposta inválida'));

    const resumo = renderTudo(spot, clima, mar);
    $('loading').hidden = true;
    $('conteudo').hidden = false;
    $('statusPill').textContent = '● online';
    $('statusPill').className = 'pill ok';
    await salvarHistorico(resumo);
  } catch (e) {
    $('loading').hidden = true;
    $('erro').hidden = false;
    $('erroMsg').textContent = String(e.message || e);
    $('statusPill').textContent = '● offline';
    $('statusPill').className = 'pill err';
  }
}

// ---------- boot ----------
function relogio() {
  try {
    $('clock').textContent = new Date().toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  } catch { /* sem TZ? mantém --:-- */ }
}
relogio();
setInterval(relogio, 10000);

SPOTS.forEach(s => {
  const b = document.createElement('button');
  b.textContent = s.nome;
  b.dataset.id = s.id;
  b.addEventListener('click', () => carregar(s));
  $('chips').appendChild(b);
});

$('retry').addEventListener('click', () => carregar(spotAtual));
$('limparHist').addEventListener('click', async () => {
  localStorage.removeItem('marealta_hist');
  await carregarHistorico();
});

carregar(SPOTS[0]);
