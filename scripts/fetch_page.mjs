// 쿠키 자동 동의 + 페이지 내용 추출 스크립트
// 사용법: node scripts/fetch_page.mjs <URL>
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) {
  console.error('사용법: node scripts/fetch_page.mjs <URL>');
  process.exit(1);
}

// 쿠키 동의 버튼 텍스트 패턴 (순서대로 시도)
const COOKIE_BTN_PATTERNS = [
  'Accept all',
  'Accept All',
  'Accept all cookies',
  'Allow all',
  'Allow All',
  'I agree',
  'Agree',
  'OK',
  'Accept',
  '모두 수락',
  '모두 동의',
  '동의',
  '수락',
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
  });
  const page = await context.newPage();

  console.log(`\n📄 페이지 로딩: ${url}\n`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 쿠키 동의 버튼 자동 클릭 시도
  let cookieClicked = false;
  for (const text of COOKIE_BTN_PATTERNS) {
    try {
      const btn = page.getByRole('button', { name: new RegExp(text, 'i') });
      const count = await btn.count();
      if (count > 0) {
        await btn.first().click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        cookieClicked = true;
        console.log(`✅ 쿠키 동의 완료: "${text}"\n`);
        break;
      }
    } catch {}
  }

  if (!cookieClicked) {
    // 대안: 쿠키 배너 내 링크나 버튼 시도
    try {
      const acceptLink = page.locator('a, button').filter({ hasText: /accept|allow|agree/i });
      const count = await acceptLink.count();
      if (count > 0) {
        await acceptLink.first().click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        console.log('✅ 쿠키 동의 완료 (대안)\n');
        cookieClicked = true;
      }
    } catch {}
  }

  if (!cookieClicked) {
    console.log('⚠️  쿠키 동의 버튼 없음 (또는 이미 동의됨)\n');
  }

  // 페이지 로딩 대기
  await page.waitForTimeout(1500);

  // 제목
  const title = await page.title();
  console.log(`📌 제목: ${title}\n`);

  // 메타 description
  const metaDesc = await page.$eval(
    'meta[name="description"], meta[property="og:description"]',
    el => el.getAttribute('content')
  ).catch(() => '');
  if (metaDesc) console.log(`📝 메타 설명: ${metaDesc}\n`);

  // 본문 텍스트 추출 (헤더/푸터/nav 제외)
  const bodyText = await page.evaluate(() => {
    const remove = ['header','footer','nav','script','style','noscript','.cookie','#cookie','[class*="cookie"]','[id*="cookie"]'];
    remove.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
    const main = document.querySelector('main, article, .content, #content, .product-detail, .page-content');
    const el = main || document.body;
    return el.innerText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 20)
      .slice(0, 60)
      .join('\n');
  });

  console.log('─────────────────────────────────────────');
  console.log('📄 본문 내용:\n');
  console.log(bodyText);
  console.log('─────────────────────────────────────────');

  await browser.close();
}

run().catch(e => {
  console.error('오류:', e.message);
  process.exit(1);
});
