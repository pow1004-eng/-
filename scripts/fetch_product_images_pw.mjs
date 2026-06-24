/**
 * 주목 신제품 대표 이미지 자동 수집 (Playwright 기반)
 * - index.html에서 제품 ID + 기사 URL 자동 파싱
 * - 실제 Chromium 브라우저로 og:image 추출 (봇 차단 우회)
 * - products/ 폴더에 저장 후 index.html PRODUCTS 매핑 자동 업데이트
 */
import { chromium } from 'playwright';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.join(__dirname, '..');
const INDEX      = path.join(ROOT, 'index.html');
const PROD_DIR   = path.join(ROOT, 'products');

if (!fs.existsSync(PROD_DIR)) fs.mkdirSync(PROD_DIR, { recursive: true });

// index.html에서 주목 신제품 항목 파싱 (bc-id → 기사 URL)
function parseProducts(html) {
  const items = [];
  // .pi 블록 전체를 매칭
  const piRe = /class="pi[^"]*"[^>]*onclick="pClick\(event,'(bc-[^']+)'\)"([\s\S]*?)(?=class="pi[^"]*"|class="p-all")/g;
  let m;
  while ((m = piRe.exec(html)) !== null) {
    const id    = m[1];
    const block = m[2];
    const link  = block.match(/href="([^"#][^"]*)"[^>]*>↗/);
    if (link && link[1].startsWith('http')) {
      items.push({ id, url: link[1] });
    }
  }
  return items;
}

// 파일 확장자 추출
function getExt(imgUrl) {
  const u = imgUrl.split('?')[0].split('#')[0];
  const m = u.match(/\.(webp|png|jpg|jpeg|gif)$/i);
  return m ? m[0].toLowerCase().replace('.jpeg', '.jpg') : '.jpg';
}

// 이미지 다운로드
function downloadImg(imgUrl, dest, referer, rd = 5) {
  return new Promise((resolve, reject) => {
    if (rd <= 0) return reject(new Error('Too many redirects'));
    const mod = imgUrl.startsWith('https') ? https : http;
    mod.get(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
        'Referer': referer,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      timeout: 25000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.destroy();
        try { return resolve(downloadImg(new URL(res.headers.location, imgUrl).href, dest, referer, rd - 1)); }
        catch(e) { return reject(e); }
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  const html     = fs.readFileSync(INDEX, 'utf8');
  const products = parseProducts(html);

  if (products.length === 0) {
    console.log('❌ 주목 신제품 항목을 찾을 수 없습니다.');
    process.exit(1);
  }
  console.log(`📋 주목 신제품 ${products.length}개 발견\n`);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  });

  const newMapping = {};

  for (const p of products) {
    const fileBase = p.id.replace('bc-', 'prod-');
    console.log(`[${p.id}] ${p.url.slice(0, 65)}...`);

    try {
      const page = await context.newPage();
      await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 25000 });

      // og:image / twitter:image 추출
      const ogImage = await page.evaluate(() => {
        const sel = [
          'meta[property="og:image"]',
          'meta[property="og:image:url"]',
          'meta[name="twitter:image"]',
          'meta[name="twitter:image:src"]',
        ];
        for (const s of sel) {
          const el = document.querySelector(s);
          if (el) {
            const v = el.getAttribute('content') || el.getAttribute('value');
            if (v && v.startsWith('http')) return v;
          }
        }
        // 폴백: 첫 번째 큰 이미지
        const imgs = [...document.querySelectorAll('img')];
        const big  = imgs.find(img => img.naturalWidth > 400 && img.src.startsWith('http'));
        return big ? big.src : null;
      });

      await page.close();

      if (!ogImage) { console.log('  ❌ 이미지 없음\n'); continue; }

      const imgUrl = new URL(ogImage, p.url).href;
      const ext    = getExt(imgUrl);
      const dest   = path.join(PROD_DIR, fileBase + ext);

      process.stdout.write(`  → 다운로드 중... `);
      await downloadImg(imgUrl, dest, p.url);
      const kb = Math.round(fs.statSync(dest).size / 1024);
      console.log(`✅ ${fileBase}${ext} (${kb}KB)\n`);
      newMapping[p.id] = `products/${fileBase}${ext}`;

    } catch(e) {
      console.log(`  ❌ ${e.message}\n`);
    }
  }

  await browser.close();

  // index.html PRODUCTS 매핑 업데이트
  const count = Object.keys(newMapping).length;
  if (count > 0) {
    const lines   = Object.entries(newMapping).map(([k,v]) => `    '${k}': '${v}',`).join('\n');
    const updated = html.replace(
      /\/\/ 주목 신제품 대표 이미지[^\n]*\n\s*var PRODUCTS=\{[\s\S]*?\};/,
      `// 주목 신제품 대표 이미지 (products/ 폴더에 파일 추가 시 여기에 등록)\n  var PRODUCTS={\n${lines}\n  };`
    );
    if (updated !== html) {
      fs.writeFileSync(INDEX, updated, 'utf8');
      console.log(`✅ index.html PRODUCTS 매핑 업데이트 (${count}개)`);
    }
  }

  console.log(`\n=== 완료: ${count} / ${products.length}개 성공 ===`);
  if (count < products.length) process.exit(1); // CI에서 부분 실패 표시
}

main().catch(e => { console.error(e); process.exit(1); });
