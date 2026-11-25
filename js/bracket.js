/* Motor da dupla eliminatória. Sem DOM: roda no navegador e no Node (testes). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bracket = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BYE = -1;
  const MIN = 2;
  const MAX = 64;
  const BEST_OF = [1, 3, 5, 7, 9, 11, 13, 15];

  /* Ordem clássica: 1 e 2 só se cruzam na final, folgas vão para os primeiros. */
  function seedOrder(size) {
    let order = [0];
    while (order.length < size) {
      const n = order.length * 2;
      order = order.flatMap((s) => [s, n - 1 - s]);
    }
    return order;
  }

  /* Quem cai para a repescagem entra numa posição "i ^ máscara". A máscara de
     cada rodada evita as regiões de onde os adversários já vieram, adiando
     revanches o máximo que o tamanho da chave permite. */
  function dropMasks(k) {
    const masks = [];
    for (let j = 1; j <= k - 1; j++) {
      const c = 1 << (k - 1 - j);
      const used = new Set([0]);
      masks.forEach((m, idx) => used.add(m >> (j - 1 - idx)));
      const options = [c - 1, c >> 1];
      for (let m = 1; m < c; m++) options.push(m);
      const pick = options.find((m) => !used.has(m));
      masks.push(pick === undefined ? 0 : pick);
    }
    return masks;
  }

  function build(n) {
    let k = 1;
    while (1 << k < n) k++;
    const size = 1 << k;
    const seeds = seedOrder(size);
    const list = [];
    const win = (id) => ({ m: id, out: 'w' });
    const lose = (id) => ({ m: id, out: 'l' });
    const add = (br, r, i, from, order) =>
      list.push({ id: `${br}${r}-${i}`, br, r, i, from, order });

    for (let r = 1; r <= k; r++) {
      for (let i = 0; i < size >> r; i++) {
        const from = r === 1
          ? [{ seed: seeds[2 * i] }, { seed: seeds[2 * i + 1] }]
          : [win(`W${r - 1}-${2 * i}`), win(`W${r - 1}-${2 * i + 1}`)];
        add('W', r, i, from, r === 1 ? 0 : 2 * (r - 1) - 0.5);
      }
    }

    const masks = dropMasks(k);
    const lRounds = 2 * (k - 1);
    for (let r = 1; r <= lRounds; r++) {
      const count = size >> (Math.ceil(r / 2) + 1);
      for (let i = 0; i < count; i++) {
        let from;
        if (r === 1) from = [lose(`W1-${2 * i}`), lose(`W1-${2 * i + 1}`)];
        else if (r % 2 === 0) from = [lose(`W${r / 2 + 1}-${i ^ masks[r / 2 - 1]}`), win(`L${r - 1}-${i}`)];
        else from = [win(`L${r - 1}-${2 * i}`), win(`L${r - 1}-${2 * i + 1}`)];
        add('L', r, i, from, r);
      }
    }

    const lChamp = lRounds ? win(`L${lRounds}-0`) : lose(`W${k}-0`);
    add('G', 1, 0, [win(`W${k}-0`), lChamp], 1e6);
    add('G', 2, 0, [{ m: 'G1-0', out: 'a' }, { m: 'G1-0', out: 'b' }], 1e6 + 1);

    list.sort((a, b) => a.order - b.order || a.i - b.i);

    /* Os W.O. automáticos são estruturais: dependem só de n. */
    const byId = {};
    let number = 0;
    for (const m of list) {
      byId[m.id] = m;
      m.byeSlot = m.from.map((ref) => {
        if (ref.seed !== undefined) return ref.seed >= n;
        const src = byId[ref.m];
        if (ref.out === 'w') return src.byeSlot[0] && src.byeSlot[1];
        if (ref.out === 'l') return src.byeSlot[0] || src.byeSlot[1];
        return false;
      });
      m.bye = m.byeSlot[0] || m.byeSlot[1];
      m.empty = m.byeSlot[0] && m.byeSlot[1];
      m.number = m.bye ? null : ++number;
    }
    return { n, k, size, lRounds, list, byId };
  }

  /* Segue uma vaga passando por cima das folgas até o jogo real de origem. */
  function source(struct, ref) {
    while (ref.m) {
      const m = struct.byId[ref.m];
      if (!m.bye || ref.out !== 'w') return ref;
      ref = m.from[m.byeSlot[0] ? 1 : 0];
    }
    return ref;
  }

  function bestOf(state, m) {
    return m.br === 'W' ? state.bo.w : m.br === 'L' ? state.bo.l : state.bo.f;
  }
  const target = (state, m) => (bestOf(state, m) + 1) / 2;

  /* Calcula tudo a partir dos resultados. Um resultado guarda os dois jogadores
     (p); se uma correção anterior mudar quem chegou ali, ele deixa de valer. */
  function resolve(state) {
    const struct = build(state.players.length);
    const byId = {};
    const matches = [];
    const stale = [];

    for (const s of struct.list) {
      const m = { ...s, p: [null, null], s: null, winner: null, loser: null, done: false, wo: false, status: 'pending' };
      byId[m.id] = m;
      matches.push(m);

      if (m.id === 'G2-0') {
        const g1 = byId['G1-0'];
        if (state.reset && g1.done && g1.winner === g1.p[1]) m.p = g1.p.slice();
      } else {
        m.p = m.from.map((ref) => {
          if (ref.seed !== undefined) return ref.seed < state.players.length ? state.order[ref.seed] : BYE;
          return ref.out === 'w' ? byId[ref.m].winner : byId[ref.m].loser;
        });
      }

      const res = state.results[m.id];
      if (m.bye) {
        m.winner = m.byeSlot[0] ? m.p[1] : m.p[0];
        m.loser = BYE;
        m.status = 'bye';
      } else if (m.p[0] !== null && m.p[1] !== null) {
        m.status = 'ready';
        if (res && res.p[0] === m.p[0] && res.p[1] === m.p[1]) {
          m.s = res.s;
          const t = target(state, m);
          let w = null;
          if (res.wo === 0 || res.wo === 1) { w = res.wo; m.wo = true; }
          else if (res.s[0] >= t) w = 0;
          else if (res.s[1] >= t) w = 1;
          if (w !== null) {
            m.done = true;
            m.status = 'done';
            m.winner = m.p[w];
            m.loser = m.p[1 - w];
          }
        } else if (res) stale.push(m.id);
        if (!m.done && state.mesas[m.id]) m.mesa = state.mesas[m.id];
      } else if (res) stale.push(m.id);
    }

    const g1 = byId['G1-0'];
    const g2 = byId['G2-0'];
    const last = g1.done && state.reset && g1.winner === g1.p[1] ? g2 : g1;
    const champion = last.done ? last.winner : null;
    return { struct, matches, byId, stale, champion, runnerUp: last.done ? last.loser : null };
  }

  /* Devolve um novo estado; resultados invalidados são descartados. */
  function setResult(state, id, result) {
    const next = { ...state, results: { ...state.results }, mesas: { ...state.mesas } };
    if (result) next.results[id] = result;
    else delete next.results[id];
    const r = resolve(next);
    r.stale.forEach((x) => delete next.results[x]);
    for (const x of Object.keys(next.mesas)) {
      const m = r.byId[x];
      if (!m || m.status !== 'ready') delete next.mesas[x];
    }
    return { state: next, dropped: r.stale.filter((x) => x !== id) };
  }

  function standings(state, r) {
    const rows = state.players.map((name, p) => ({ p, name, losses: 0, wins: 0, place: null, until: null, status: 'alive' }));
    const lCount = {};
    for (const m of r.matches) {
      if (m.br === 'L' && !m.bye) lCount[m.r] = (lCount[m.r] || 0) + 1;
      if (!m.done) continue;
      rows[m.winner].wins++;
      rows[m.loser].losses++;
    }
    for (const m of r.matches) {
      if (m.br !== 'L' || !m.done) continue;
      let place = 3;
      for (let x = r.struct.lRounds; x > m.r; x--) place += lCount[x] || 0;
      Object.assign(rows[m.loser], { place, until: place + lCount[m.r] - 1, status: 'out' });
    }
    if (r.champion !== null) {
      Object.assign(rows[r.champion], { place: 1, until: 1, status: 'champion' });
      Object.assign(rows[r.runnerUp], { place: 2, until: 2, status: 'out' });
    }
    const key = (x) => (x.place === null ? 0 : x.place);
    return rows.sort((a, b) => key(a) - key(b) || a.losses - b.losses || b.wins - a.wins || a.name.localeCompare(b.name, 'pt-BR'));
  }

  function randomInt(max) {
    const c = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : null;
    if (!c) return Math.floor(Math.random() * max);
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do c.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % max;
  }

  /* keep = quantos do topo da lista ficam fixos como cabeças de chave. */
  function draw(n, keep) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > keep; i--) {
      const j = keep + randomInt(i - keep + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  function parseNames(text) {
    return text.split(/\r?\n/).map((l) => l.replace(/^\s*\d+\s*[.)-]\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
  }

  function duplicates(names) {
    const seen = new Set();
    const dup = new Set();
    names.forEach((n) => {
      const k = n.toLocaleLowerCase('pt-BR');
      if (seen.has(k)) dup.add(n);
      seen.add(k);
    });
    return [...dup];
  }

  function create({ name, players, keep, bo, reset, tables }) {
    return { v: 1, name, players, order: draw(players.length, Math.min(keep, players.length)), bo, reset, tables, results: {}, mesas: {} };
  }

  /* Valida um estado vindo de fora (arquivo ou link). Devolve null se inválido. */
  function sanitize(x) {
    try {
      if (!x || x.v !== 1 || !Array.isArray(x.players)) return null;
      const n = x.players.length;
      if (n < MIN || n > MAX) return null;
      const players = x.players.map((p) => String(p).trim().slice(0, 40));
      if (players.some((p) => !p) || duplicates(players).length) return null;
      const order = x.order;
      if (!Array.isArray(order) || order.length !== n || new Set(order).size !== n) return null;
      if (!order.every((o) => Number.isInteger(o) && o >= 0 && o < n)) return null;
      const bo = {};
      for (const key of ['w', 'l', 'f']) {
        if (!BEST_OF.includes(x.bo[key])) return null;
        bo[key] = x.bo[key];
      }
      const tables = Math.min(20, Math.max(1, Math.trunc(Number(x.tables)) || 1));
      const struct = build(n);
      const state = { v: 1, name: String(x.name || '').slice(0, 60), players, order: order.slice(), bo, reset: !!x.reset, tables, results: {}, mesas: {} };
      for (const m of struct.list) {
        const res = x.results && x.results[m.id];
        if (res && Array.isArray(res.p) && Array.isArray(res.s)) {
          const t = target(state, m);
          const s = [0, 1].map((i) => Math.min(t, Math.max(0, Math.trunc(Number(res.s[i])) || 0)));
          if (s[0] === t && s[1] === t) continue;
          const clean = { p: [res.p[0], res.p[1]], s };
          if (res.wo === 0 || res.wo === 1) clean.wo = res.wo;
          state.results[m.id] = clean;
        }
        const t = x.mesas && x.mesas[m.id];
        if (Number.isInteger(t) && t >= 1 && t <= tables && !Object.values(state.mesas).includes(t)) state.mesas[m.id] = t;
      }
      const r = resolve(state);
      r.stale.forEach((id) => delete state.results[id]);
      for (const id of Object.keys(state.mesas)) if (r.byId[id].status !== 'ready') delete state.mesas[id];
      return state;
    } catch (e) {
      return null;
    }
  }

  return { BYE, MIN, MAX, BEST_OF, seedOrder, dropMasks, build, source, bestOf, target, resolve, setResult, standings, draw, parseNames, duplicates, create, sanitize };
});
