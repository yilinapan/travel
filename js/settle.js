/* settle.js — 分帳計算（純計算，不碰畫面，方便測試）
 * 所有金額一律換算成「基準幣別的分」(整數) 來算，避免小數誤差。
 */
window.App = window.App || {};
App.Settle = (function () {

  /** 把使用者輸入的金額轉成整數「分」 */
  function toCents(n) {
    var v = Number(n);
    if (!isFinite(v)) return 0;
    return Math.round(v * 100);
  }

  /** 分 → 顯示用的數字字串 */
  function fromCents(cents) {
    return (cents / 100).toFixed(2).replace(/\.00$/, '');
  }

  /** 查某幣別對基準幣別的匯率；找不到回傳 null */
  function rateOf(trip, code) {
    if (!code || code === trip.baseCurrency) return 1;
    var list = trip.currencies || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === code) {
        var r = Number(list[i].rate);
        return isFinite(r) && r > 0 ? r : null;
      }
    }
    return null;
  }

  /** 一筆支出換算成基準幣別的分 */
  function expenseBaseCents(trip, exp, warnings) {
    var r = rateOf(trip, exp.currency);
    if (r === null) {
      warnings.push('「' + (exp.title || '未命名支出') + '」用的幣別 ' + exp.currency + ' 還沒設定匯率，暫時以 1:1 計算。');
      r = 1;
    }
    return Math.round(toCents(exp.amount) * r);
  }

  /**
   * 把一筆金額平均分給 n 個人，除不盡的餘數一分一分發給前面的人，
   * 確保加總後完全等於原金額（不會少一塊錢）。
   */
  function splitEvenly(totalCents, ids) {
    var n = ids.length;
    var out = {};
    if (n === 0) return out;
    var sign = totalCents < 0 ? -1 : 1;
    var abs = Math.abs(totalCents);
    var base = Math.floor(abs / n);
    var rem = abs - base * n;
    ids.forEach(function (id, i) {
      out[id] = sign * (base + (i < rem ? 1 : 0));
    });
    return out;
  }

  /**
   * 主要進入點。
   * 回傳 { totalCents, perMember:[{id,name,paidCents,shareCents,netCents}], transfers:[{fromId,toId,cents}], warnings:[] }
   * netCents > 0 代表這個人付多了（別人要還他）；< 0 代表他要付錢給別人。
   */
  function compute(trip) {
    var warnings = [];
    var members = trip.members || [];
    var expenses = trip.expenses || [];

    var paid = {}, share = {};
    members.forEach(function (m) { paid[m.id] = 0; share[m.id] = 0; });

    var total = 0;

    expenses.forEach(function (exp) {
      var cents = expenseBaseCents(trip, exp, warnings);
      if (cents === 0) return;

      // 只採計還存在的成員
      var sharers = (exp.shareIds || []).filter(function (id) { return paid.hasOwnProperty(id); });
      if (sharers.length === 0) {
        warnings.push('「' + (exp.title || '未命名支出') + '」沒有指定分攤的人，這筆不列入計算。');
        return;
      }
      if (!paid.hasOwnProperty(exp.payerId)) {
        warnings.push('「' + (exp.title || '未命名支出') + '」的付款人已被刪除，這筆不列入計算。');
        return;
      }

      total += cents;
      paid[exp.payerId] += cents;
      var parts = splitEvenly(cents, sharers);
      Object.keys(parts).forEach(function (id) { share[id] += parts[id]; });
    });

    var perMember = members.map(function (m) {
      return {
        id: m.id,
        name: m.name,
        paidCents: paid[m.id],
        shareCents: share[m.id],
        netCents: paid[m.id] - share[m.id]
      };
    });

    return {
      totalCents: total,
      perMember: perMember,
      transfers: minimalTransfers(perMember),
      warnings: warnings
    };
  }

  /**
   * 算出「誰轉給誰多少」，用貪心法讓轉帳筆數盡量少：
   * 每次拿「欠最多的人」去還「被欠最多的人」。
   */
  function minimalTransfers(perMember) {
    var creditors = perMember.filter(function (m) { return m.netCents > 0; })
      .map(function (m) { return { id: m.id, amt: m.netCents }; })
      .sort(function (a, b) { return b.amt - a.amt; });
    var debtors = perMember.filter(function (m) { return m.netCents < 0; })
      .map(function (m) { return { id: m.id, amt: -m.netCents }; })
      .sort(function (a, b) { return b.amt - a.amt; });

    var transfers = [];
    var i = 0, j = 0;
    var guard = 0;
    while (i < debtors.length && j < creditors.length && guard++ < 10000) {
      var pay = Math.min(debtors[i].amt, creditors[j].amt);
      if (pay > 0) {
        transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, cents: pay });
      }
      debtors[i].amt -= pay;
      creditors[j].amt -= pay;
      if (debtors[i].amt === 0) i++;
      if (creditors[j].amt === 0) j++;
    }
    return transfers;
  }

  return {
    compute: compute,
    splitEvenly: splitEvenly,
    minimalTransfers: minimalTransfers,
    toCents: toCents,
    fromCents: fromCents,
    rateOf: rateOf
  };
})();
