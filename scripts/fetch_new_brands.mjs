// 신규 북미 브랜드 4개의 최신 기사/신제품 정보 수집
import { chromium } from 'playwright';

const BRANDS = [
  { name:'Watson',          site:'https://www.watsonfurniture.com/whats-new', fallback:'https://www.watsonfurniture.com' },
  { name:'Davis Furniture', site:'https://www.davisfurniture.com/news',       fallback:'https://www.davisfurniture.com' },
  { name:'OFS',             site:'https://www.ofs.com/news',                  fallback:'https://www.ofs.com' },
  { name:'KI',              site:'https://www.ki.com/resources/news',         fallback:'https://www.ki.com' },
];

async function main() {
  const browser = await chromium.launch({ args:['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    locale:'en-US', viewport:{width:1280,height:800},
  });

  for (const b of BRANDS) {
    console.log(`\n=== ${b.name} ===`);
    const page = await ctx.newPage();
    try {
      await page.goto(b.site, {waitUntil:'domcontentloaded', timeout:20000});
      const title = await page.title();
      const url   = page.url();
      // og:description, og:title 추출
      const ogTitle = await page.evaluate(()=>{
        const el=document.querySelector('meta[property="og:title"]');
        return el?el.getAttribute('content'):'';
      });
      // 페이지 내 링크에서 news/product 관련 첫 5개 추출
      const links = await page.evaluate(()=>{
        return [...document.querySelectorAll('a[href]')]
          .filter(a=>{
            const h=a.href.toLowerCase();
            return (h.includes('news')||h.includes('product')||h.includes('launch')||h.includes('new')||h.includes('press'))
              && !h.includes('javascript') && a.textContent.trim().length>5;
          })
          .slice(0,5)
          .map(a=>({text:a.textContent.trim().replace(/\s+/g,' ').slice(0,80), href:a.href}));
      });
      console.log(`  페이지: ${url}`);
      console.log(`  제목: ${title}`);
      if(ogTitle) console.log(`  og:title: ${ogTitle}`);
      console.log(`  관련 링크:`);
      links.forEach(l=>console.log(`    - ${l.text}\n      ${l.href}`));
    } catch(e) {
      console.log(`  ❌ ${e.message} → fallback 시도`);
      try {
        await page.goto(b.fallback, {waitUntil:'domcontentloaded', timeout:15000});
        const title = await page.title();
        console.log(`  fallback 제목: ${title} (${page.url()})`);
      } catch(e2) {
        console.log(`  fallback도 실패: ${e2.message}`);
      }
    }
    await page.close();
  }
  await browser.close();
}
main().catch(console.error);
