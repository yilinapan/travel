/* run.js — 在終端機跑同一份測試：  node tests/run.js
 * 跟 test.html 用的是同一個 settle.tests.js，不會有兩套測試互相矛盾。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
// 模擬瀏覽器環境：在瀏覽器裡 window 就是全域本身，這裡也讓它自己指向自己
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'settle.js'), 'utf8'), sandbox);
const Settle = sandbox.window.App.Settle;

const registerSettleTests = require('./settle.tests.js');

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

console.log('\n分帳計算測試\n');
registerSettleTests(t, eq, Settle);

console.log('');
if (failures.length === 0) {
  console.log('✓ 全部通過：' + pass + ' 項，0 項失敗。\n');
  process.exit(0);
} else {
  console.log('✗ 失敗 ' + failures.length + ' 項（通過 ' + pass + ' 項）。\n');
  process.exit(1);
}
