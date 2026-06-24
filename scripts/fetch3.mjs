import https from 'https';
import fs from 'fs';
import { URL } from 'url';

const OUT = 'd:\\Myfolder\\products';

const items = [
  { file:'vitra-mynt', urls:[
    'https://www.dezeen.com/2025/04/07/vitra-mynt-chair-ronan-erwan-bouroullec/',
    'https://www.archdaily.com/999999/vitra-mynt',
    'https://www.vitra.com/en-us/office/seating/mynt',
  ]},
  { file:'steelcase-jeannouvel', urls:[
    'https://www.prnewswire.com/news-releases/coalesse-and-jean-nouvel-design-introduce-new-seating-collection-300903891.html',
    'https://www.steelcase.com/products/sofas/jean-nouvel-collection/',
    'https://www.dezeen.com/tag/coalesse/',
  ]},
  { file:'flokk-hag-tion', urls:[
    'https://www.flokk.com/en/brands/hag/chairs/hag-tion',
    'https://www.hag-global.com/chairs/hag-tion/',
    'https://www.connexin.no/en/hag-tion-mesh',
  ]},
];

function get(url, rd) {
  rd = rd === undefined ? 6 : rd;
  return new Promise(function(resolve, reject) {
    if (rd <= 0) return reject(new Error('Too many redirects'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124', 'Accept': 'text/html' },
      timeout: 14000,
    }, function(res) {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.destroy();
        try { return resolve(get(new URL(res.headers.location, url).href, rd-1)); }
        catch(e) { return reject(e); }
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', function(c) { body += c; if (body.length > 500000) res.destroy(); });
      res.on('end', function() { resolve({ s: res.statusCode, b: body }); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

function ogImg(html, base) {
  var ps = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (var i = 0; i < ps.length; i++) {
    var m = html.match(ps[i]);
    if (m && m[1]) {
      try { var u = new URL(m[1], base).href; if (u.startsWith('http')) return u; } catch(e) {}
    }
  }
  return null;
}

function dl(url, dest, ref, rd) {
  rd = rd === undefined ? 5 : rd;
  return new Promise(function(resolve, reject) {
    if (rd <= 0) return reject(new Error('Too many redirects'));
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': ref || url, 'Accept': 'image/*' },
      timeout: 18000,
    }, function(res) {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.destroy();
        try { return resolve(dl(new URL(res.headers.location, url).href, dest, ref, rd-1)); }
        catch(e) { return reject(e); }
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

function getExt(url) {
  var u = url.split('?')[0];
  var m = u.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  return m ? m[0].toLowerCase() : '.jpg';
}

async function main() {
  for (var i = 0; i < items.length; i++) {
    var p = items[i];
    var ok = false;
    for (var j = 0; j < p.urls.length; j++) {
      var url = p.urls[j];
      process.stdout.write('[' + p.file + '] ' + url.slice(0,55) + '... ');
      try {
        var r = await get(url);
        if (r.s !== 200) { console.log('HTTP ' + r.s); continue; }
        var img = ogImg(r.b, url);
        if (!img) { console.log('og:image 없음'); continue; }
        var ext = getExt(img);
        var dest = OUT + '\\' + p.file + ext;
        process.stdout.write('→ ');
        await dl(img, dest, url);
        console.log('✅ ' + Math.round(fs.statSync(dest).size / 1024) + 'KB  ext=' + ext);
        ok = true;
        break;
      } catch(e) {
        console.log('❌ ' + e.message);
      }
    }
    if (!ok) console.log('[' + p.file + '] 모두 실패');
  }
}

main().catch(console.error);
