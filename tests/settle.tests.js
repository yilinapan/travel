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
  function share(r, id) {
    return r.perMember.filter(function (m) { return m.id === id; })[0].shareCents;
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

  // =================================================================
  // 指定項目（一筆支出裡，有些錢是某幾個人專屬的）
  // =================================================================

  t('指定項目：午餐 1000，生魚片 100 算小明的，剩下 900 三人均分', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 1000, currency: 'TWD', payerId: 'a',
        shareIds: ['a', 'b', 'c'],
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b'] }]
      }]
    }));
    // 應分攤：Allie 300、小明 100+300=400、小華 300
    eq(share(r, 'a'), 30000, 'Allie 該分攤');
    eq(share(r, 'b'), 40000, '小明 該分攤');
    eq(share(r, 'c'), 30000, '小華 該分攤');
    eq(net(r, 'a'), 70000, 'Allie 淨額（付 1000 減自己的 300）');
  });

  t('指定項目：那 100 由兩個人平分，各負擔 50', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 1000, currency: 'TWD', payerId: 'a',
        shareIds: ['a', 'b', 'c'],
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b', 'c'] }]
      }]
    }));
    eq(share(r, 'a'), 30000, 'Allie 該分攤 300');
    eq(share(r, 'b'), 35000, '小明 該分攤 350');
    eq(share(r, 'c'), 35000, '小華 該分攤 350');
  });

  t('指定項目：吃生魚片的人可以不分剩下的錢', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 1000, currency: 'TWD', payerId: 'a',
        shareIds: ['a', 'c'],          // 小明不分剩下的 900
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b'] }]
      }]
    }));
    eq(share(r, 'a'), 45000, 'Allie 該分攤 450');
    eq(share(r, 'b'), 10000, '小明只負擔生魚片 100');
    eq(share(r, 'c'), 45000, '小華 該分攤 450');
  });

  t('可以好幾條指定項目同時存在', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '晚餐', amount: 1000, currency: 'TWD', payerId: 'a',
        shareIds: ['a', 'b', 'c'],
        extras: [
          { label: '生魚片', amount: 100, memberIds: ['b'] },
          { label: '甜點', amount: 160, memberIds: ['a', 'c'] }
        ]
      }]
    }));
    // 剩下 1000-100-160 = 740，三人各 246.67 → 24667/24667/24666 分
    eq(share(r, 'a') + share(r, 'b') + share(r, 'c'), 100000, '分攤總和必須等於 1000');
    eq(share(r, 'b'), 10000 + 24667, '小明 = 生魚片 100 + 均分');
  });

  t('全部都指定完、沒有剩餘時也可以（等於完全逐項分攤）', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '各付各的', amount: 300, currency: 'TWD', payerId: 'a',
        shareIds: [],
        extras: [
          { label: 'A 的餐', amount: 100, memberIds: ['a'] },
          { label: 'B 的餐', amount: 200, memberIds: ['b'] }
        ]
      }]
    }));
    eq(share(r, 'a'), 10000, 'Allie 100');
    eq(share(r, 'b'), 20000, '小明 200');
    eq(share(r, 'c'), 0, '小華沒份');
    eq(net(r, 'b'), -20000, '小明要付 200');
  });

  t('有指定項目時，淨額總和仍然是 0', function () {
    var r = Settle.compute(trip({
      expenses: [
        {
          title: '午餐', amount: 1234.56, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'],
          extras: [{ label: '加點', amount: 333.33, memberIds: ['b', 'c'] }]
        },
        {
          title: '晚餐', amount: 777, currency: 'TWD', payerId: 'c', shareIds: ['a', 'c'],
          extras: [{ label: '酒', amount: 250, memberIds: ['a'] }]
        }
      ]
    }));
    eq(r.perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和');
  });

  t('有指定項目時，結算後每個人仍然剛好歸零', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 1000, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'],
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b'] }]
      }]
    }));
    var bal = {};
    r.perMember.forEach(function (m) { bal[m.id] = m.netCents; });
    r.transfers.forEach(function (x) { bal[x.fromId] += x.cents; bal[x.toId] -= x.cents; });
    eq([bal.a, bal.b, bal.c], [0, 0, 0], '結算後餘額');
  });

  t('指定項目加起來超過總額時，發出警告並退回單純均分', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 300, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'],
        extras: [{ label: '太貴了', amount: 500, memberIds: ['b'] }]
      }]
    }));
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(share(r, 'a'), 10000, '退回三人均分');
    eq(share(r, 'b'), 10000, '退回三人均分');
    eq(r.perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和仍為 0');
  });

  t('還有剩餘金額、卻沒人分攤時，由有指定項目的人承擔並發出警告', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 1000, currency: 'TWD', payerId: 'a', shareIds: [],
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b'] }]
      }]
    }));
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(share(r, 'b'), 100000, '小明承擔全部 1000');
    eq(r.perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和仍為 0');
  });

  t('指定項目也會依匯率換算', function () {
    var r = Settle.compute(trip({
      currencies: [{ code: 'JPY', rate: 0.21 }],
      expenses: [{
        title: '午餐', amount: 1000, currency: 'JPY', payerId: 'a', shareIds: ['a', 'b', 'c'],
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b'] }]
      }]
    }));
    eq(r.totalCents, 21000, '總額 1000 日幣 = 210 台幣');
    eq(share(r, 'b'), 2100 + 6300, '小明 = 生魚片 21 + 均分 63');
  });

  t('指定項目裡有已刪除的成員時，只算還在的人', function () {
    var r = Settle.compute(trip({
      expenses: [{
        title: '午餐', amount: 1000, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'],
        extras: [{ label: '生魚片', amount: 100, memberIds: ['b', '已刪除'] }]
      }]
    }));
    eq(share(r, 'b'), 10000 + 30000, '小明承擔整個 100');
    eq(r.perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和仍為 0');
  });

  // =================================================================
  // 還款（旅途中先結清的部分）
  // =================================================================

  /** 基本情境：Allie 墊了 900，三人均分，每人該出 300 */
  function tripWithDebt(payments) {
    return trip({
      expenses: [{ title: '住宿', amount: 900, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }],
      payments: payments || []
    });
  }

  t('還款後，還錢的人欠得比較少，收錢的人應收也變少', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: 'a', amount: 300, currency: 'TWD', date: '2026-03-01' }
    ]));
    eq(net(r, 'b'), 0, '小明已全額還清');
    eq(net(r, 'a'), 30000, 'Allie 只剩小華那 300 要收');
    eq(net(r, 'c'), -30000, '小華沒還，仍要付 300');
  });

  t('全部的人都還清之後，不會再有任何轉帳', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: 'a', amount: 300, currency: 'TWD' },
      { fromId: 'c', toId: 'a', amount: 300, currency: 'TWD' }
    ]));
    eq(r.transfers.length, 0, '轉帳筆數');
    eq(r.perMember.map(function (m) { return m.netCents; }), [0, 0, 0], '每個人都歸零');
  });

  t('只還一部分時，剩下的繼續算在待結清裡', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: 'a', amount: 120, currency: 'TWD' }
    ]));
    eq(net(r, 'b'), -18000, '小明還差 180');
    eq(r.transfers.filter(function (x) { return x.fromId === 'b'; })[0].cents, 18000, '待轉金額');
  });

  t('還款用外幣時會依匯率換算（50,000 韓元 × 0.024 = 1,200 台幣）', function () {
    var t0 = trip({
      currencies: [{ code: 'KRW', rate: 0.024 }],
      expenses: [{ title: '住宿', amount: 3600, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }],
      payments: [{ fromId: 'b', toId: 'a', amount: 50000, currency: 'KRW' }]
    });
    var r = Settle.compute(t0);
    eq(net(r, 'b'), 0, '小明該出 1,200，用韓幣還清剛好歸零');
    eq(r.settledCents, 120000, '已結清總額（台幣分）');
  });

  t('有還款時，淨額總和仍然是 0', function () {
    var r = Settle.compute(trip({
      expenses: [
        { title: '住宿', amount: 1234.56, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] },
        { title: '晚餐', amount: 777, currency: 'TWD', payerId: 'b', shareIds: ['b', 'c'] }
      ],
      payments: [
        { fromId: 'b', toId: 'a', amount: 111.11, currency: 'TWD' },
        { fromId: 'c', toId: 'a', amount: 250, currency: 'TWD' }
      ]
    }));
    eq(r.perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和');
  });

  t('有還款時，結算後每個人仍然剛好歸零', function () {
    var r = Settle.compute(trip({
      expenses: [{ title: '住宿', amount: 1000, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }],
      payments: [{ fromId: 'b', toId: 'a', amount: 200, currency: 'TWD' }]
    }));
    var bal = {};
    r.perMember.forEach(function (m) { bal[m.id] = m.netCents; });
    r.transfers.forEach(function (x) { bal[x.fromId] += x.cents; bal[x.toId] -= x.cents; });
    eq([bal.a, bal.b, bal.c], [0, 0, 0], '結算後餘額');
  });

  t('還太多錢時，變成對方欠他（不會算錯方向）', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: 'a', amount: 500, currency: 'TWD' }   // 只欠 300 卻還了 500
    ]));
    eq(net(r, 'b'), 20000, '小明反而應收 200');
    eq(r.transfers.filter(function (x) { return x.toId === 'b'; }).length, 1, '應該有人要還錢給小明');
  });

  t('每個人的明細會分開記「已還」與「已收」', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: 'a', amount: 300, currency: 'TWD' }
    ]));
    var b = r.perMember.filter(function (m) { return m.id === 'b'; })[0];
    var a = r.perMember.filter(function (m) { return m.id === 'a'; })[0];
    eq(b.repaidOutCents, 30000, '小明已還');
    eq(b.repaidInCents, 0, '小明沒收到還款');
    eq(a.repaidInCents, 30000, 'Allie 已收');
  });

  t('自己還給自己會被擋下來並發出警告', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: 'b', amount: 300, currency: 'TWD' }
    ]));
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(net(r, 'b'), -30000, '不該改變任何人的欠款');
  });

  t('還款對象已被刪除時發出警告，不列入計算', function () {
    var r = Settle.compute(tripWithDebt([
      { fromId: 'b', toId: '已刪除', amount: 300, currency: 'TWD' }
    ]));
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(net(r, 'b'), -30000, '小明仍然欠 300');
  });

  t('沒有任何還款記錄時，行為跟以前完全一樣', function () {
    var withField = Settle.compute(tripWithDebt([]));
    var without = Settle.compute(trip({
      expenses: [{ title: '住宿', amount: 900, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }]
    }));
    eq(withField.perMember.map(function (m) { return m.netCents; }),
       without.perMember.map(function (m) { return m.netCents; }), '淨額');
    eq(withField.settledCents, 0, '已結清總額為 0');
  });

  t('備註欄位不影響計算', function () {
    var withNote = Settle.compute(trip({
      expenses: [{ title: '午餐', note: '小明請客的那餐', amount: 300, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }]
    }));
    var without = Settle.compute(trip({
      expenses: [{ title: '午餐', amount: 300, currency: 'TWD', payerId: 'a', shareIds: ['a', 'b', 'c'] }]
    }));
    eq(withNote.perMember.map(function (m) { return m.netCents; }),
       without.perMember.map(function (m) { return m.netCents; }), '淨額');
  });
}

// 給 Node 用；瀏覽器會忽略這一行
if (typeof module !== 'undefined' && module.exports) module.exports = registerSettleTests;
