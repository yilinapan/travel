/* cloud.tests.js — 試算表格式轉換的測試（瀏覽器與終端機共用同一份）
 * 用法：registerCloudTests(t, eq, App)
 */
function registerCloudTests(t, eq, App) {

  var Cloud = App.Cloud, Store = App.Store, Settle = App.Settle;

  /** 做一趟完整的旅程當測試素材 */
  function sampleTrip() {
    var t = {
      id: 'trip_x', name: '關西5天',
      startDate: '2026-03-01', endDate: '2026-03-03',
      baseCurrency: 'TWD',
      currencies: [{ code: 'JPY', rate: 0.21 }],
      members: [{ id: 'm1', name: 'Allie' }, { id: 'm2', name: '小明' }, { id: 'm3', name: '小華' }],
      days: [],
      expenses: [],
      checklist: [{
        id: 'g1', name: '重要證件', emoji: '🪪',
        items: [{ id: 'c1', text: '護照', done: true }, { id: 'c2', text: '簽證', done: false }]
      }]
    };
    Store.migrateTrip(t);
    t.days[0].items = [
      { id: 'i1', time: '09:00', type: 'spot', title: '清水寺', place: '京都', note: '帶現金', link: 'https://maps.google.com', image: 'images/kiyomizu.jpg', amount: 400, currency: 'JPY' },
      { id: 'i2', time: '12:00', type: 'food', title: '午餐', place: '祇園', note: '', link: '', image: '', amount: '', currency: '' }
    ];
    t.days[1].items = [
      { id: 'i3', time: '', type: 'stay', title: '飯店', place: '大阪', note: '', link: '', image: '', amount: 9000, currency: 'JPY' }
    ];
    t.expenses = [
      { id: 'e1', date: '2026-03-01', title: '門票', note: '', amount: 400, currency: 'JPY', payerId: 'm1', shareIds: ['m1', 'm2', 'm3'], extras: [] },
      { id: 'e2', date: '2026-03-01', title: '計程車', note: '從車站到飯店', amount: 1200, currency: 'JPY', payerId: 'm2', shareIds: ['m1', 'm2'], extras: [] },
      {
        id: 'e3', date: '2026-03-02', title: '午餐', note: '小明加點了生魚片',
        amount: 1000, currency: 'JPY', payerId: 'm1', shareIds: ['m1', 'm2', 'm3'],
        extras: [{ id: 'x1', label: '生魚片', amount: 100, memberIds: ['m2'] }]
      }
    ];
    return t;
  }

  function roundTrip(trip) {
    return Cloud.fromRows(Cloud.toRows([trip])).trips[0];
  }

  // ===================================================================
  t('轉成試算表再組回來，旅程基本資料不會跑掉', function () {
    var a = sampleTrip(), b = roundTrip(a);
    eq(b.name, a.name, '名稱');
    eq(b.startDate, a.startDate, '出發日');
    eq(b.endDate, a.endDate, '回程日');
    eq(b.baseCurrency, a.baseCurrency, '基準幣別');
    eq(b.currencies, a.currencies, '匯率');
    eq(b.members.map(function (m) { return m.name; }), ['Allie', '小明', '小華'], '成員');
  });

  t('轉成試算表再組回來，行程點的每個欄位都還在（含圖片）', function () {
    var a = sampleTrip(), b = roundTrip(a);
    var fields = ['time', 'type', 'title', 'place', 'note', 'link', 'image', 'amount', 'currency'];
    var pick = function (it) {
      var o = {}; fields.forEach(function (f) { o[f] = it[f]; }); return o;
    };
    eq(b.days[0].items.map(pick), a.days[0].items.map(pick), '第 1 天');
    eq(b.days[1].items.map(pick), a.days[1].items.map(pick), '第 2 天');
  });

  t('轉成試算表再組回來，分帳的結算結果完全一致', function () {
    var a = sampleTrip(), b = roundTrip(a);
    var ra = Settle.compute(a), rb = Settle.compute(b);
    eq(rb.totalCents, ra.totalCents, '總支出');
    eq(rb.perMember.map(function (m) { return [m.name, m.netCents]; }),
       ra.perMember.map(function (m) { return [m.name, m.netCents]; }), '每人淨額');
    eq(rb.transfers.length, ra.transfers.length, '轉帳筆數');
  });

  t('打包清單的分類、圖示、勾選狀態都會保留', function () {
    var a = sampleTrip(), b = roundTrip(a);
    eq(b.checklist[0].name, '重要證件', '分類名稱');
    eq(b.checklist[0].emoji, '🪪', '圖示');
    eq(b.checklist[0].items.map(function (i) { return [i.text, i.done]; }),
       [['護照', true], ['簽證', false]], '項目與勾選');
  });

  t('試算表裡存的是「名字」而不是程式內部編號（人看得懂、Hermes 才填得了）', function () {
    var rows = Cloud.toRows([sampleTrip()]);
    eq(rows.trips[0][4], 'Allie,小明,小華', '成員欄');
    eq(rows.expenses[1][6], '小明', '誰付的');
    eq(rows.expenses[1][7], 'Allie,小明', '分給誰');
    eq(rows.items[0][4], '景點', '類型用中文');
  });

  t('「分給誰」留空白代表全部的人', function () {
    var rows = Cloud.toRows([sampleTrip()]);
    eq(rows.expenses[0][7], '', '全員分攤時應留空');

    var back = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B,C', '']],
      expenses: [['測試', '', '晚餐', '', '300', 'TWD', 'A', '', '']]
    }).trips[0];
    eq(back.expenses[0].shareIds.length, 3, '空白應還原成全部 3 人');
  });

  t('Hermes 只新增行程列、沒有建旅程時，會自動補一趟旅程', function () {
    var r = Cloud.fromRows({
      items: [['九州之旅', '1', '1', '08:00', '航班', '桃園→福岡', '', '', '', '', '', '']]
    });
    eq(r.trips.length, 1, '旅程數');
    eq(r.trips[0].name, '九州之旅', '旅程名稱');
    eq(r.trips[0].days[0].items[0].title, '桃園→福岡', '行程點');
  });

  t('支出出現名單上沒有的成員時，自動加入並提出警告（不默默丟掉這筆錢）', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      expenses: [['測試', '', '晚餐', '', '300', 'TWD', 'C', '', '']]
    });
    var t0 = r.trips[0];
    eq(t0.members.map(function (m) { return m.name; }), ['A', 'B', 'C'], '成員');
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(Settle.compute(t0).totalCents, 30000, '這筆錢仍要列入計算');
  });

  t('「第幾天」超出目前天數時，會自動把天數補足', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '2026-01-01', '2026-01-02', 'TWD', 'A', '']],
      items: [['測試', '5', '1', '', '景點', '第五天的行程', '', '', '', '', '', '']]
    });
    var t0 = r.trips[0];
    if (t0.days.length < 5) throw new Error('天數應至少補到 5，實際 ' + t0.days.length);
    eq(t0.days[4].items[0].title, '第五天的行程', '第 5 天的行程點');
    eq(t0.endDate, '2026-01-05', '回程日應自動延長到涵蓋第 5 天');
    if (r.warnings.length === 0) throw new Error('自動改日期時應該要提出警告');
  });

  t('「順序」欄留空白時，保持試算表上的先後順序', function () {
    var r = Cloud.fromRows({
      items: [
        ['測試', '1', '', '', '景點', '第一個', '', '', '', '', '', ''],
        ['測試', '1', '', '', '景點', '第二個', '', '', '', '', '', ''],
        ['測試', '1', '', '', '景點', '第三個', '', '', '', '', '', '']
      ]
    });
    eq(r.trips[0].days[0].items.map(function (i) { return i.title; }),
       ['第一個', '第二個', '第三個'], '順序');
  });

  t('「順序」有填時，會依照數字排，不管在試算表上的位置', function () {
    var r = Cloud.fromRows({
      items: [
        ['測試', '1', '3', '', '景點', 'C', '', '', '', '', '', ''],
        ['測試', '1', '1', '', '景點', 'A', '', '', '', '', '', ''],
        ['測試', '1', '2', '', '景點', 'B', '', '', '', '', '', '']
      ]
    });
    eq(r.trips[0].days[0].items.map(function (i) { return i.title; }), ['A', 'B', 'C'], '順序');
  });

  t('打勾欄位接受多種寫法（TRUE / 是 / V / 1）', function () {
    var r = Cloud.fromRows({
      checklist: [
        ['測試', '證件', '', '護照', 'TRUE'],
        ['測試', '證件', '', '簽證', '是'],
        ['測試', '證件', '', '機票', 'V'],
        ['測試', '證件', '', '保險', '1'],
        ['測試', '證件', '', '駕照', 'FALSE'],
        ['測試', '證件', '', '影本', '']
      ]
    });
    eq(r.trips[0].checklist[0].items.map(function (i) { return i.done; }),
       [true, true, true, true, false, false], '勾選狀態');
  });

  t('看不懂的類型會歸到「其他」，不會整列壞掉', function () {
    var r = Cloud.fromRows({
      items: [['測試', '1', '1', '', '外星人', '不明行程', '', '', '', '', '', '']]
    });
    eq(r.trips[0].days[0].items[0].type, 'other', '類型');
    eq(r.trips[0].days[0].items[0].title, '不明行程', '標題仍在');
  });

  t('匯率格式 JPY=0.21 讀得出來；格式錯誤會提出警告', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A', 'JPY=0.21,USD=32,壞掉的']]
    });
    eq(r.trips[0].currencies, [{ code: 'JPY', rate: 0.21 }, { code: 'USD', rate: 32 }], '匯率');
    if (r.warnings.length === 0) throw new Error('格式錯誤應該要有警告');
  });

  t('多趟旅程不會混在一起', function () {
    var a = sampleTrip();
    var b = sampleTrip(); b.name = '九州之旅'; b.id = 'trip_y';
    var r = Cloud.fromRows(Cloud.toRows([a, b]));
    eq(r.trips.length, 2, '旅程數');
    eq(r.trips.map(function (x) { return x.name; }), ['關西5天', '九州之旅'], '名稱');
    eq(r.trips[0].days[0].items.length, 2, '第一趟第一天的行程點數');
    eq(r.trips[1].expenses.length, 3, '第二趟的支出筆數');
  });

  // --- 分頭行動（行程點的參加者）---

  t('行程點的參加者會存成名字，全員一起時留空白', function () {
    var a = sampleTrip();
    a.days[0].items[0].members = ['m1', 'm2'];      // 只有 Allie 和小明
    var rows = Cloud.toRows([a]);
    eq(rows.items[0][12], 'Allie,小明', '分頭行動的參加者');
    eq(rows.items[1][12], '', '全員一起時留空白');
  });

  t('參加者轉成試算表再讀回來，人數與名字一致', function () {
    var a = sampleTrip();
    a.days[0].items[0].members = ['m1', 'm3'];
    var b = roundTrip(a);
    var names = b.days[0].items[0].members.map(function (id) {
      return b.members.filter(function (m) { return m.id === id; })[0].name;
    });
    eq(names, ['Allie', '小華'], '參加者');
    eq(b.days[0].items[1].members, [], '全員一起的行程點');
  });

  t('參加者欄出現名單上沒有的人時，自動加入成員', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      items: [['測試', '1', '1', '', '景點', '分頭行動', '', '', '', '', '', '', 'A,C']]
    });
    var t0 = r.trips[0];
    eq(t0.members.map(function (m) { return m.name; }), ['A', 'B', 'C'], '成員');
    eq(t0.days[0].items[0].members.length, 2, '參加者人數');
  });

  t('舊資料沒有參加者欄時，視為全員一起（不會壞）', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      items: [['測試', '1', '1', '09:00', '景點', '清水寺', '京都', '', '', '', '', '']]
    });
    eq(r.trips[0].days[0].items[0].members, [], '參加者應為空（代表全員）');
    eq(r.trips[0].days[0].items[0].title, '清水寺', '其他欄位正常');
  });

  // --- 備註與指定項目 ---

  t('支出的備註會保留', function () {
    var b = roundTrip(sampleTrip());
    eq(b.expenses.map(function (e) { return e.note; }),
       ['', '從車站到飯店', '小明加點了生魚片'], '備註');
  });

  t('指定項目轉成一格文字的格式：說明=金額=誰', function () {
    var rows = Cloud.toRows([sampleTrip()]);
    eq(rows.expenses[2][8], '生魚片=100=小明', '指定項目欄');
    eq(rows.expenses[0][8], '', '沒有指定項目時留空');
  });

  t('指定項目轉成文字再讀回來，內容一致', function () {
    var b = roundTrip(sampleTrip());
    var ex = b.expenses[2].extras;
    eq(ex.length, 1, '指定項目筆數');
    eq(ex[0].label, '生魚片', '說明');
    eq(ex[0].amount, 100, '金額');
    eq(ex[0].memberIds.map(function (id) {
      return b.members.filter(function (m) { return m.id === id; })[0].name;
    }), ['小明'], '對象');
  });

  t('有指定項目時，來回轉換後結算結果仍然完全一致', function () {
    var a = sampleTrip(), b = roundTrip(a);
    var ra = Settle.compute(a), rb = Settle.compute(b);
    eq(rb.totalCents, ra.totalCents, '總支出');
    eq(rb.perMember.map(function (m) { return [m.name, m.shareCents, m.netCents]; }),
       ra.perMember.map(function (m) { return [m.name, m.shareCents, m.netCents]; }), '每人分攤與淨額');
  });

  t('多條指定項目用 | 分隔，對象用逗號分隔', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B,C', '']],
      expenses: [['測試', '', '晚餐', '', '1000', 'TWD', 'A', '', '生魚片=100=B | 甜點=60=A,C']]
    });
    var e = r.trips[0].expenses[0];
    eq(e.extras.length, 2, '指定項目筆數');
    eq(e.extras[1].label, '甜點', '第二條的說明');
    eq(e.extras[1].memberIds.length, 2, '第二條有兩個對象');
    eq(Settle.compute(r.trips[0]).perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和為 0');
  });

  t('指定項目格式寫錯時提出警告，不會讓整筆支出壞掉', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      expenses: [['測試', '', '晚餐', '', '300', 'TWD', 'A', '', '亂寫的東西']]
    });
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(r.trips[0].expenses[0].amount, 300, '支出金額仍在');
    eq(r.trips[0].expenses[0].extras.length, 0, '壞掉的指定項目被略過');
  });

  t('指定項目裡出現新成員時，「分給誰留空白」也會把他算進去（不受列的順序影響）', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      expenses: [['測試', '', '晚餐', '', '900', 'TWD', 'A', '', '加點=90=C']]
    });
    var t0 = r.trips[0];
    eq(t0.members.map(function (m) { return m.name; }), ['A', 'B', 'C'], '成員');
    eq(t0.expenses[0].shareIds.length, 3, '空白應涵蓋全部 3 人');
    eq(Settle.compute(t0).perMember.reduce(function (s, m) { return s + m.netCents; }, 0), 0, '淨額總和為 0');
  });

  // --- 還款 ---

  t('還款會存成名字，來回轉換後內容一致', function () {
    var a = sampleTrip();
    a.payments = [{ id: 'p1', date: '2026-03-02', fromId: 'm2', toId: 'm1',
                    amount: 50000, currency: 'JPY', note: 'Day1 三筆的份' }];
    var rows = Cloud.toRows([a]);
    eq(rows.payments[0], ['關西5天', '2026-03-02', '小明', 'Allie', '50000', 'JPY', 'Day1 三筆的份'], '還款列');

    var b = Cloud.fromRows(rows).trips[0];
    var p = b.payments[0];
    eq(p.amount, 50000, '金額');
    eq(p.currency, 'JPY', '幣別');
    eq(p.note, 'Day1 三筆的份', '備註');
    eq(b.members.filter(function (m) { return m.id === p.fromId; })[0].name, '小明', '誰還的');
    eq(b.members.filter(function (m) { return m.id === p.toId; })[0].name, 'Allie', '還給誰');
  });

  t('有還款時，來回轉換後結算結果完全一致', function () {
    var a = sampleTrip();
    a.payments = [{ id: 'p1', date: '', fromId: 'm2', toId: 'm1', amount: 100, currency: 'TWD', note: '' }];
    var b = roundTrip(a);
    var ra = Settle.compute(a), rb = Settle.compute(b);
    eq(rb.settledCents, ra.settledCents, '已結清總額');
    eq(rb.perMember.map(function (m) { return [m.name, m.netCents]; }),
       ra.perMember.map(function (m) { return [m.name, m.netCents]; }), '每人淨額');
  });

  t('還款欄沒寫清楚誰還給誰時提出警告，不會算錯錢', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      payments: [['測試', '', 'A', '', '300', 'TWD', '']]
    });
    if (r.warnings.length === 0) throw new Error('應該要有警告訊息');
    eq(r.trips[0].payments.length, 0, '這筆不列入');
  });

  t('舊資料沒有還款分頁時不會壞', function () {
    var r = Cloud.fromRows({
      trips: [['測試', '', '', 'TWD', 'A,B', '']],
      expenses: [['測試', '', '晚餐', '', '300', 'TWD', 'A', '', '']]
    });
    eq(r.trips[0].payments, [], '還款為空陣列');
    eq(Settle.compute(r.trips[0]).settledCents, 0, '已結清總額為 0');
  });

  t('空資料不會當掉', function () {
    eq(Cloud.fromRows({}).trips, [], '空物件');
    eq(Cloud.fromRows(null).trips, [], 'null');
    eq(Cloud.toRows([]), { trips: [], items: [], expenses: [], payments: [], checklist: [] }, '空陣列');
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = registerCloudTests;
