function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
  };
  return text.replace(/&[a-zA-Z0-9#]+;/g, match => entities[match] || match);
}

async function searchResults(keyword) {
  try {
    const url = `https://witanime.xyz/?search_param=animes&s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.world/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card-container');

    for (const block of blocks) {
      const hrefMatch = block.match(/<h3>\s*<a href="([^"]+)">/);
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
      const titleMatch = block.match(/<h3>\s*<a[^>]*>([^<]+)<\/a>/);

      if (hrefMatch && imgMatch && titleMatch) {
        results.push({
          title: decodeHTMLEntities(titleMatch[1].trim()),
          href: hrefMatch[1],
          image: imgMatch[1]
        });
      }
    }

    if (results.length === 0) {
      return JSON.stringify([{ title: 'No results found', href: '', image: '' }]);
    }

    return JSON.stringify(results);
  } catch (err) {
    return JSON.stringify([{ title: 'Error', href: '', image: '', error: err.message }]);
  }
}

// ===== استخراج البيانات =====
async function extractDetails(url) {
  try {
    const response = await fetchv2(url);
    const html = await response.text();
    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // استخراج الوصف
    const descMatch = html.match(/<p class="anime-story">([\s\S]*?)<\/p>/i);
    if (descMatch) {
      const rawDescription = descMatch[1].trim();
      if (rawDescription.length > 0) {
        description = decodeHTMLEntities(rawDescription);
      }
    }

    // استخراج التصنيفات (Genres)
    const genresMatch = html.match(/<ul class="anime-genres">([\s\S]*?)<\/ul>/i);
    if (genresMatch) {
      const genreItems = [...genresMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      const genres = genreItems.map(m => decodeHTMLEntities(m[1].trim()));
      if (genres.length > 0) {
        aliases = genres.join(", ");
      }
    }

    // استخراج سنة العرض
    const airdateMatch = html.match(/<div class="anime-info"><span>\s*بداية العرض:\s*<\/span>\s*(\d{4})/i);
    if (airdateMatch) {
      const extracted = airdateMatch[1].trim();
      if (/^\d{4}$/.test(extracted)) {
        airdate = extracted;
      }
    }

    return JSON.stringify([
      {
        description,
        aliases,
        airdate: `سنة العرض: ${airdate}`
      }
    ]);
  } catch {
    return JSON.stringify([
      {
        description: "تعذر تحميل الوصف.",
        aliases: "غير مصنف",
        airdate: "سنة العرض: غير معروفة"
      }
    ]);
  }
}

//==== Made by 50/50 ====
async function extractEpisodes(url) {
    const results = [];

    function decryptEpisodeData(encodedData) {
        const parts = encodedData.split(".");
        const encryptedData = atob(parts[0]);
        const xorKey = atob(parts[1]);

        let decryptedString = "";
        for (let i = 0; i < encryptedData.length; i++) {
            const decryptedChar = String.fromCharCode(
                encryptedData.charCodeAt(i) ^ xorKey.charCodeAt(i % xorKey.length)
            );
            decryptedString += decryptedChar;
        }
        return JSON.parse(decryptedString);
    }

    try {
        const response = await fetchv2(url);
        const html = await response.text();

        // 🛠 خلي الريجيكس يقبل أسطر متعددة
        const dataRegex = /processedEpisodeData\s*=\s*'([^']+)'/m;
        const dataMatch = html.match(dataRegex);

        if (!dataMatch) {
            console.log("⚠️ No processedEpisodeData found");
            return JSON.stringify([]);
        }

        const encodedData = dataMatch[1];
        const decoded = decryptEpisodeData(encodedData);

        decoded.forEach(ep => {
            const num = parseInt(ep.number, 10);
            results.push({
                href: ep.url,
                number: isNaN(num) ? 0 : num
            });
        });

        return JSON.stringify(results.sort((a, b) => a.number - b.number));
    } catch (err) {
        console.log("Episode extraction error:", err);
        return JSON.stringify([]);
    }
}

// =========================================================================
// =========================================================================
// ==== Sora stream ========================================================
async function extractStreamUrl(url) {
  // ==== Helper Functions ====
  const hasFetchV2 = typeof fetchv2 === "function";

  async function httpGet(u, opts = {}) {
    try {
      if (hasFetchV2) return await fetchv2(u, opts.headers || {}, opts.method || "GET", opts.body || null);
      return await fetch(u, { method: opts.method || "GET", headers: opts.headers || {}, body: opts.body || null });
    } catch {
      return null;
    }
  }

  function safeTrim(s) { return s ? String(s).trim() : ""; }

  function normalizeUrl(raw, base = "") {
    if (!raw) return raw;
    raw = safeTrim(raw);
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    try { return base ? new URL(raw, base).href : "https://" + raw.replace(/^\/+/, ""); } catch { return raw; }
  }

  // ==== Unpack Helper ====
  class Unbaser {
    constructor(base) {
      this.ALPHABET = { 62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" };
      this.dictionary = {};
      this.base = base;
      if (2 <= base && base <= 36) this.unbase = (value) => parseInt(value, base);
      else [...this.ALPHABET[62]].forEach((c,i)=>this.dictionary[c]=i), this.unbase=this._dictunbaser;
    }
    _dictunbaser(value) { return [...value].reverse().reduce((a,v,i)=>a+Math.pow(this.base,i)*this.dictionary[v],0); }
  }

  function unpack(source) {
    const juicers = [/}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/];
    let args;
    for(const j of juicers){ const m=j.exec(source); if(m){ args=m; break; } }
    if(!args) throw Error("Cannot parse p.a.c.k.e.r.");
    const [payload, radix, count, symtab] = [args[1], parseInt(args[2]), parseInt(args[3]), args[4].split("|")];
    const unbase = new Unbaser(radix);
    const lookup = (w) => (radix==1 ? symtab[parseInt(w)] : symtab[unbase.unbase(w)]) || w;
    return payload.replace(/\b\w+\b/g, lookup);
  }

  // ==== Stream Extractors ====
  async function extractStreamwish(html, baseUrl) {
    try {
      const obf = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
      if(!obf) return null;
      const unpacked = unpack(obf[1]);
      const m3u8 = unpacked.match(/file:"(https?:\/\/.*?\.m3u8.*?)"/);
      if(!m3u8) return null;
      return {
        title: "Streamwish",
        streamUrl: normalizeUrl(m3u8[1], baseUrl),
        type: "hls",
        headers: { Referer: baseUrl, "User-Agent": "Mozilla/5.0" }
      };
    } catch(e){ console.log("Streamwish extract error:", e); return null; }
  }

  async function extractDailymotion(url) {
    try {
      let videoId = null;
      const patterns = [
        /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
        /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,
        /[?&]video=([a-zA-Z0-9]+)/
      ];
      for(const p of patterns){ const m=url.match(p); if(m){videoId=m[1]; break;} }
      if(!videoId) return null;
      const meta = await (await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`)).json();
      const hlsLink = meta.qualities?.auto?.[0]?.url;
      if(!hlsLink) return null;
      return { title: "Dailymotion", streamUrl: hlsLink, type: "hls", headers:{ "User-Agent":"Mozilla/5.0" } };
    } catch(e){ console.log("Dailymotion extract error:", e); return null; }
  }

  async function extractVidea(url) {
    try {
      const res = await httpGet(url, { headers:{ "User-Agent":"Mozilla/5.0" } });
      if(!res) return null;
      const html = await res.text();
      const match = html.match(/"videoUrl"\s*:\s*"([^"]+)"/i);
      if(!match) return null;
      return { title:"Videa", streamUrl: match[1].replace(/\\\//g,"/"), type:"mp4", headers:{ Referer: url, "User-Agent":"Mozilla/5.0" } };
    } catch(e){ console.log("Videa extract error:",e); return null; }
  }

  // ==== Main Functionality ====
  try {
    const pageRes = await httpGet(url, { headers:{ "User-Agent":"Mozilla/5.0", Referer:url } });
    if(!pageRes) return JSON.stringify({ streams: [] });
    const pageHtml = await pageRes.text();

    // جمع كل السيرفرات الظاهرة على الصفحة
    const serverRe = /<a[^>]+class=["']server-link["'][^>]+data-server-id=["'](\d+)["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi;
    const servers = [];
    let m;
    while((m = serverRe.exec(pageHtml)) !== null){
      const title = safeTrim(m[2]);
      const serverId = m[1];
      servers.push({ title, serverId });
    }

    // جمع الروابط الموجودة داخل iframes
    const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
    const iframes = [...pageHtml.matchAll(iframeRe)].map(x=>normalizeUrl(x[1], url));

    const results = [];
    for(const srv of servers){
      let rawUrl = iframes[parseInt(srv.serverId)] || url;
      let data = null;
      if(/dailymotion/i.test(srv.title)) data = await extractDailymotion(rawUrl);
      else if(/videa/i.test(srv.title)) data = await extractVidea(rawUrl);
      else if(/streamwish/i.test(srv.title)) data = await extractStreamwish(pageHtml, url);
      if(data) results.push(data);
    }

    // إعادة كل النتائج المتاحة
    return JSON.stringify({ streams: results, subtitles: "" });

  } catch(e){ console.log("extractStreamUrl error:", e); return JSON.stringify({ streams: [] }); }
}
