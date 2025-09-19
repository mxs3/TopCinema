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

// =======================================================================================
// =======================================================================================
// ==== Sora stream Made by 50/50 ========================================================
// ====== Complete hardened extractor for Sora (copy-paste ready) ======

async function extractStreamUrl(url) {
    try {
        const resMain = await safeFetch(url, {}, 10000);
        if (!resMain) throw new Error("Failed to fetch main page");
        const html = await resMain.text();
        const results = [];

        // 0) فك السيرفرات المشفرة داخل الصفحة (مثل WitAnime) وجلب المحتوى منها (محدود 15)
        try {
            const decodedServers = a(html).slice(0, 15);
            for (const srv of decodedServers) {
                try {
                    const r = await safeFetch(absoluteUrl(srv.url, url), { headers: { Referer: url } }, 9000);
                    if (!r) continue;
                    const txt = await r.text();
                    collectMediaFromHtml(txt, results, srv.name || `decoded:${srv.id}`);
                } catch (e) {
                    console.log("decoded server fetch err:", srv.url, e && e.message);
                }
            }
        } catch (e) { /* continue */ }

        // 1) افتح أي iframe في الصفحة الأساسية (محدود أول 12)
        try {
            const iframeMatches = [...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/g)].slice(0, 12);
            for (const m of iframeMatches) {
                const ifr = absoluteUrl(m[1], url);
                try {
                    const r = await safeFetch(ifr, { headers: { Referer: url } }, 9000);
                    if (!r) continue;
                    const txt = await r.text();
                    collectMediaFromHtml(txt, results, `iframe:${ifr}`);
                } catch (e) {
                    console.log("iframe fetch err:", ifr, e && e.message);
                }
            }
        } catch (e) { /* continue */ }

        // 2) التقط أي روابط مباشرة في الصفحة نفسها
        collectMediaFromHtml(html, results, "page");

        // 3) فك سكربتات packed eval وابحث داخل السكربتات عن m3u8/mp4 (آمن)
        try {
            const evalScripts = [...html.matchAll(/<script[^>]*>(eval\(function\(p,a,c,k,e,d[\s\S]*?\))<\/script>/g)];
            for (const s of evalScripts) {
                try {
                    const unpacked = unpack(s[1]);
                    collectMediaFromHtml(unpacked, results, "unpacked-eval");
                } catch (e) { /* تجاهل الفشل هنا */ }
            }

            const scriptBlocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
            for (const sb of scriptBlocks) {
                const body = sb[1];
                try {
                    const maybeM3u8 = await safeCallB(body);
                    if (maybeM3u8) collectMediaFromHtml(maybeM3u8, results, "b-unpacked");
                } catch (e) {}
                try {
                    const maybeMp4 = await safeCallC(body);
                    if (maybeMp4) collectMediaFromHtml(maybeMp4, results, "c-extracted");
                } catch (e) {}
            }
        } catch (e) { /* continue */ }

        // 4) اختياري: لو ظهر رابط دالي موشن داخل النتائج نقدر نحلله للحصول على master m3u8 (غير مفعل تلقائياً)
        // لو احتجت تشغيل extractDailymotion لكل رابط دailymotion في النتائج فعّل هذا الجزء بحذر.

        // dedupe + validate
        const unique = dedupeResults(results).filter(r => isValidUrl(r.url));
        if (unique.length === 0) throw new Error("No working streams found");

        // اصنع خيارات ل soraPrompt
        const options = unique.map(r => `${r.source} → ${r.url}`);

        // اطلب من المستخدم يختار عبر soraPrompt — لو soraPrompt غير متاحة تسترجع أول لينك
        let choiceIndex = null;
        try {
            const choice = await soraPrompt("اختر الفيديو اللي تحب تشغله:", options);
            choiceIndex = (typeof choice === "number") ? choice : null;
        } catch (e) {
            // soraPrompt مش متاحة أو المستخدم ألغا -> نستخدم أول رابط تلقائياً
            choiceIndex = null;
        }

        if (choiceIndex === null || choiceIndex < 0 || choiceIndex >= unique.length) {
            return unique[0].url;
        }
        return unique[choiceIndex].url;

    } catch (err) {
        console.error("extractStreamUrl final error:", err && err.message);
        return "https://files.catbox.moe/avolvc.mp4";
    }
}

// ----------------- Helpers -----------------

// safeFetch with timeout (uses fetchv2 to remain compatible with Sora)
async function safeFetch(input, init = {}, timeoutMs = 8000) {
    try {
        return await Promise.race([
            (typeof fetchv2 === "function" ? fetchv2(input, init) : fetch(input, init)),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))
        ]);
    } catch (e) {
        return null;
    }
}

function isValidUrl(u) {
    try {
        if (!u) return false;
        const parsed = new URL(u);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch { return false; }
}

function collectMediaFromHtml(text, resultsArray, sourceLabel = "unknown") {
    if (!text) return;
    const s = String(text);
    // catch m3u8 (with optional query)
    const hlsMatches = [...s.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g)];
    for (const h of hlsMatches) {
        resultsArray.push({ source: sourceLabel + " (HLS)", url: h[0].trim() });
    }
    // catch mp4
    const mp4Matches = [...s.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g)];
    for (const m of mp4Matches) {
        resultsArray.push({ source: sourceLabel + " (MP4)", url: m[0].trim() });
    }
}

// make absolute URL if iframe src is relative
function absoluteUrl(maybeRelative, base) {
    try {
        return new URL(maybeRelative, base).toString();
    } catch { return String(maybeRelative); }
}

function dedupeResults(results) {
    const seen = new Set();
    const out = [];
    for (const r of results) {
        if (!r || !r.url) continue;
        const key = r.url.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ source: r.source || "unknown", url: key });
    }
    return out;
}

// safe wrappers for b and c
async function safeCallB(data) {
    try { return await b(data); } catch (e) { return null; }
}
async function safeCallC(data) {
    try { return await c(data); } catch (e) { return null; }
}

// ----------------- WitAnime / obfuscation helpers -----------------

// a(html): decode _zG/_zH registries into servers array {id, name, url}
function a(html) {
    try {
        const zGMatch = String(html).match(/var _zG="([^"]+)";/);
        const zHMatch = String(html).match(/var _zH="([^"]+)";/);
        if (!zGMatch || !zHMatch) return [];

        let resourceRegistry, configRegistry;
        try {
            resourceRegistry = JSON.parse(atob(zGMatch[1]));
            configRegistry = JSON.parse(atob(zHMatch[1]));
        } catch (e) {
            return [];
        }

        const serverNames = {};
        const serverLinks = String(html).matchAll(/<a[^>]+class="server-link"[^>]+data-server-id="(\d+)"[^>]*>\s*<span class="ser">([^<]+)<\/span>/g);
        for (const match of serverLinks) {
            serverNames[match[1]] = match[2].trim();
        }

        const servers = [];
        const maxI = Math.max(resourceRegistry.length || 0, 20);
        for (let i = 0; i < maxI; i++) {
            const resourceData = resourceRegistry[i];
            const config = configRegistry[i];
            if (!resourceData || !config) continue;
            try {
                let decrypted = String(resourceData).split('').reverse().join('');
                decrypted = decrypted.replace(/[^A-Za-z0-9+/=]/g, '');
                let rawUrl = atob(decrypted);

                const indexKey = atob(String(config.k || ""));
                const idx = parseInt(indexKey || "0", 10);
                const paramOffset = (config.d && config.d[idx]) ? config.d[idx] : 0;
                if (paramOffset && rawUrl.length > paramOffset) {
                    rawUrl = rawUrl.slice(0, -paramOffset);
                }

                servers.push({ id: i, name: serverNames[i] || `Server ${i}`, url: rawUrl.trim() });
            } catch (e) {
                continue;
            }
        }
        return servers;
    } catch (e) {
        return [];
    }
}

// b(data): try to unpack eval-packed script and extract m3u8 (or any m3u8 inside)
async function b(data, url = null) {
    try {
        if (!data) return null;
        const scrMatch = String(data).match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?\))<\/script>/);
        const packed = scrMatch ? scrMatch[1] : null;
        if (!packed) return null;
        const unpacked = unpack(packed);
        if (!unpacked) return null;
        const m3u8Match = unpacked.match(/["']hls2["']\s*:\s*["']([^"']+)["']/);
        if (m3u8Match) return m3u8Match[1];
        const general = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        return general ? general[0] : null;
    } catch (e) {
        return null;
    }
}

// c(data): try to extract mp4 from script variables or direct occurrences
async function c(data, url = null) {
    try {
        if (!data) return null;
        const srcMatch = String(data).match(/src\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
        if (srcMatch) return srcMatch[1];
        const general = String(data).match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/);
        return general ? general[0] : null;
    } catch (e) {
        return null;
    }
}

// ==== Dailymotion helper (optional usage) ====
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
        if (!videoId) throw new Error("Invalid Dailymotion URL");

        const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();
        const hlsLink = metaJson.qualities?.auto?.[0]?.url;
        if (!hlsLink) throw new Error("No playable HLS link found");

        async function getBestHls(hlsUrl) {
            try {
                const r = await fetch(hlsUrl);
                const text = await r.text();
                const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
                const streams = [];
                let match;
                while ((match = regex.exec(text)) !== null) {
                    streams.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
                }
                if (streams.length === 0) return hlsUrl;
                streams.sort((a, b) => b.height - a.height);
                return streams[0].url;
            } catch { return hlsUrl; }
        }
        return await getBestHls(hlsLink);
    } catch (e) {
        console.error("extractDailymotion err:", e && e.message);
        return null;
    }
}

// ==== Unpacker (p.a.c.k.e.r) minimal utilities ====
class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] || this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        } else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            } catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function detect(source) {
    return String(source || "").replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
    const args = _filterargs(source);
    let { payload, symtab, radix, count } = args;
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    const unbase = new Unbaser(radix);
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        } else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);

    function _filterargs(source) {
        const juicers = [
            /}$begin:math:text$'(.*)', *(\\d+|\\[\\]), *(\\d+), *'(.*)'\\.split\\('\\|'$end:math:text$, *\d+, *.*\)\)/,
            /}$begin:math:text$'(.*)', *(\\d+|\\[\\]), *(\\d+), *'(.*)'\\.split\\('\\|'$end:math:text$/,
        ];
        for (const juicer of juicers) {
            const m = juicer.exec(source);
            if (m) {
                try {
                    return {
                        payload: m[1],
                        symtab: m[4].split("|"),
                        radix: parseInt(m[2]),
                        count: parseInt(m[3]),
                    };
                } catch {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }

    function _replacestrings(source) {
        return source;
    }
}
