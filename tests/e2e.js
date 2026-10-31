// 手機尺寸的實際操作測試：node tests/e2e.js
// 截圖存在 tests/out/（不進 git）
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const URL = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
function ok(c, m){ if (c) console.log('  ✓ ' + m); else { fails++; console.log('  ✗ ' + m); } }

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const sleep = ms => p.waitForTimeout(ms);
  const E = (fn, a) => p.evaluate(fn, a);
  const shot = name => p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  async function newItem(o){
    await p.goto(URL + (o.from === 'em' ? '#/new/em' : '#/new')); await sleep(150);
    await p.fill('[name=f-name]', o.name);
    await p.click('.unit-opt[data-unit="' + (o.unit || '個') + '"]');
    if (o.use) await p.click('.mode-card:has(input[name=use][value=' + o.use + '])');
    if (o.qty != null) await p.fill('#f-qty', String(o.qty));
    if (o.red != null) await p.fill('#f-red', String(o.red));
    if (o.emt != null) await p.fill('#f-emt', String(o.emt));
    if (o.emr != null) await p.fill('#f-emr', String(o.emr));
    if (o.emq != null) await p.fill('#f-emq', String(o.emq));
    await p.click('#item-form button[type=submit]'); await sleep(250);
    return E(n => { const it = db.items.find(i => i.name === n); return it && it.id; }, o.name);
  }
  const info = id => E(id => { const it = getItem(id); return { daily: it.daily, em: it.emergency.enabled, q: it.quantity, emq: poolSum(it, 'emergency') }; }, id);

  await p.goto(URL); await sleep(200);
  await E(() => { localStorage.clear(); }); await p.reload(); await sleep(200);
  ok((await p.textContent('.ver')).trim() === APP_VERSION_EXPECTED(), '版本號 ' + APP_VERSION_EXPECTED());

  console.log('用途：三選一');
  await p.goto(URL + '#/new'); await sleep(150);
  ok(await p.isChecked('input[name=use][value=daily]'), '從「新增」進來，預設是「日常用品」');
  ok((await p.$$('input[name=use]')).length === 3, '從「新增」進來，三個選項都有');
  ok(!(await p.isVisible('#f-emt')), '日常用品不顯示緊急包欄位');
  ok(!(await p.textContent('#view')).includes('這也是緊急備品'), '不再出現「這也是緊急備品」');
  await p.goto(URL + '#/new/em'); await sleep(150);
  ok(await p.isChecked('input[name=use][value=em]'), '從「緊急」分頁新增，預設是「只放緊急包」');
  ok((await p.$$('input[name=use]')).length === 2 && !(await p.$('input[name=use][value=daily]')), '從「緊急」分頁新增，只有兩個選項（沒有「日常用品」）');
  ok(!(await p.isVisible('#f-qty')) && await p.isVisible('#f-emt'), '只放緊急包：隱藏日常欄位、顯示緊急包的數量');
  await shot('form-em');
  await p.click('.mode-card:has(input[name=use][value=both])'); await sleep(100);
  ok(await p.isVisible('#f-qty') && await p.isVisible('#f-emt'), '日常＋緊急包：兩邊欄位都顯示');
  await shot('form-both');

  const egg = await newItem({ name: '測試-雞蛋', unit: '顆', qty: 8, red: 6 });
  let r = await info(egg);
  ok(r.daily && !r.em && r.q === 8, '日常用品：只有日常');
  const water = await newItem({ name: '測試-水', unit: '瓶', use: 'both', qty: 4, red: 2, emt: 12, emr: 4, emq: 6 });
  r = await info(water);
  ok(r.daily && r.em && r.q === 4 && r.emq === 6, '日常＋緊急包：日常 4、緊急 6');
  const rice = await newItem({ from: 'em', name: '測試-乾燥飯', unit: '包', emt: 6, emr: 2, emq: 3 });
  r = await info(rice);
  ok(!r.daily && r.em && r.emq === 3, '只放緊急包：不追蹤日常');
  ok(await E(() => location.hash) === '#/emergency', '只放緊急包新增後回到緊急分頁');

  console.log('編輯：用途切換與限制');
  await p.goto(URL + '#/edit/' + water); await sleep(150);
  ok(await p.isChecked('input[name=use][value=both]'), '編輯時正確帶入目前用途');
  ok((await p.$$('input[name=use]')).length === 3, '編輯時三個選項都有（可以改回日常用品）');
  await p.click('.mode-card:has(input[name=use][value=daily])');
  await p.click('#item-form button[type=submit]'); await sleep(150);
  ok((await p.textContent('#f-err')).includes('才能把用途改成「日常用品」'), '緊急包還有庫存時不能改成日常用品');
  await p.goto(URL + '#/edit/' + egg); await sleep(150);
  await p.click('.mode-card:has(input[name=use][value=both])');
  await p.fill('#f-emt', '4'); await p.fill('#f-emr', '1');
  await p.click('#item-form button[type=submit]'); await sleep(200);
  r = await info(egg);
  ok(r.daily && r.em && r.q === 8 && r.emq === 0, '日常用品改成「緊急包也備一份」，日常數量不變');
  await p.goto(URL + '#/edit/' + egg); await sleep(150);
  await p.click('.mode-card:has(input[name=use][value=em])');
  await p.click('#item-form button[type=submit]'); await sleep(150);
  ok((await p.textContent('#f-err')).includes('才能把用途改成「只放緊急包」'), '日常還有庫存時不能改成只放緊急包');
  await p.click('.mode-card:has(input[name=use][value=daily])');
  await p.click('#item-form button[type=submit]'); await sleep(200);
  r = await info(egg);
  ok(r.daily && !r.em, '緊急包是 0 時可以改回日常用品');
  await p.goto(URL + '#/new/em'); await sleep(150);
  await p.fill('[name=f-name]', '測試-錯誤'); await p.fill('#f-emt', '3'); await p.fill('#f-emr', '3');
  await p.click('#item-form button[type=submit]'); await sleep(150);
  ok((await p.textContent('#f-err')).includes('緊急包的紅線要小於目標存量'), '紅線 ≥ 目標時提示錯誤');

  console.log('分類插圖');
  await p.goto(URL + '#/settings'); await sleep(150);
  await p.click('[data-act=cat-edit]:not([data-id])'); await sleep(300);
  ok((await p.$$('.art-opt')).length === 13, '插圖選單有 13 張');
  ok(!!(await p.$('.art-opt[data-art=fridge][aria-label="冰箱"]')) && !!(await p.$('.art-opt[data-art=food][aria-label="罐頭零食"]')), '有冰箱、罐頭零食兩張新插圖');
  const cols = await p.$eval('.art-grid', el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  ok(cols === 5, '插圖一排 5 張');
  await p.screenshot({ path: path.join(OUT, 'art-picker.png') });
  await p.fill('#ce-name', '測試-冰箱');
  await p.click('.art-opt[data-art=fridge]'); await p.click('.sw[data-color=mint]');
  await p.click('#sheet [data-ok]'); await sleep(300);
  const fc = await E(() => db.categories.find(c => c.name === '測試-冰箱'));
  ok(fc && fc.art === 'fridge' && fc.color === 'mint', '新分類存成冰箱插圖、薄荷底色');
  await p.click('[data-act=cat-edit]:not([data-id])'); await sleep(300);
  await p.fill('#ce-name', '測試-零食'); await p.click('.art-opt[data-art=food]');
  await p.click('#sheet [data-ok]'); await sleep(300);
  ok((await E(() => db.categories.find(c => c.name === '測試-零食').art)) === 'food', '新分類存成罐頭零食插圖');
  await p.goto(URL); await sleep(150);
  ok(!!(await p.$('.cchip:has-text("測試-冰箱") svg')), '首頁分類篩選顯示冰箱插圖');

  console.log('固定回歸');
  await p.goto(URL); await sleep(150);
  await p.click(`[data-act=consume][data-id="${egg}"]`); await sleep(100);
  ok((await info(egg)).q === 7, '用掉 −1');
  await p.click('#toast button'); await sleep(150);
  ok((await info(egg)).q === 8, '復原');
  await E(id => openRestock(id, { pool: 'daily' }), egg); await sleep(250);
  await p.click('.pick-btn[data-n="2"]'); await p.click('#sheet [data-close]'); await sleep(250);
  ok((await info(egg)).q === 8, '補貨按取消不記錄');
  await E(id => openRestock(id, { pool: 'daily' }), egg); await sleep(250);
  await p.click('.pick-btn[data-n="2"]'); await p.click('#sheet [data-ok]'); await sleep(250);
  ok((await info(egg)).q === 10, '補貨確認 +2');
  await p.click(`[data-act=consume][data-id="${water}"]`); await sleep(100);
  r = await info(water);
  ok(r.q === 3 && r.emq === 6, '日常用掉不動緊急包');
  await p.goto(URL + '#/item/' + water); await sleep(150);
  await p.click(`.panel [data-act=em-transfer][data-id="${water}"]`); await sleep(250);
  await p.click('#sheet [data-ok]'); await sleep(250);
  r = await info(water);
  ok(r.q === 4 && r.emq === 5, '調用到日常');
  await p.reload(); await sleep(200);
  ok((await E(() => db.items.length)) === 3, '重新整理後資料還在');
  await p.goto(URL); await sleep(200); await shot('home');
  await p.goto(URL + '#/emergency'); await sleep(200); await shot('emergency');

  ok(errs.length === 0, '沒有 JS 錯誤 ' + errs.join(' | '));
  await b.close();
  console.log(fails ? `\n${fails} 項失敗` : '\n全部通過');
  process.exit(fails ? 1 : 0);
})();

function APP_VERSION_EXPECTED(){
  const s = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  return s.match(/var APP_VERSION = '([^']+)'/)[1];
}
