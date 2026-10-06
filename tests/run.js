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
vm.createContext(sandbox);

['js/settle.js', 'js/store.js', 'js/cloud.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
const App = sandbox.App;

const suites = [
  { title: '分帳計算', register: require('./settle.tests.js'), args: [App.Settle] },
  { title: '試算表格式轉換', register: require('./cloud.tests.js'), args: [App] }
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
