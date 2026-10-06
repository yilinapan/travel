/* settle.tests.js — 分帳計算的測試內容（瀏覽器與終端機共用同一份）
 * 用法：registerSettleTests(t, eq, Settle)
 *   t(名稱, 函式) 註冊一項測試；eq(實際, 期望, 說明) 比對結果
 */
function registerSettleTests(t, eq, Settle) {

  // ---- 測試資料小工具 ----
  function trip(opts) {
    var base = {
      baseCurrency: 'TWD',
      currencies: [],
      members: [{ id: 'a', name: 'Allie' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cindy' }],
      expenses: []
    };
    for (var k in (opts || {})) base[k] = opts[k];
    return base;
  }
  function net(r, id) {
    return r.perMember.filter(function (m) { return m.id === id; })[0].netCents;
  }

  // ===================================================================
  t('一筆 300 元三人均分，付錢的人應該淨賺 200', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '晚餐', amount: 300, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }]
    }));
    eq(net(r, 'a'), 20000, 'Allie 淨額');
    eq(net(r, 'b'), -10000, 'Ben 淨額');
    eq(net(r, 'c'), -10000, 'Cindy 淨額');
  });

  t('每個人的淨額加起來一定等於 0（錢不會憑空多出來或消失）', function () {
    var r = Settle.compute(trip({
      expenses: [
        { title: '晚餐', amount: 1000, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] },
        { title: '門票', amount: 777, currency: 'TWD', payerId: 'b', shareIds: ['b', 'c'] },
        { title: '計程車', amount: 333.33, currency: 'TWD', payerId: 'c', shareIds: ['a', 'c'] }
      ]
    }));
    var sum = r.perMember.reduce(function (s, m) { return s + m.netCents; }, 0);
    eq(sum, 0, '淨額總和');
  });

  t('除不盡時不會少算（100 元分 3 人 = 33.34 + 33.33 + 33.33）', function () {
    var parts = Settle.splitEvenly(10000, ['a', 'b', 'c']);
    eq(parts.a + parts.b + parts.c, 10000, '分攤總和');
    eq([parts.a, parts.b, parts.c], [3334, 3333, 3333], '各人分攤');
  });

  t('只分給部分的人（這餐 Cindy 沒吃）', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '拉麵', amount: 400, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b'] }]
    }));
    eq(net(r, 'a'), 20000, 'Allie');
    eq(net(r, 'b'), -20000, 'Ben');
    eq(net(r, 'c'), 0, 'Cindy 不該被算到');
  });

  t('外幣會依匯率換算（10000 日幣 × 0.21 = 2100 台幣）', function () {
    var r = Settle.compute(trip({
      currencies: [{ code: 'JPY', rate: 0.21 }],
      expenses: [{ title: '住宿', amount: 10000, currency: 'JPY', payerId: 'a', shareIds: ['a', 'b', 'c'] }]
    }));
    eq(r.totalCents, 210000, '總額應為 2100 台幣');
  });

  t('幣別沒設匯率時要發出警告，不可以安靜算錯', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '紀念品', amount: 50, currency: 'USD', payerId: 'a', shareIds: ['a', 'b'] }]
    }));
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
  });

  t('沒指定分攤對象的支出不列入計算，並發出警告', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '不明支出', amount: 500, currency: 'TWD', payerId: 'a', shareIds: [] }]
    }));
    eq(r.totalCents, 0, '總額');
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
  });

  t('付款人被刪掉的舊支出不會讓計算爆掉', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '舊帳', amount: 500, currency: 'TWD', payerId: '已刪除', shareIds: ['a', 'b'] }]
    }));
    eq(r.totalCents, 0, '總額');
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
  });

  t('分攤名單裡有已被刪除的成員時，只分給還在的人', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '晚餐', amount: 300, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', '已刪除'] }]
    }));
    eq(net(r, 'a'), 15000, 'Allie 淨額（300 由 2 人分）');
    eq(net(r, 'b'), -15000, 'Ben 淨額');
  });

  t('結算轉帳的總額，等於所有欠款的總額', function () {
    var r = Settle.compute(trip({
      expenses: [
        { title: '晚餐', amount: 1200, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] },
        { title: '門票', amount: 900, currency: 'TWD', payerId: 'b', shareIds: ['a', 'b', 'c'] },
        { title: '車資', amount: 300, currency: 'TWD', payerId: 'c', shareIds: ['a', 'b'] }
      ]
    }));
    var moved = r.transfers.reduce(function (s, x) { return s + x.cents; }, 0);
    var owed = r.perMember.reduce(function (s, m) { return s + (m.netCents < 0 ? -m.netCents : 0); }, 0);
    eq(moved, owed, '轉帳總額');
  });

  t('結算後每個人都剛好歸零（真的結清了）', function () {
    var r = Settle.compute(trip({
      expenses: [
        { title: '晚餐', amount: 1234.56, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] },
        { title: '門票', amount: 987.65, currency: 'TWD', payerId: 'b', shareIds: ['b', 'c'] },
        { title: '車資', amount: 321, currency: 'TWD', payerId: 'c', shareIds: ['a', 'c'] }
      ]
    }));
    var bal = {};
    r.perMember.forEach(function (m) { bal[m.id] = m.netCents; });
    r.transfers.forEach(function (x) { bal[x.fromId] += x.cents; bal[x.toId] -= x.cents; });
    eq([bal.a, bal.b, bal.c], [0, 0, 0], '結算後餘額');
  });

  t('三個人互相欠，應該用最少筆數結清（這個例子只要 2 筆）', function () {
    var r = Settle.compute(trip({
      expenses: [
        { title: 'A付', amount: 300, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] },
        { title: 'B付', amount: 300, currency: 'TWD', payerId: 'b', shareIds: ['a', 'b', 'c'] }
      ]
    }));
    eq(r.transfers.length, 2, '轉帳筆數');
  });

  t('大家都沒花錢時，結算結果是空的（不會當掉）', function () {
    var r = Settle.compute(trip({ expenses: [] }));
    eq(r.transfers.length, 0, '轉帳筆數');
    eq(r.totalCents, 0, '總額');
  });

  t('金額輸入小數不會產生 0.0000001 這種誤差', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '咖啡', amount: 0.1, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b'] }]
    }));
    eq(r.totalCents, 10, '0.1 元應為 10 分');
    eq(net(r, 'a'), 5, 'Allie 淨額應為 5 分');
  });

  t('一個人自己付、自己分，不會欠任何人', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '自己的咖啡', amount: 120, currency: 'TWD', payerId: 'a', shareIds: ['a'] }]
    }));
    eq(net(r, 'a'), 0, 'Allie 淨額');
    eq(r.transfers.length, 0, '不該產生轉帳');
  });
}

// 給 Node 用；瀏覽器會忽略這一行
if (typeof module !== 'undefined' && module.exports) module.exports = registerSettleTests;
