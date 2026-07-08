#!/usr/bin/env node
// shot.mjs — screenshot + console-error harness for the critique loop.
// Usage: node tools/shot.mjs <url> <out.png> [WxH] [waitMs] [scrollY] [--reduced]
// Prints JSON: {"out": "...", "docHeight": N, "errors": [...], "pageErrors": [...]}
// Exit 0 even when the page has errors — the errors ARE the finding.
import { chromium } from 'playwright';

const [url, out, size = '1440x900', waitMs = '3500', scrollY = '0'] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'));
const reduced = process.argv.includes('--reduced');
const [width, height] = size.split('x').map(Number);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 2,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
});

const errors = [];
const pageErrors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
} catch (e) {
  pageErrors.push('goto: ' + String(e).slice(0, 200));
}
if (Number(scrollY) > 0) {
  await page.evaluate((y) => window.scrollTo(0, y), Number(scrollY));
}
await page.waitForTimeout(Number(waitMs));
const docHeight = await page
  .evaluate(() => document.documentElement.scrollHeight)
  .catch(() => -1);
await page.screenshot({ path: out });
await browser.close();
console.log(JSON.stringify({ out, docHeight, errors, pageErrors }));
