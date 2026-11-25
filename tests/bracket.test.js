const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/bracket.js');

const make = (n, over = {}) => B.create({
  name: 'T', players: Array.from({ length: n }, (_, i) => `J${i + 1}`),
  keep: n, bo: { w: 3, l: 3, f: 5 }, reset: true, tables: 2, ...over,
});

function play(state, pick) {
  for (;;) {
    const r = B.resolve(state);
    const m = r.matches.find((x) => x.status === 'ready');
    if (!m) return { state, r };
    const t = B.target(state, m);
    const w = pick(m);
    state = B.setResult(state, m.id, { p: m.p, s: w === 0 ? [t, 0] : [0, t] }).state;
  }
}

test('todo tamanho de 2 a 64 termina com um campeão e elimina com 2 derrotas', () => {
  for (let n = B.MIN; n <= B.MAX; n++) {
    for (let run = 0; run < 8; run++) {
      const { state, r } = play(make(n, { keep: 0 }), () => (Math.random() < 0.5 ? 0 : 1));
      assert.notEqual(r.champion, null, `n=${n}`);
      const rows = B.standings(state, r);
      const played = r.matches.filter((m) => m.done).length;
      const g2 = r.byId['G2-0'].done;
      assert.equal(played, 2 * n - 2 + (g2 ? 1 : 0), `jogos n=${n}`);
      rows.forEach((x) => assert.equal(x.losses, x.status === 'champion' ? (g2 ? 1 : 0) : 2, `n=${n}`));
      // colocações cobrem 1..n sem buracos
      let at = 1;
      while (at <= n) {
        const group = rows.filter((x) => x.place === at);
        assert.ok(group.length, `n=${n} lugar ${at}`);
        assert.equal(group.length, group[0].until - at + 1);
        at += group.length;
      }
      r.matches.filter((m) => !m.bye && m.done).forEach((m) => assert.ok(m.p[0] >= 0 && m.p[1] >= 0 && m.p[0] !== m.p[1]));
      assert.deepEqual(B.sanitize(JSON.parse(JSON.stringify(state))), state);
    }
  }
});

test('W.O. automático: sempre um jogador contra ninguém, que avança sozinho', () => {
  for (let n = 2; n <= 64; n++) {
    const r = B.resolve(make(n));
    const first = r.matches.filter((m) => m.id.startsWith('W1-') && m.bye);
    assert.equal(first.length, r.struct.size - n);
    first.forEach((m) => assert.ok(m.winner >= 0));
    r.matches.filter((m) => m.bye).forEach((m) => assert.equal(m.number, null));
  }
});

test('vagas vazias não se enfrentam na primeira rodada', () => {
  for (let n = 2; n <= 64; n++) {
    B.build(n).list.filter((m) => m.id.startsWith('W1-')).forEach((m) => assert.ok(!(m.byeSlot[0] && m.byeSlot[1])));
  }
});

test('sem repetição da final o campeão sai no primeiro jogo', () => {
  const { r } = play(make(8, { reset: false }), (m) => (m.br === 'G' ? 1 : 0));
  assert.equal(r.champion, r.byId['G1-0'].p[1]);
  assert.equal(r.byId['G2-0'].status, 'pending');
});

test('com repetição, a derrota do invicto força o segundo jogo', () => {
  const { r } = play(make(8), (m) => (m.id === 'G1-0' ? 1 : 0));
  assert.equal(r.byId['G2-0'].done, true);
  assert.equal(r.champion, r.byId['G1-0'].p[0]);
});

test('sem revanche cedo na repescagem (chaves cheias de 8 a 64)', () => {
  for (const k of [3, 4, 5, 6]) {
    const st = B.build(1 << k);
    // conjunto de posições iniciais que podem chegar a cada vaga
    const reach = {};
    const of = (ref) => (ref.seed !== undefined ? new Set([ref.seed]) : reach[ref.m]);
    for (const m of st.list) {
      if (m.br === 'G') continue;
      reach[m.id] = new Set([...of(m.from[0]), ...of(m.from[1])]);
      if (m.br !== 'L' || m.r % 2 || m.r === 1) continue;
      const j = m.r / 2;
      if ((1 << (k - 1 - j)) <= j) continue; // já não cabem regiões distintas
      const shared = [...of(m.from[0])].filter((x) => of(m.from[1]).has(x));
      assert.equal(shared.length, 0, `k=${k} ${m.id}`);
    }
  }
});

test('corrigir um resultado descarta só o que dependia dele', () => {
  const { state } = play(make(8), () => 0);
  const m = B.resolve(state).byId['W1-0'];
  const { state: next, dropped } = B.setResult(state, 'W1-0', { p: m.p, s: [0, 2] });
  assert.ok(dropped.length > 0);
  assert.ok(next.results['W1-1'] && next.results['W1-3'] && next.results['W2-1']);
  assert.equal(next.results['W2-0'], undefined);
  // mudar só o placar não derruba nada
  assert.equal(B.setResult(state, 'W1-0', { p: m.p, s: [2, 1] }).dropped.length, 0);
});

test('sorteio mantém cabeças de chave e é uma permutação', () => {
  const o = B.draw(16, 4);
  assert.deepEqual(o.slice(0, 4), [0, 1, 2, 3]);
  assert.deepEqual([...o].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
});

test('leitura de nomes e validação de dados externos', () => {
  assert.deepEqual(B.parseNames('1. Ana\n 2) Beto \n\nCaio  Luz'), ['Ana', 'Beto', 'Caio Luz']);
  assert.deepEqual(B.duplicates(['Ana', 'ana', 'Bia']), ['ana']);
  for (const bad of [null, {}, { v: 1, players: ['a'] }, { v: 1, players: ['a', 'b', 'c'], order: [0, 0, 1], bo: { w: 1, l: 1, f: 1 } }]) {
    assert.equal(B.sanitize(bad), null);
  }
});
