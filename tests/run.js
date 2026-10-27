/* run.js — 在終端機跑全部測試：  node tests/run.js
 * 跟 test.html 用的是同一份測試檔，不會有兩套測試互相矛盾。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// 模擬瀏覽器環境：在瀏覽器裡 window 就是全域本身，這裡也讓它自己指向自己
const sandbox = { console };
sandbox.window = sandbox;
// store.js / cloud.js 會碰到 localStorage，給一個最小的替身
const mem = new Map();
sandbox.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear()
};
sandbox.navigator = { userAgent: 'node' };
sandbox.alert = () => {};
// share.js 會用到這幾個瀏覽器內建的東西
sandbox.btoa = btoa;
sandbox.atob = atob;
sandbox.TextEncoder = TextEncoder;
sandbox.TextDecoder = TextDecoder;
sandbox.crypto = require('crypto').webcrypto;
sandbox.location = { origin: 'https://yilinapan.github.io', pathname: '/travel/', hash: '' };
vm.createContext(sandbox);

['js/settle.js', 'js/store.js', 'js/cloud.js', 'js/share.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
const App = sandbox.App;

// Apps Script 的程式獨立載入（它是貼到 Google 那邊跑的，不跟網頁共用環境）
const gas = {};
vm.createContext(gas);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), gas, { filename: 'apps-script/Code.gs' });

// 結構檢查要讀原始碼，所以只在終端機跑（瀏覽器版不含這一組）
const SRC_FILES = ['settle', 'store', 'cloud', 'share', 'ui', 'trips', 'itinerary', 'expenses', 'checklist', 'settings', 'app']
  .map(n => ({ name: 'js/' + n + '.js', src: fs.readFileSync(path.join(root, 'js', n + '.js'), 'utf8') }));

const suites = [
  { title: '分帳計算', register: require('./settle.tests.js'), args: [App.Settle] },
  { title: '試算表格式轉換', register: require('./cloud.tests.js'), args: [App] },
  { title: '雲端分享（Apps Script）', register: require('./apps-script.tests.js'), args: [gas] },
  { title: '程式結構', register: require('./structure.tests.js'), args: [SRC_FILES] }
];

let pass = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failures.push({ name, message: e.message });
    console.log('  ✗ ' + name + '\n      ' + e.message);
  }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || '') + ' 期望 ' + b + '，實際得到 ' + a);
}

for (const s of suites) {
  console.log('\n' + s.title + '\n');
  s.register(t, eq, ...s.args);
}

console.log('');
if (failures.length === 0) {
  console.log('✓ 全部通過：' + pass + ' 項，0 項失敗。\n');
  process.exit(0);
} else {
  console.log('✗ 失敗 ' + failures.length + ' 項（通過 ' + pass + ' 項）。\n');
  process.exit(1);
}
