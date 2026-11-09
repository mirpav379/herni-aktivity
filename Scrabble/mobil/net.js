/* Scrabble (opis) – spojení pultu s mobily týmů.
   Hra (stejný tvar v obou režimech):
   { meta:  { phase: 'join'|'ready'|'think'|'closed'|'end', turn, board: 'A,,CH,…', rack: ['A','?',…],
              vals: { A: 1, … }, endsAt, bag, bonus, res: { uid: [body tahu, celkem, místo] } },
     teams: { uid: { name, at } },                       // jeden mobil = jeden tým
     moves: { tah: { uid: { list: [{ pos, word }], at } } },   // řešení týmu v jeho pořadí (první = TOP)
     flags: { tah: { uid: { klíč: 'warn'|'no' } } } }    // značky moderátora (⚠ / neuznáno)
   Testovací režim: localStorage, každá cesta zvlášť (karty si nepřepisují data);
   Firebase: Realtime Database scrabble/{kód}. */
(function () {
  const LETTERS = 'ABCDEFGHJKMNPRSTUVWXYZ';               // bez I, L, O, Q
  const newCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const isTest = !window.SCRABBLE_FIREBASE;

  /* ---------- testovací režim ---------- */
  const pre = code => `scrabble-live-${code}/`;
  const local = new Set();
  const notify = code => local.forEach(f => f(code));
  const read = code => {
    const p = pre(code), tree = {};
    let any = false;
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k);
      if (!key || !key.startsWith(p)) continue;
      let v; try { v = JSON.parse(localStorage.getItem(key)); } catch { continue; }
      const parts = key.slice(p.length).split('/');
      let o = tree;
      parts.slice(0, -1).forEach(x => o = o[x] ||= {});
      o[parts[parts.length - 1]] = v; any = true;
    }
    return any ? tree : null;
  };
  const testUid = () => {
    let id = sessionStorage.getItem('scrabble-uid');
    if (!id) { id = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('scrabble-uid', id); }
    return id;
  };
  const test = {
    mode: 'test',
    ready: () => Promise.resolve(testUid()),
    now: () => Date.now(),
    async create() {
      let c; do c = newCode(); while (localStorage.getItem(pre(c) + 'meta'));
      localStorage.setItem(pre(c) + 'meta', JSON.stringify({ phase: 'join', turn: 0, created: Date.now() }));
      return c;
    },
    async exists(code) { return !!localStorage.getItem(pre(code) + 'meta'); },
    watch(code, cb) {
      const fire = () => cb(read(code));
      const onS = e => { if (e.key && e.key.startsWith(pre(code))) fire(); }, onL = c => { if (c === code) fire(); };
      window.addEventListener('storage', onS); local.add(onL); fire();
      return () => { window.removeEventListener('storage', onS); local.delete(onL); };
    },
    // zápis jedné cesty ('meta', 'teams/uid', 'moves/3/uid', 'flags/3/uid'); null = smazat
    async set(code, path, value) {
      const k = pre(code) + path;
      // smazat i hlubší cesty (např. přepsání celého 'flags/3')
      Object.keys(localStorage).filter(x => x.startsWith(k + '/')).forEach(x => localStorage.removeItem(x));
      if (value == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(value));
      notify(code); return true;
    },
    // mobil: zápis řešení jen během času na tah
    async saveMoves(code, turn, list) {
      const meta = read(code)?.meta;
      if (!meta || meta.phase !== 'think' || meta.turn !== turn) return false;
      return test.set(code, `moves/${turn}/${testUid()}`, { list, at: Date.now() });
    },
    async join(code, name) { const u = testUid(); await test.set(code, `teams/${u}`, { name, at: Date.now() }); return u; },
    async remove(code) { Object.keys(localStorage).filter(x => x.startsWith(pre(code))).forEach(x => localStorage.removeItem(x)); notify(code); },
  };

  /* ---------- Firebase ---------- */
  let uidP = null, offset = 0;
  const db = () => firebase.database();
  const fb = {
    mode: 'firebase',
    ready() {
      if (!uidP) uidP = new Promise((ok, bad) => {
        db().ref('.info/serverTimeOffset').on('value', s => offset = s.val() || 0);
        const u = firebase.auth().currentUser; if (u) return ok(u.uid);
        const off = firebase.auth().onAuthStateChanged(x => { if (x) { off(); ok(x.uid); } });
        firebase.auth().signInAnonymously().catch(bad);
      });
      return uidP;
    },
    now: () => Date.now() + offset,                       // čas serveru (mobil i pult ukazují stejný odpočet)
    async create() {
      await fb.ready(); let c;
      do c = newCode(); while ((await db().ref(`scrabble/${c}/meta`).get()).exists());
      await db().ref(`scrabble/${c}/meta`).set({ phase: 'join', turn: 0, created: Date.now(), owner: await fb.ready() });
      return c;
    },
    async exists(code) { await fb.ready(); return (await db().ref(`scrabble/${code}/meta`).get()).exists(); },
    watch(code, cb) {
      let ref = null, off = false;
      fb.ready().then(() => { if (off) return; ref = db().ref(`scrabble/${code}`); ref.on('value', s => cb(s.val())); });
      return () => { off = true; ref?.off(); };
    },
    async set(code, path, value) { await fb.ready(); try { await db().ref(`scrabble/${code}/${path}`).set(value ?? null); return true; } catch { return false; } },
    async saveMoves(code, turn, list) {
      const u = await fb.ready();
      try { await db().ref(`scrabble/${code}/moves/${turn}/${u}`).set({ list, at: Date.now() }); return true; } catch { return false; }
    },
    async join(code, name) { const u = await fb.ready(); await db().ref(`scrabble/${code}/teams/${u}`).set({ name, at: Date.now() }); return u; },
    async remove(code) { await fb.ready(); await db().ref(`scrabble/${code}`).remove(); },
  };

  window.ScrabNet = isTest ? test : fb;
})();
