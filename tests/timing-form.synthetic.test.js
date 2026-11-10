'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('timing form validates, cancels, and preserves settings on save failure', async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*', r => r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.addInitScript(() => {
      window.module = {exports:{}};
      const values = new Map([['xbs_settings',JSON.stringify({unknownFutureSetting:'keep',dailyCap:48})]]);
      window.GM_getValue = (k,d) => values.has(k) ? values.get(k) : d;
      window.GM_setValue = (k,v) => { if (k === 'xbs_settings' && window.failTiming) throw Error('synthetic save failure'); values.set(k,v); };
      window.getFixtureSettings = () => values.get('xbs_settings');
      window.GM_xmlhttpRequest = () => {throw Error('Unexpected network');};
      window.prompt = () => {throw Error('Unexpected native prompt');};
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({path:path.join(__dirname,'../src/x-bulk-scheduler.user.js')});
    const trigger = page.getByRole('button',{name:'Timing',exact:true});
    const form = page.locator('#xbs-timing-form');
    const start = page.getByLabel('Daily start time (browser local time, HH:MM)');
    const save = page.getByRole('button',{name:'Save timing'});
    await trigger.focus(); await trigger.press('Enter');
    assert.equal(await form.isVisible(),true);
    assert.equal(await page.getByLabel('Preset').evaluate(e=>document.activeElement===e),true);
    await start.fill('25:90'); await save.click();
    assert.match(await form.locator('[role=alert]').textContent(),/valid 24-hour/);
    assert.equal(JSON.parse(await page.evaluate(()=>window.getFixtureSettings())).dailyCap,48);
    await start.fill('09:30');
    await page.getByLabel('Gap in minutes (0 = bursts)').fill('-1'); await save.click();
    assert.equal(await form.isVisible(),true);
    await page.getByLabel('Gap in minutes (0 = bursts)').fill('30');
    await page.getByLabel('Days ahead (1–366)').fill('3');
    await page.getByLabel('Daily cap (1–1000)').fill('12');
    await page.evaluate(()=>window.failTiming=true); await save.click();
    assert.match(await form.locator('[role=alert]').textContent(),/Could not save/);
    assert.equal(await start.inputValue(),'09:30');
    assert.equal(JSON.parse(await page.evaluate(()=>window.getFixtureSettings())).dailyCap,48);
    await page.getByRole('button',{name:'Cancel timing'}).click();
    assert.equal(await form.isHidden(),true);
    assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);
    await trigger.click();
    assert.equal(await start.inputValue(),'00:00');
    await start.fill('09:30');
    await page.getByLabel('Gap in minutes (0 = bursts)').fill('30');
    await page.getByLabel('Days ahead (1–366)').fill('3');
    await page.getByLabel('Daily cap (1–1000)').fill('12');
    await page.evaluate(()=>window.failTiming=false); await save.click();
    await page.waitForFunction(()=>document.getElementById('xbs-timing-form').hidden);
    const settings = JSON.parse(await page.evaluate(()=>window.getFixtureSettings()));
    assert.equal(settings.unknownFutureSetting,'keep');
    assert.deepEqual({active:settings.active,startTime:settings.startTime,gapMinutes:settings.gapMinutes,daysAhead:settings.daysAhead,dailyCap:settings.dailyCap},
      {active:'12x4',startTime:'09:30',gapMinutes:30,daysAhead:3,dailyCap:12});
    await trigger.click(); await page.getByLabel('Preset').press('Escape');
    assert.equal(await form.isHidden(),true);
    assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);
  } finally {await browser.close();}
});
