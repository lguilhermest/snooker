(function () {
  'use strict';
  const B = window.Bracket;
  const KEY = 'chave-de-sinuca:v1';
  const $ = (id) => document.getElementById(id);

  let state = null;
  let shared = false;
  let tab = 'chave';

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter((x) => x !== null && x !== undefined && x !== false));
    return n;
  }

  /* ---------- armazenamento e compartilhamento ---------- */
  function load() {
    try { return B.sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return null; }
  }
  let saveFailed = false;
  function save() {
    if (shared) return;
    try {
      if (state) localStorage.setItem(KEY, JSON.stringify(state));
      else localStorage.removeItem(KEY);
    } catch (e) {
      if (!saveFailed) toast('Este navegador não está guardando os dados. Use "Salvar arquivo".');
      saveFailed = true;
    }
  }
  function encode(obj) {
    let bin = '';
    new TextEncoder().encode(JSON.stringify(obj)).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(text) {
    try {
      const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
      return B.sanitize(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
    } catch (e) { return null; }
  }

  let toastTimer;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
  }

  /* Pergunta em diálogo próprio. onOk pode devolver uma mensagem de erro. */
  function ask({ title, text, ok, value, onOk }) {
    $('da-title').textContent = title;
    $('da-text').textContent = text || '';
    $('da-text').hidden = !text;
    $('da-input').hidden = value === undefined;
    $('da-input').value = value || '';
    $('da-ok').textContent = ok;
    $('da-error').hidden = true;
    $('da-form').onsubmit = (e) => {
      const err = onOk($('da-input').value);
      if (err) {
        e.preventDefault();
        $('da-error').textContent = err;
        $('da-error').hidden = false;
      }
    };
    $('dlg-ask').showModal();
    if (value !== undefined) $('da-input').select();
  }

  /* ---------- textos ---------- */
  const phase = (m) => (m.br === 'W' ? 'Vencedores' : m.br === 'L' ? 'Repescagem' : 'Final');
  function roundName(r, m) {
    if (m.br === 'G') return m.r === 1 ? 'Final' : 'Segunda final';
    const total = m.br === 'W' ? r.struct.k : r.struct.lRounds;
    if (m.r === total) return m.br === 'W' ? 'Final dos vencedores' : 'Final da repescagem';
    if (m.br === 'W' && m.r === total - 1) return 'Semifinal';
    const shown = [...new Set(r.matches.filter((x) => x.br === m.br && !x.empty).map((x) => x.r))];
    return `${shown.indexOf(m.r) + 1}ª rodada`;
  }
  const boText = (n) => (n === 1 ? '1 partida' : `Melhor de ${n}`);
  function slotText(r, m, i) {
    if (m.byeSlot[i]) return 'W.O.';
    const p = m.p[i];
    if (p !== null && p >= 0) return state.players[p];
    if (m.id === 'G2-0') return 'Se necessário';
    const src = B.source(r.struct, m.from[i]);
    if (!src.m) return '';
    return `${src.out === 'w' ? 'Vencedor' : 'Perdedor'} do jogo ${r.struct.byId[src.m].number}`;
  }

  /* ---------- ficha de jogo ---------- */
  const ball = (m) => (m.bye ? el('span', { class: 'wo-mark' }, 'W.O.') : el('span', { class: `ball ${m.br}` }, String(m.number)));
  function matchCard(r, m, withContext) {
    const rows = [0, 1].map((i) => {
      const known = m.p[i] !== null && !m.byeSlot[i];
      const win = known && m.winner === m.p[i];
      let sc = '';
      if (m.s && !m.wo) sc = String(m.s[i]);
      else if (m.wo) sc = win ? 'V' : 'WO';
      else if (m.bye && win) sc = 'V';
      return el('span', { class: `row${win ? ' win' : ''}${m.done && !win ? ' out' : ''}` },
        el('span', { class: `nm${known ? '' : ' tbd'}`, title: slotText(r, m, i) }, slotText(r, m, i)),
        el('span', { class: 'sc' }, sc));
    });
    const live = m.status === 'ready' && m.mesa;
    return el('button', {
      type: 'button',
      class: `match ${m.status}${live ? ' live' : ''}`,
      disabled: shared || !(m.status === 'ready' || m.status === 'done'),
      'aria-label': m.bye ? `${phase(m)}: ${slotText(r, m, m.byeSlot[0] ? 1 : 0)} avança por W.O. automático` : `Jogo ${m.number}, ${phase(m)}: ${slotText(r, m, 0)} contra ${slotText(r, m, 1)}${m.s ? `, ${m.wo ? 'W.O.' : `${m.s[0]} a ${m.s[1]}`}` : ''}`,
      onclick: () => openMatch(m.id),
    }, ball(m), el('span', { class: 'rows' }, ...rows),
    live ? el('span', { class: 'mesa-tag' }, `Mesa ${m.mesa}`) : null,
    withContext ? el('span', { class: 'ctx' }, `${phase(m) === roundName(r, m) ? '' : `${phase(m)}, `}${roundName(r, m).toLowerCase()}. ${boText(B.bestOf(state, m))}.`.replace(/^./, (c) => c.toUpperCase())) : null);
  }

  /* ---------- chave ---------- */
  const W = 228, H = 59, GAP_X = 44, ROW = 78, HEAD = 64;

  /* Posiciona uma metade da chave. Vagas sem ninguém dos dois lados somem. */
  function layout(r, br) {
    const vis = r.matches.filter((m) => m.br === br && !m.empty);
    const rounds = [...new Set(vis.map((m) => m.r))].sort((a, b) => a - b);
    const pos = {};
    const links = [];
    let next = 0;
    const feeders = (m) => m.from.filter((s) => s.m && s.out === 'w')
      .map((s) => r.byId[s.m]).filter((f) => f.br === br && !f.empty);
    (function place(m) {
      const fs = feeders(m);
      fs.forEach(place);
      const ys = fs.map((f) => pos[f.id].y);
      const y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : next++ * ROW;
      pos[m.id] = { x: rounds.indexOf(m.r) * (W + GAP_X), y };
      fs.forEach((f) => links.push([f.id, m.id]));
    })(vis[vis.length - 1]);
    return { vis, rounds, pos, links, height: next * ROW, cols: rounds.length };
  }

  function renderBoard(r) {
    const board = $('board');
    const w = layout(r, 'W');
    const l = r.struct.lRounds ? layout(r, 'L') : null;
    const lTop = HEAD + w.height + 24;
    const height = l ? lTop + HEAD + l.height : HEAD + w.height;
    const gx = Math.max(w.cols, l ? l.cols : 0) * (W + GAP_X);
    const showG2 = state.reset;
    const width = gx + W + (showG2 ? W + GAP_X : 0);
    const pos = {};
    const nodes = [];

    const half = (data, top, title) => {
      nodes.push(el('h2', { style: `left:0;top:${top}px` }, title));
      data.rounds.forEach((rd, c) => {
        const m = data.vis.find((x) => x.r === rd);
        nodes.push(el('h3', { style: `left:${c * (W + GAP_X)}px;top:${top + 34}px` }, `${roundName(r, m)}, ${boText(B.bestOf(state, m)).toLowerCase()}`));
      });
      data.vis.forEach((m) => { pos[m.id] = { x: data.pos[m.id].x, y: top + HEAD + data.pos[m.id].y }; });
    };
    half(w, 0, 'Chave dos vencedores');
    if (l) half(l, lTop, 'Repescagem');

    const wf = `W${r.struct.k}-0`;
    const lf = `L${r.struct.lRounds}-0`;
    const gy = l ? (pos[wf].y + pos[lf].y) / 2 : pos[wf].y;
    pos['G1-0'] = { x: gx, y: gy };
    nodes.push(el('h2', { style: `left:${gx}px;top:${gy - 62}px` }, 'Final'));
    nodes.push(el('h3', { style: `left:${gx}px;top:${gy - 28}px` }, boText(state.bo.f)));
    if (showG2) {
      pos['G2-0'] = { x: gx + W + GAP_X, y: gy };
      nodes.push(el('h3', { style: `left:${gx + W + GAP_X}px;top:${gy - 28}px` }, 'Segunda final, se o invicto perder'));
    }

    const links = [...w.links, [wf, 'G1-0']];
    if (l) links.push(...l.links, [lf, 'G1-0']);
    if (showG2) links.push(['G1-0', 'G2-0']);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('aria-hidden', 'true');
    for (const [a, b] of links) {
      const x1 = pos[a].x + W, y1 = pos[a].y + H / 2, x2 = pos[b].x, y2 = pos[b].y + H / 2;
      const mid = x2 - GAP_X / 2;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x1} ${y1}H${mid}V${y2}H${x2}`);
      if (r.byId[a].winner !== null) p.setAttribute('class', 'hot');
      svg.append(p);
    }

    const cards = r.matches.filter((m) => pos[m.id]).map((m) => {
      const c = matchCard(r, m);
      c.style.cssText = `left:${pos[m.id].x}px;top:${pos[m.id].y}px;width:${W}px;height:${H}px`;
      return c;
    });
    board.style.width = `${width}px`;
    board.style.height = `${height}px`;
    /* A4 paisagem com margem de 8mm tem cerca de 1060 x 680 px úteis */
    board.style.setProperty('--print-zoom', Math.min(1, 1060 / width, 680 / height).toFixed(3));
    board.replaceChildren(svg, ...nodes, ...cards);
  }

  /* ---------- jogos ---------- */
  function renderGames(r) {
    const ready = r.matches.filter((m) => m.status === 'ready');
    const waiting = ready.filter((m) => !m.mesa);
    const done = r.matches.filter((m) => m.done).reverse();
    const mesas = el('div', { class: 'mesas' });
    for (let t = 1; t <= state.tables; t++) {
      const m = ready.find((x) => x.mesa === t);
      const box = el('div', { class: 'mesa' }, el('h3', {}, m ? `Mesa ${t}, jogo ${m.number}` : `Mesa ${t}`));
      if (m) {
        box.append(el('p', { class: 'vs' }, `${state.players[m.p[0]]} x ${state.players[m.p[1]]}`));
        if (!shared) box.append(el('button', { type: 'button', class: 'btn', onclick: () => openMatch(m.id) }, 'Lançar placar'));
      } else if (waiting.length && !shared) {
        box.append(el('p', {}, 'Livre'), el('button', {
          type: 'button', class: 'btn', onclick: () => { state.mesas[waiting[0].id] = t; commit(); },
        }, `Chamar jogo ${waiting[0].number}`));
      } else box.append(el('p', {}, 'Livre'));
      mesas.append(box);
    }
    const block = (title, items, empty) => [
      el('h2', { class: 'list-title' }, title),
      items.length ? el('div', { class: 'games' }, ...items.map((m) => matchCard(r, m, true))) : el('p', { class: 'empty' }, empty),
    ];
    $('p-jogos').replaceChildren(mesas,
      ...block('Prontos para jogar', waiting, r.champion !== null ? 'Torneio encerrado.' : 'Nenhum jogo na fila. Os próximos dependem dos que estão nas mesas.'),
      ...block('Encerrados', done, 'Os resultados aparecem aqui.'));
  }

  /* ---------- classificação ---------- */
  function renderStandings(r) {
    const rows = B.standings(state, r).map((x) => {
      let where;
      if (x.status === 'champion') where = 'Primeiro lugar';
      else if (x.status === 'out') where = 'Fora do torneio';
      else where = x.losses === 0 ? 'Chave dos vencedores' : 'Repescagem';
      if (x.status === 'out' && x.place === 2) where = 'Segundo lugar';
      const place = x.place === null ? '' : x.place === x.until ? `${x.place}º` : `${x.place}º a ${x.until}º`;
      const lives = el('span', { class: 'lives', role: 'img', 'aria-label': `${x.losses} ${x.losses === 1 ? 'derrota' : 'derrotas'}` },
        el('i', { class: x.losses >= 1 ? '' : 'off' }), el('i', { class: x.losses >= 2 ? '' : 'off' }));
      return el('tr', { class: x.status === 'out' ? 'gone' : '' },
        el('td', { class: 'n' }, place),
        el('td', {}, el('span', { class: 'name' }, x.name),
          shared ? null : el('button', { type: 'button', class: 'link', 'aria-label': `Corrigir nome de ${x.name}`, onclick: () => rename(x.p) }, 'Corrigir nome')),
        el('td', {}, where),
        el('td', { class: 'n' }, String(x.wins)),
        el('td', { class: 'n' }, lives, String(x.losses)));
    });
    $('p-geral').replaceChildren(el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { class: 'n' }, 'Lugar'), el('th', {}, 'Jogador'), el('th', {}, 'Situação'), el('th', { class: 'n', title: 'Vitórias', 'aria-label': 'Vitórias' }, 'V'), el('th', { class: 'n', title: 'Derrotas', 'aria-label': 'Derrotas' }, 'D'))),
      el('tbody', {}, ...rows))));
  }

  function rename(p) {
    ask({
      title: 'Corrigir nome', ok: 'Salvar nome', value: state.players[p],
      onOk: (v) => {
        const name = v.replace(/\s+/g, ' ').trim();
        if (!name) return 'Digite um nome.';
        const players = state.players.slice();
        players[p] = name;
        if (B.duplicates(players).length) return 'Já existe um jogador com esse nome.';
        state = { ...state, players };
        commit();
      },
    });
  }

  /* ---------- placar ---------- */
  function openMatch(id) {
    const m = B.resolve(state).byId[id];
    const t = B.target(state, m);
    const draft = { s: m.s ? m.s.slice() : [0, 0], wo: m.wo ? (m.winner === m.p[0] ? 0 : 1) : null, mesa: m.mesa || 0 };
    const r = B.resolve(state);
    $('dm-ball').className = `ball ${m.br}`;
    $('dm-ball').textContent = m.number;
    $('dm-title').textContent = roundName(r, m);
    $('dm-sub').textContent = t === 1 ? 'Partida única' : `${boText(B.bestOf(state, m))}: vence quem fizer ${t}`;

    const view = [0, 1].map((i) => {
      const out = el('output', {});
      const bump = (d) => { draft.s[i] += d; draft.wo = null; paint(); };
      const name = state.players[m.p[i]];
      const minus = el('button', { type: 'button', 'aria-label': `Tirar partida de ${name}`, onclick: () => bump(-1) }, '−');
      const plus = el('button', { type: 'button', 'aria-label': `Somar partida para ${name}`, onclick: () => bump(1) }, '+');
      const wo = el('input', { type: 'checkbox', id: `dm-wo${i}`, onchange: (e) => { draft.wo = e.target.checked ? i : null; draft.s = [0, 0]; paint(); } });
      const box = el('div', { class: 'pl' }, el('span', { class: 'name' }, name),
        el('label', { class: 'wo' }, wo, 'Vence por W.O.'), el('div', { class: 'step' }, minus, out, plus));
      return { out, minus, plus, wo, box };
    });
    $('dm-players').replaceChildren(view[0].box, view[1].box);

    const taken = new Set(Object.entries(state.mesas).filter(([k]) => k !== id).map(([, v]) => v));
    $('dm-mesa').replaceChildren(el('option', { value: '0' }, 'Nenhuma'),
      ...Array.from({ length: state.tables }, (_, i) => i + 1).filter((n) => !taken.has(n)).map((n) => el('option', { value: String(n) }, String(n))));
    $('dm-mesa').value = String(draft.mesa);

    const result = () => {
      if (draft.wo !== null) return { p: m.p.slice(), s: [0, 0], wo: draft.wo };
      if (draft.s[0] + draft.s[1] === 0) return null;
      return { p: m.p.slice(), s: draft.s.slice() };
    };
    function paint() {
      view.forEach((v, i) => {
        const winner = draft.wo !== null ? draft.wo === i : draft.s[i] >= t;
        const over = draft.s[0] >= t || draft.s[1] >= t;
        v.out.textContent = draft.wo === null ? draft.s[i] : winner ? 'V' : '–';
        v.minus.disabled = draft.s[i] <= 0;
        v.plus.disabled = over;
        v.wo.checked = draft.wo === i;
        v.box.classList.toggle('win', winner);
      });
      const finished = draft.wo !== null || Math.max(...draft.s) >= t;
      $('dm-mesa').parentElement.hidden = finished;
      $('dm-save').textContent = finished ? 'Encerrar jogo' : 'Salvar placar';
      const { dropped } = B.setResult(state, id, result());
      $('dm-warn').hidden = !dropped.length;
      $('dm-warn').textContent = dropped.length === 1
        ? 'Salvar apaga 1 resultado que dependia deste jogo.'
        : `Salvar apaga ${dropped.length} resultados que dependiam deste jogo.`;
    }
    $('dm-clear').hidden = !state.results[id];
    $('dm-clear').onclick = () => { draft.s = [0, 0]; draft.wo = null; paint(); };
    $('dm-form').onsubmit = () => {
      state = B.setResult(state, id, result()).state;
      const now = B.resolve(state).byId[id];
      delete state.mesas[id];
      const mesa = Number($('dm-mesa').value);
      if (now.status === 'ready' && mesa) state.mesas[id] = mesa;
      commit();
    };
    paint();
    $('dlg-match').showModal();
  }

  /* ---------- geral ---------- */
  function commit() { save(); render(); }

  function render() {
    const on = !!state;
    $('setup').hidden = on;
    $('event').hidden = !on;
    $('actions').hidden = !on;
    $('shared').hidden = !shared;
    $('btn-new').hidden = shared;
    const title = on ? state.name || 'Torneio de sinuca' : 'Chave de Sinuca';
    $('title').textContent = title;
    document.title = on ? `${title} | Chave de Sinuca` : 'Chave de Sinuca';
    if (!on) { summary(); return; }

    const r = B.resolve(state);
    const done = r.matches.filter((m) => m.done).length;
    const total = 2 * state.players.length - 2 + (r.byId['G2-0'].p[0] !== null ? 1 : 0);
    $('progress').textContent = `${state.players.length} jogadores, ${done} de ${total} jogos encerrados`;
    $('champion').hidden = r.champion === null;
    if (r.champion !== null) {
      $('champion').replaceChildren(el('span', { class: 'ball' }, '1º'),
        el('div', {}, 'Primeiro lugar', el('strong', {}, state.players[r.champion])));
    }
    renderBoard(r);
    renderGames(r);
    renderStandings(r);
    for (const t of ['chave', 'jogos', 'geral']) {
      $(`p-${t}`).hidden = t !== tab;
      $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
      $(`tab-${t}`).tabIndex = t === tab ? 0 : -1;
    }
  }

  /* ---------- cadastro ---------- */
  function check() {
    const names = B.parseNames($('f-players').value);
    const dup = B.duplicates(names);
    if (names.length < B.MIN) return { names, error: `Inclua pelo menos ${B.MIN} jogadores.` };
    if (names.length > B.MAX) return { names, error: `O limite é de ${B.MAX} jogadores. Há ${names.length} na lista.` };
    if (dup.length) return { names, error: `Nome repetido: ${dup.join(', ')}. Use um sobrenome ou apelido para diferenciar.` };
    return { names, error: null };
  }
  function summary() {
    const { names, error } = check();
    const n = names.length;
    $('error').hidden = true;
    if (error) { $('summary').textContent = n < B.MIN ? `${n} ${n === 1 ? 'jogador' : 'jogadores'} na lista.` : error; return; }
    const st = B.build(n);
    const byes = st.size - n;
    const games = $('f-reset').checked ? `${2 * n - 2} ou ${2 * n - 1} jogos` : `${2 * n - 2} jogos`;
    $('summary').textContent = `${n} jogadores, chave de ${st.size}, ${byes === 0 ? 'sem W.O.' : byes === 1 ? '1 W.O. automático na primeira rodada' : `${byes} W.O. automáticos na primeira rodada`}, ${games}.`;
  }

  for (const [id, def] of [['f-bow', 3], ['f-bol', 3], ['f-bof', 5]]) {
    $(id).append(...B.BEST_OF.map((n) => el('option', { value: String(n), selected: n === def }, boText(n))));
  }
  $('form').addEventListener('input', summary);
  $('f-seeds').addEventListener('focus', () => { $('mode-seed').checked = true; });
  $('btn-sample').addEventListener('click', () => {
    $('f-players').value = ['Adriana', 'Bento', 'Cida', 'Dudu', 'Elaine', 'Fábio', 'Guto', 'Helena', 'Ivo', 'Jussara', 'Kleber', 'Lúcia'].join('\n');
    if (!$('f-name').value) $('f-name').value = 'Torneio de exemplo';
    summary();
  });
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { names, error } = check();
    if (error) {
      $('error').textContent = error;
      $('error').hidden = false;
      $('f-players').focus();
      return;
    }
    const mode = document.querySelector('input[name=mode]:checked').value;
    const seeds = Math.max(1, Math.trunc(Number($('f-seeds').value)) || 1);
    state = B.create({
      name: $('f-name').value.trim(),
      players: names,
      keep: mode === 'all' ? 0 : mode === 'list' ? names.length : seeds,
      bo: { w: Number($('f-bow').value), l: Number($('f-bol').value), f: Number($('f-bof').value) },
      reset: $('f-reset').checked,
      tables: Math.min(20, Math.max(1, Math.trunc(Number($('f-tables').value)) || 1)),
    });
    tab = 'chave';
    commit();
    window.scrollTo(0, 0);
  });

  $('btn-import').addEventListener('click', () => $('f-file').click());
  $('f-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data = null;
    try { data = B.sanitize(JSON.parse(await file.text())); } catch (err) { /* tratado abaixo */ }
    if (!data) {
      $('error').textContent = 'Este arquivo não é um torneio salvo por esta página.';
      $('error').hidden = false;
      return;
    }
    state = data;
    commit();
  });

  /* ---------- ações ---------- */
  ['chave', 'jogos', 'geral'].forEach((t, i, all) => {
    $(`tab-${t}`).addEventListener('click', () => { tab = t; render(); });
    $(`tab-${t}`).addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      tab = all[(i + d + all.length) % all.length];
      render();
      $(`tab-${tab}`).focus();
    });
  });
  $('dm-cancel').addEventListener('click', () => $('dlg-match').close());
  $('da-cancel').addEventListener('click', () => $('dlg-ask').close());

  $('btn-share').addEventListener('click', async () => {
    const url = `${location.href.split('#')[0]}#t=${encode(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado. Ele mostra o torneio como está agora.');
    } catch (e) {
      ask({ title: 'Copie o link', ok: 'Fechar', value: '', onOk: () => {} });
      $('da-input').maxLength = 1e6;
      $('da-input').value = url;
      $('da-input').select();
      $('dlg-ask').addEventListener('close', () => { $('da-input').maxLength = 40; }, { once: true });
    }
  });
  $('btn-export').addEventListener('click', () => {
    const slug = (state.name || 'torneio').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'torneio';
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    el('a', { href: url, download: `${slug}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('btn-print').addEventListener('click', () => window.print());
  $('btn-new').addEventListener('click', () => ask({
    title: 'Começar um novo torneio?',
    text: 'O torneio atual sai deste aparelho. Para guardar, use "Salvar arquivo" antes.',
    ok: 'Começar novo',
    onOk: () => {
      $('f-players').value = state.players.join('\n');
      $('f-name').value = '';
      state = null;
      commit();
    },
  }));

  function leaveShared() {
    history.replaceState(null, '', location.pathname + location.search);
    shared = false;
  }
  $('btn-leave').addEventListener('click', () => { leaveShared(); state = load(); render(); });
  $('btn-adopt').addEventListener('click', () => {
    const adopt = () => { leaveShared(); commit(); };
    if (!load()) { adopt(); return; }
    ask({
      title: 'Substituir o torneio deste aparelho?',
      text: 'Já existe um torneio em andamento aqui. Ele será trocado pela cópia compartilhada.',
      ok: 'Substituir',
      onOk: () => { adopt(); },
    });
  });

  function boot() {
    const match = location.hash.match(/^#t=(.+)$/);
    shared = false;
    state = null;
    if (match) {
      state = decode(match[1]);
      shared = !!state;
      if (!state) toast('Este link está incompleto ou inválido.');
    }
    if (!state) state = load();
    render();
  }
  window.addEventListener('hashchange', boot);
  /* Mesmo torneio aberto em duas abas: a outra aba acompanha. */
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || shared || $('dlg-match').open || $('dlg-ask').open) return;
    state = load();
    render();
  });
  boot();
})();
