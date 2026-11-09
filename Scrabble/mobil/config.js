// Nastavení Scrabble (opis). Dokud je SCRABBLE_FIREBASE null, běží TESTOVACÍ REŽIM:
// „mobily“ jsou další karty tohoto prohlížeče, nic nejde na internet.
//
// Po založení projektu ve Firebase sem vložte konfiguraci (Firebase konzole → Nastavení
// projektu → Vaše aplikace → Konfigurace SDK) – stejný projekt může sdílet i VoxClick.
// Jsou to veřejné identifikátory, ne hesla – přístup hlídají pravidla (database.rules.json).
// Projekt herni-aktivity (založen 9. 11. 2026). Pro testovací režim (bez internetu) nastavit na null.
window.SCRABBLE_FIREBASE = {
  apiKey: 'AIzaSyDUBS7hX8Wq1P8dwrovuX7FFj7qspTmAps',
  authDomain: 'herni-aktivity.firebaseapp.com',
  databaseURL: 'https://herni-aktivity-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'herni-aktivity',
  storageBucket: 'herni-aktivity.firebasestorage.app',
  messagingSenderId: '747360665071',
  appId: '1:747360665071:web:54601d49d50facf1f04a1a',
};

// Veřejná adresa stránky pro mobily (složka mobil/ na webu) – jde do QR kódu. Když pult běží z webu
// (GitHub Pages), adresa se odvodí sama a tohle se nepoužije; potřeba jen pro pult spuštěný z disku.
window.SCRABBLE_URL = '';

// Firebase knihovny (compat) – načítají se jen mimo testovací režim
window.SCRABBLE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
window.scrabbleLoad = function () {
  if (!window.SCRABBLE_FIREBASE) return Promise.resolve();
  return ['app', 'auth', 'database'].reduce((pr, p) => pr.then(() => new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = window.SCRABBLE_SDK + `firebase-${p}-compat.js`;
    s.onload = ok; s.onerror = bad; document.head.appendChild(s);
  })), Promise.resolve()).then(() => { if (!firebase.apps.length) firebase.initializeApp(window.SCRABBLE_FIREBASE); });
};
