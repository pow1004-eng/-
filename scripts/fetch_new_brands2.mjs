import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ args:['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    locale:'en-US', viewport:{width:1280,height:800},
  });

  const pages = [
    {label:'KI NeoCon', url:'https://www.ki.com/about/pressroom/press-releases/2026/ki-earns-seven-best-of-neocon-awards-including-best-of-competition-for-the-kiaura-collection-built-with-cognetic-technology/'},
    {label:'KI Whats New', url:'https://www.ki.com/whats-new/'},
    {label:'Watson products', url:'https://www.watsonfurniture.com/products/category/benching'},
    {label:'Davis main', url:'https://www.davisfurniture.com'},
    {label:'OFS products', url:'https://ofs.com/products/category'},
  ];

  for (const p of pages) {
    console.log(`\n=== ${p.label} ===`);
    const page = await ctx.newPage();
    try {
      await page.goto(p.url, {waitUntil:'domcontentloaded', timeout:20000});
      const ogTitle = await page.evaluate(()=>{
        const m=document.querySelector('meta[property="og:title"]');return m?m.getAttribute('content'):'';
      });
      const ogDesc = await page.evaluate(()=>{
        const m=document.querySelector('meta[property="og:description"],meta[name="description"]');return m?m.getAttribute('content'):'';
      });
      const h1 = await page.evaluate(()=>{
        const el=document.querySelector('h1,h2');return el?el.textContent.trim().slice(0,120):'';
      });
      const body = await page.evaluate(()=>{
        const el=document.querySelector('article,main,.content,.post-content,.entry-content');
        return el?el.textContent.replace(/\s+/g,' ').trim().slice(0,400):'';
      });
      console.log(`URL: ${page.url()}`);
      if(ogTitle) console.log(`og:title: ${ogTitle}`);
      if(h1)      console.log(`H1: ${h1}`);
      if(ogDesc)  console.log(`desc: ${ogDesc.slice(0,200)}`);
      if(body)    console.log(`본문: ${body}`);
    } catch(e) { console.log(`❌ ${e.message}`); }
    await page.close();
  }
  await browser.close();
}
main().catch(console.error);
