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

// ===== استخراج الحلقات =====
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
  const hasFetchV2 = typeof fetchv2 === "function";

  async function httpGet(u, opts = {}) {
    try {
      if (hasFetchV2) return await fetchv2(u, opts.headers || {}, opts.method || "GET", opts.body || null);
      return await fetch(u, { method: opts.method || "GET", headers: opts.headers || {}, body: opts.body || null });
    } catch { return null; }
  }

  function normalizeUrl(raw, base = "") {
    if (!raw) return raw;
    raw = String(raw).trim();
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    try { return base ? new URL(raw, base).href : "https://" + raw.replace(/^\/+/, ""); } catch { return raw; }
  }

  // ==== Streamwish Extractor ====
  async function extractStreamwish(html, baseUrl) {
    try {
      const obfMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
      if (!obfMatch) return null;
      const unpacked = unpack(obfMatch[1]);
      const m3u8Match = unpacked.match(/file:"(https?:\/\/.*?\.m3u8.*?)"/);
      if (!m3u8Match) return null;
      return { quality: "auto", url: m3u8Match[1], type: "hls", server: "Streamwish" };
    } catch { return null; }
  }

  // ==== Dailymotion Extractor ====
  async function extractDailymotion(url) {
    try {
      let videoId = null;
      const patterns = [
        /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,          
        /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,    
        /[?&]video=([a-zA-Z0-9]+)/
      ];
      for (const p of patterns) {
        const match = url.match(p);
        if (match) { videoId = match[1]; break; }
      }
      if (!videoId) return null;

      const metaRes = await httpGet(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
      if (!metaRes) return null;
      const metaJson = await metaRes.json();
      const hlsLink = metaJson.qualities?.auto?.[0]?.url;
      if (!hlsLink) return null;

      async function getBestHls(hlsUrl) {
        try {
          const res = await httpGet(hlsUrl);
          const text = await res.text();
          const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
          const streams = [];
          let match;
          while ((match = regex.exec(text)) !== null) {
            streams.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
          }
          if (!streams.length) return hlsUrl;
          streams.sort((a, b) => b.height - a.height);
          return streams[0].url;
        } catch { return hlsUrl; }
      }

      const bestHls = await getBestHls(hlsLink);
      return { quality: "auto", url: bestHls, type: "hls", server: "Dailymotion" };
    } catch { return null; }
  }

  // ==== Main Extraction ====
  try {
    const pageRes = await httpGet(url);
    if (!pageRes) return JSON.stringify({ streams: [] });
    const html = await pageRes.text();

    // ==== البحث عن السيرفرات ====
    const serverRe = /<a[^>]+class=["']server-link["'][^>]+data-server-id=["'](\d+)["'][^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi;
    const servers = []; let m;
    while ((m = serverRe.exec(html)) !== null) {
      const id = m[1], name = m[2];
      if (/dailymotion|streamwish/i.test(name)) servers.push({ id, name });
    }
    if (!servers.length) return JSON.stringify({ streams: [] });

    const streamsPromises = servers.map(async s => {
      let embedUrl = url;
      const iframeMatch = html.match(new RegExp(`data-server-id=["']${s.id}["'][^>]*onclick=["']loadIframe\$begin:math:text$this\\$end:math:text$["']`, "i"));
      if (iframeMatch) {
        const ifr = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (ifr) embedUrl = normalizeUrl(ifr[1], url);
      }
      if (/streamwish/i.test(s.name)) return { server: s.name, data: await extractStreamwish(html, embedUrl) };
      if (/dailymotion/i.test(s.name)) return { server: s.name, data: await extractDailymotion(embedUrl) };
      return null;
    });

    const results = (await Promise.all(streamsPromises)).filter(r => r?.data);
    if (!results.length) return JSON.stringify({ streams: [] });

    // ==== واجهة اختيار السيرفر ====
    const choice = await soraPrompt({ title: "اختار سيرفر المشاهدة", options: results.map(r => r.server) });
    const selected = results[choice];
    if (!selected) return JSON.stringify({ streams: [] });

    const finalStreams = Array.isArray(selected.data) ? selected.data : [selected.data];
    return JSON.stringify({ streams: finalStreams });
  } catch (e) {
    console.log("extractStreamUrl error:", e);
    return JSON.stringify({ streams: [] });
  }
}

/* Helper: unpack for Streamwish JS */
class Unbaser {
  constructor(base) {
    this.ALPHABET = { 62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" };
    this.dictionary = {};
    this.base = base;
    [...this.ALPHABET[62]].forEach((c,i)=>this.dictionary[c]=i);
    this.unbase = v=>{let r=0;[...v].reverse().forEach((c,i)=>r+=Math.pow(this.base,i)*this.dictionary[c]);return r;}
  }
}
function unpack(source) { return source; } // خليه صالح مع سورا، لو تحتاج unpack حقيقي حط المكتبة

// !!!! ===== سورا فيتش =====!!!!
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
