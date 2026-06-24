// 실패한 4개 항목 재시도 (대체 URL 사용)
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const ROOT = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'), '..', '..');
const OUT  = path.join(ROOT, 'products');

const PRODUCTS = [
  { id:'bc-ko', file:'kokuyo-ingcloud',
    urls:['https://www.kokuyo-furniture.co.jp/products/ingcloud/',
          'https://www.kokuyo.com/en/products/ingcloud/',
          'https://kokuyo.com/en/insights/20260610.html'] },
  { id:'bc-vi', file:'vitra-mynt',
    urls:['https://www.vitra.com/en-us/office/product/details/mynt',
          'https://www.vitra.com/en-ch/office/product/details/mynt',
          'https://www.vitra.com/en-us/product/mynt'] },
  { id:'bc-sc', file:'steelcase-jeannouvel',
    urls:['https://www.steelcase.com/products/office-chairs/coalesse-jean-nouvel-seating-collection/',
          'https://www.steelcase.com/research/articles/jean-nouvel-seating-collection/',
          'https://www.coalesse.com/products/seating/lounge-seating/jean-nouvel-seating-collection/'] },
  { id:'bc-fl', file:'flokk-hag-tion',
    urls:['https://www.flokk.com/en/brands/hag/chairs/hag-tion-mesh',
          'https://www.hag-global.com/products/tion/',
          'https://www.flokk.com/en/news/2023/hag-tion-mesh-is-here'] },
];

function get(url, redirects=6) {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error('Too many redirects'));
    try {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 20000,
      }, res => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          try {
            const next = new URL(res.headers.location, url).href;
            res.destroy();
            return resolve(get(next, redirects - 1));
          } catch(e) { res.destroy(); return reject(e); }
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; if (body.length > 500000) res.destroy(); });
        res.on('end', () => resolve({ status: res.statusCode, body }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    } catch(e) { reject(e); }
  });
}

function extractOgImage(html, baseUrl) {
  const patterns = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    /property=["']og:image:url["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && m[1].length > 4) {
      try {
        const img = new URL(m[1], baseUrl).href;
        if (img.startsWith('http')) return img;
      } catch(e) {}
    }
  }
  return null;
}

function getExt(imgUrl) {
  const u = imgUrl.split('?')[0].split('#')[0];
  const e = path.extname(u).toLowerCase();
  return ['.jpg','.jpeg','.png','.webp','.gif'].includes(e) ? e : '.jpg';
}

function downloadImage(imgUrl, destPath, referer, redirects=5) {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) return reject(new Error('Too many redirects'));
    const mod = imgUrl.startsWith('https') ? https : http;
    const req = mod.get(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Referer': referer || imgUrl,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      timeout: 20000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        try {
          const next = new URL(res.headers.location, imgUrl).href;
          res.destroy();
          return resolve(downloadImage(next, destPath, referer, redirects-1));
        } catch(e) { res.destroy(); return reject(e); }
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => resolve(destPath));
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  for (const p of PRODUCTS) {
    console.log(`\n[${p.id}] ${p.file}`);
    let success = false;
    for (const url of p.urls) {
      process.stdout.write(`  시도: ${url.slice(0,60)}... `);
      try {
        const { status, body } = await get(url);
        if (status !== 200) { console.log(`HTTP ${status}`); continue; }
        const imgUrl = extractOgImage(body, url);
        if (!imgUrl) { console.log(`og:image 없음`); continue; }
        const ext = getExt(imgUrl);
        const dest = path.join(OUT, p.file + ext);
        process.stdout.write(`→ 다운로드... `);
        await downloadImage(imgUrl, dest, url);
        const sz = fs.statSync(dest).size;
        console.log(`✅ ${p.file}${ext} (${Math.round(sz/1024)}KB)`);
        if (ext !== '.jpg') console.log(`    ⚠️  확장자: ${ext} (PRODUCTS 매핑 업데이트 필요)`);
        success = true;
        break;
      } catch(e) {
        console.log(`❌ ${e.message}`);
      }
    }
    if (!success) console.log(`  → 모든 URL 실패`);
  }
}

main().catch(console.error);
