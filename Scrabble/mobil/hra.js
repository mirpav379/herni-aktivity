/* Scrabble (opis) – společná logika desky pro pult i mobily.
   Deska = pole 225 řetězců: '' prázdné, 'A' / 'CH' kámen, malá písmena 'a' / 'ch' = žolík.
   Zásobník = pole kamenů, '?' = žolík.
   Pozice tahu: řádky A–O (shora), sloupce 1–15 (zleva);
   „H8“ = vodorovně od řádku H, sloupce 8; „8H“ = svisle. */
(function () {
  const N = 15, CENTER = 112;
  const ROWS = 'ABCDEFGHIJKLMNO';
  const VOWELS = new Set(['A', 'Á', 'E', 'É', 'Ě', 'I', 'Í', 'O', 'Ó', 'U', 'Ú', 'Ů', 'Y', 'Ý']);

  // prémiová pole: jedna čtvrtina desky, zbytek zrcadlením
  const PREM = (() => {
    const p = Array(N * N).fill('');
    const q = {
      TW: [[0, 0], [0, 7], [7, 0]],
      DW: [[1, 1], [2, 2], [3, 3], [4, 4], [7, 7]],
      TL: [[1, 5], [5, 1], [5, 5]],
      DL: [[0, 3], [3, 0], [2, 6], [6, 2], [3, 7], [7, 3], [6, 6]],
    };
    for (const k in q) for (const [r, c] of q[k]) for (const rr of [r, 14 - r]) for (const cc of [c, 14 - c]) p[rr * N + cc] = k;
    return p;
  })();

  // text souboru s písmeny → { letters: [{ l, n, v }], vals: { A: 1, … } }
  function parseLetters(text) {
    const letters = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const s = line.replace(/\/\/.*$/, '').trim();
      const m = s.match(/^(\S+)\s+(\d+)\s+(\d+)$/);
      if (m) letters.push({ l: m[1].toUpperCase(), n: +m[2], v: +m[3] });
    });
    const vals = {};
    letters.forEach(x => vals[x.l] = x.v);
    return { letters, vals };
  }

  const isBlank = t => !!t && t !== t.toUpperCase();
  const up = t => (t || '').toUpperCase();
  const isVowel = t => VOWELS.has(up(t));
  const cellName = i => ROWS[Math.floor(i / N)] + (i % N + 1);

  function parsePos(pos) {
    const s = String(pos || '').trim().toUpperCase();
    let m = s.match(/^([A-O])(\d{1,2})$/);
    if (m && +m[2] >= 1 && +m[2] <= 15) return { r: ROWS.indexOf(m[1]), c: +m[2] - 1, dir: 'h' };
    m = s.match(/^(\d{1,2})([A-O])$/);
    if (m && +m[1] >= 1 && +m[1] <= 15) return { r: ROWS.indexOf(m[2]), c: +m[1] - 1, dir: 'v' };
    return null;
  }
  const posStr = (r, c, dir) => dir === 'h' ? ROWS[r] + (c + 1) : (c + 1) + ROWS[r];

  // Rozklad textu na kameny; „CH“ může být jeden kámen i C + H → všechny možnosti (CH první)
  function tokenize(word, vals) {
    const w = String(word || '').toUpperCase().replace(/[^A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, '');
    const out = [];
    const go = (i, acc) => {
      if (out.length > 64) return;
      if (i >= w.length) { out.push(acc); return; }
      if (w.substr(i, 2) === 'CH' && vals.CH != null) go(i + 2, acc.concat('CH'));
      go(i + 1, acc.concat(w[i]));
    };
    go(0, []);
    return { word: w, list: out };
  }

  const val = (t, vals) => isBlank(t) ? 0 : (vals[up(t)] || 0);

  // Body jednoho slova (buňky) – prémie platí jen pro nově položené kameny
  function wordScore(cells, get, isNew, vals) {
    let sum = 0, mult = 1;
    for (const i of cells) {
      let v = val(get(i), vals);
      if (isNew(i)) {
        const p = PREM[i];
        if (p === 'DL') v *= 2; else if (p === 'TL') v *= 3;
        else if (p === 'DW') mult *= 2; else if (p === 'TW') mult *= 3;
      }
      sum += v;
    }
    return sum * mult;
  }

  // Spočítá tah: hlavní slovo + všechna křížová slova + bonus za všech 7 kamenů
  function scoreMove(board, placed, dir, cells, vals, bonus) {
    const get = i => placed[i] ?? board[i];
    const isNew = i => placed[i] != null;
    const text = cs => cs.map(i => up(get(i))).join('');
    const words = [{ w: text(cells), s: wordScore(cells, get, isNew, vals), cells }];
    const [dr, dc] = dir === 'h' ? [1, 0] : [0, 1];            // kolmý směr
    for (const k in placed) {
      const i = +k, r0 = Math.floor(i / N), c0 = i % N;
      let r = r0, c = c0;
      while (r - dr >= 0 && c - dc >= 0 && get((r - dr) * N + c - dc)) { r -= dr; c -= dc; }
      const cs = [];
      while (r < N && c < N && get(r * N + c)) { cs.push(r * N + c); r += dr; c += dc; }
      if (cs.length > 1) words.push({ w: text(cs), s: wordScore(cs, get, isNew, vals), cells: cs });
    }
    const n = Object.keys(placed).length;
    const bingo = n === 7 ? (bonus ?? 50) : 0;
    return { words, bingo, score: words.reduce((a, x) => a + x.s, 0) + bingo };
  }

  // kombinace k prvků z pole
  function combos(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [h, ...t] = arr;
    return combos(t, k - 1).map(x => [h, ...x]).concat(combos(t, k));
  }

  function placeTokens(board, rack, p, toks, vals, bonus) {
    const { r, c, dir } = p;
    const [dr, dc] = dir === 'h' ? [0, 1] : [1, 0];
    const len = toks.length;
    if (len < 2) return { err: 'Slovo musí mít aspoň 2 písmena.' };
    if (r + dr * (len - 1) >= N || c + dc * (len - 1) >= N) return { err: 'Slovo přesahuje desku.' };
    const at = k => (r + dr * k) * N + c + dc * k;
    const before = r - dr >= 0 && c - dc >= 0 ? (r - dr) * N + c - dc : -1;
    const after = r + dr * len < N && c + dc * len < N ? at(len) : -1;
    if (before >= 0 && board[before]) return { err: 'Před slovem už leží písmeno – napište celé slovo.' };
    if (after >= 0 && board[after]) return { err: 'Za slovem pokračují písmena – napište celé slovo.' };
    const cells = [], fresh = [];
    let touches = false;
    for (let k = 0; k < len; k++) {
      const i = at(k);
      cells.push(i);
      if (board[i]) {
        if (up(board[i]) !== toks[k]) return { err: `Na poli ${cellName(i)} už leží ${up(board[i])}.` };
        touches = true;
      } else {
        fresh.push({ i, t: toks[k] });
        const ri = Math.floor(i / N), ci = i % N;
        for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const rr = ri + a, cc = ci + b;
          if (rr >= 0 && rr < N && cc >= 0 && cc < N && board[rr * N + cc]) touches = true;
        }
      }
    }
    if (!fresh.length) return { err: 'Takové slovo už na desce leží.' };
    const empty = board.every(x => !x);
    if (empty && !cells.includes(CENTER)) return { err: 'První slovo musí vést přes střed desky – políčko s hvězdičkou (H8).' };
    if (!empty && !touches) return { err: 'Slovo musí navazovat na písmena na desce.' };
    // dostupnost kamenů v zásobníku
    const have = {};
    let blanks = 0;
    rack.forEach(t => { if (t === '?') blanks++; else have[t] = (have[t] || 0) + 1; });
    const need = {};
    fresh.forEach(f => need[f.t] = (need[f.t] || 0) + 1);
    const short = {};
    let missing = 0;
    for (const t in need) { const d = need[t] - (have[t] || 0); if (d > 0) { short[t] = d; missing += d; } }
    if (missing > blanks) {
      const list = Object.keys(short);
      return { err: `V zásobníku chybí ${list.join(', ')}${blanks ? ' (žolíků je málo)' : ''}.` };
    }
    // kam dát žolíky: vyzkoušet všechna rozmístění a vzít nejvýhodnější
    let choices = [[]];
    for (const t in short) {
      const spots = fresh.filter(f => f.t === t).map(f => f.i);
      const opts = combos(spots, short[t]);
      choices = choices.flatMap(ch => opts.map(o => ch.concat(o)));
    }
    let best = null;
    for (const ch of choices) {
      const placed = {};
      fresh.forEach(f => placed[f.i] = ch.includes(f.i) ? f.t.toLowerCase() : f.t);
      const sc = scoreMove(board, placed, dir, cells, vals, bonus);
      if (!best || sc.score > best.score) best = { ...sc, placed };
    }
    return {
      ok: true, score: best.score, words: best.words, bingo: best.bingo,
      tiles: Object.keys(best.placed).map(k => ({ i: +k, t: best.placed[k] })),
      main: best.words[0].w, r, c, dir, pos: posStr(r, c, dir), cells,
    };
  }

  /* Vyhodnotí tah: evaluate(deska, zásobník, 'H8', 'slovo', hodnoty, bonus)
     → { ok, err, score, words: [{ w, s }], tiles: [{ i, t }], main, pos, key } */
  function evaluate(board, rack, pos, word, vals, bonus) {
    const p = parsePos(pos);
    if (!p) return { ok: false, err: 'Neplatná pozice.' };
    const { word: w, list } = tokenize(word, vals);
    if (!w) return { ok: false, err: 'Napište slovo.' };
    const bad = [...w].find(ch => vals[ch] == null);
    if (bad) return { ok: false, err: `Písmeno ${bad} ve hře není.` };
    let best = null, firstErr = null;
    for (const toks of list) {
      if (toks.some(t => vals[t] == null)) continue;
      const res = placeTokens(board, rack, p, toks, vals, bonus);
      if (res.ok) { if (!best || res.score > best.score) best = res; }
      else if (!firstErr) firstErr = res.err;
    }
    if (!best) return { ok: false, err: firstErr || 'Tah nejde položit.' };
    best.key = best.pos + ':' + w;
    return best;
  }

  // Pořadí tahů podle pravidel opisu: body ↓, hlavní slovo v abecedě, výš, víc vlevo, vodorovně
  function compareMoves(a, b) {
    return (b.score - a.score) || a.main.localeCompare(b.main, 'cs') || (a.r - b.r) || (a.c - b.c)
      || ((a.dir === 'h' ? 0 : 1) - (b.dir === 'h' ? 0 : 1));
  }

  const applyMove = (board, tiles) => { const b = board.slice(); tiles.forEach(x => b[x.i] = x.t); return b; };
  const boardToStr = b => b.join(',');
  const boardFromStr = s => { const a = String(s || '').split(','); return a.length === N * N ? a : Array(N * N).fill(''); };

  /* ---------- vykreslení (styly v deska.css) ---------- */
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAR = '<svg class="star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
  const PREM_LABEL = { TW: '3×<br>slovo', DW: '2×<br>slovo', TL: '3×<br>písm.', DL: '2×<br>písm.' };

  function tileHtml(t, vals, cls = '', style = '') {
    const blank = t === '?' || isBlank(t);
    const u = t === '?' ? '' : up(t);
    return `<div class="tile ${blank ? 'blank' : ''} ${u.length > 1 ? 'ch' : ''} ${cls}" style="${style}"><b>${escH(u)}</b>${blank ? '' : `<i>${vals[u] ?? ''}</i>`}</div>`;
  }
  /* opts.ghost = { tiles, color, rej }, opts.last = Set polí naposledy položeného tahu,
     opts.start = { i, dir } – vyznačené počáteční pole (mobil) */
  function boardHtml(board, bs, vals, opts = {}) {
    const ghost = {};
    (opts.ghost?.tiles || []).forEach(x => ghost[x.i] = x.t);
    let h = '<div class="lab"></div>';
    for (let c = 1; c <= N; c++) h += `<div class="lab">${c}</div>`;
    for (let r = 0; r < N; r++) {
      h += `<div class="lab">${ROWS[r]}</div>`;
      for (let c = 0; c < N; c++) {
        const i = r * N + c, p = PREM[i], t = board[i];
        let inner = '';
        if (t) inner = tileHtml(t, vals, opts.last?.has(i) ? 'last' : '');
        else if (ghost[i] != null) inner = tileHtml(ghost[i], vals, 'ghost' + (opts.ghost.rej ? ' rej' : opts.ghost.warn ? ' warn' : ''), `--tc:${opts.ghost.color}`);
        else if (i === CENTER) inner = STAR;
        else if (p) inner = `<span class="pl">${PREM_LABEL[p]}</span>`;
        const isStart = opts.start && opts.start.i === i;
        const st = isStart ? ` start ${opts.start.dir || 'nodir'}` : '';
        // šipka směru vychází z počátečního pole a míří do dalšího
        if (isStart && opts.start.dir) inner += `<svg class="arr ${opts.start.dir}" viewBox="0 0 30 10"><path d="M2 5H27M22 1l5 4-5 4"/></svg>`;
        h += `<div class="sq ${p}${st}" data-i="${i}">${inner}</div>`;
      }
    }
    return `<div class="bd" style="--bs:${bs}">${h}</div>`;
  }

  window.ScrabLogic = {
    N, CENTER, ROWS, PREM, VOWELS, parseLetters, isBlank, up, isVowel, cellName, parsePos, posStr,
    tokenize, evaluate, compareMoves, applyMove, boardToStr, boardFromStr, tileHtml, boardHtml,
  };
})();
