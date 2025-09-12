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
// === Main extractor (modified) ===
async function extractStreamUrl(url) {
    try {
        const resPage = await fetchv2(url);
        const pageHtml = await resPage.text();

        const servers = a(pageHtml);
        console.log("Detected servers:", JSON.stringify(servers));

        const priorities = [
            "streamwish - fhd",
            "streamwish",
            "mp4upload",
            "playerwish - fhd",
            "playerwish",
            "dailymotion"
        ];

        const ordered = [];
        for (const provider of priorities) {
            const found = servers.filter(s => s.name.toLowerCase().includes(provider));
            for (const f of found) ordered.push(f);
        }
        for (const s of servers) {
            if (!ordered.some(x => x.id === s.id)) ordered.push(s);
        }

        if (ordered.length === 0) {
            throw new Error("No servers detected on page");
        }

        const workingServers = [];
        for (const srv of ordered) {
            try {
                console.log("Trying server:", srv.name, srv.url);
                let qualities = [];

                const name = (srv.name || "").toLowerCase();

                if (name.includes("streamwish")) {
                    const newUrl = "https://hgplaycdn.com/e/" + srv.url.replace(/^https?:\/\/[^/]+\/e\//, '');
                    const res = await fetchv2(newUrl);
                    const html = await res.text();
                    qualities = await b(html);
                } else if (name.includes("playerwish")) {
                    const res = await fetchv2(srv.url);
                    const html = await res.text();
                    qualities = await b(html);
                } else if (name.includes("mp4upload")) {
                    const res = await fetchv2(srv.url);
                    const html = await res.text();
                    qualities = await c(html);
                } else if (name.includes("dailymotion")) {
                    qualities = await extractDailymotion(srv.url);
                } else {
                    try {
                        const res = await fetchv2(srv.url);
                        const html = await res.text();
                        const maybe = await tryGenericExtract(html, srv.url);
                        qualities = maybe;
                    } catch (e) {
                        qualities = [];
                    }
                }

                if (Array.isArray(qualities) && qualities.length > 0) {
                    workingServers.push({
                        id: srv.id,
                        name: srv.name,
                        url: srv.url,
                        qualities
                    });
                } else {
                    console.log("Server produced no qualities:", srv.name);
                }
            } catch (e) {
                console.warn("Server check failed for", srv.name, e);
            }
        }

        if (workingServers.length === 0) {
            throw new Error("No working servers found");
        }

        // --- اسأل المستخدم يختار السيرفر ---
        let finalServer;
        if (workingServers.length === 1) {
            finalServer = workingServers[0];
        } else {
            try {
                const choice = await soraPrompt(
                    "فيه أكتر من سيرفر شغال. اختار السيرفر اللي تحب تشغله:",
                    workingServers.map(s => s.name)
                );
                finalServer = workingServers.find(s => s.name === choice) || workingServers[0];
            } catch (e) {
                console.warn("soraPrompt failed, defaulting to first working server", e);
                finalServer = workingServers[0];
            }
        }

        // --- اسأل المستخدم يختار الجودة ---
        let finalQuality;
        if (finalServer.qualities.length === 1) {
            finalQuality = finalServer.qualities[0];
        } else {
            try {
                const choice = await soraPrompt(
                    `السيرفر (${finalServer.name}) عنده أكتر من جودة. اختار الجودة:`,
                    finalServer.qualities.map(q => q.quality)
                );
                finalQuality = finalServer.qualities.find(q => q.quality === choice) || finalServer.qualities[0];
            } catch (e) {
                console.warn("soraPrompt failed, defaulting to first quality", e);
                finalQuality = finalServer.qualities[0];
            }
        }

        return [{ quality: finalQuality.quality, url: finalQuality.url }];

    } catch (err) {
        console.error("extractStreamUrl failed:", err);
        return [{ quality: "fallback", url: "https://files.catbox.moe/avolvc.mp4" }];
    }
}

// === helper to try generic extraction from arbitrary html (hls/mp4) ===
async function tryGenericExtract(html, baseUrl = null) {
    try {
        // جرب تبحث عن m3u8 مباشر
        const m3u8Direct = html.match(/https?:\/\/[^\s"'<>]+\.m3u8/g);
        if (m3u8Direct && m3u8Direct.length > 0) {
            // خذ الأول وافتحه لاستخراج الجودات
            return await extractHlsQualities(m3u8Direct[0]);
        }
        // جرب mp4
        const mp4Match = html.match(/https?:\/\/[^\s"'<>]+\.mp4/g);
        if (mp4Match && mp4Match.length > 0) {
            return mp4Match.map(u => ({ quality: "default", url: u }));
        }
        return [];
    } catch (e) {
        return [];
    }
}

// === function a(html) unchanged but robust ===
function a(html) {
    try {
        const zGMatch = html.match(/var _zG="([^"]+)";/);
        const zHMatch = html.match(/var _zH="([^"]+)";/);
        if (!zGMatch || !zHMatch) throw new Error("Could not find _zG or _zH in HTML");

        const resourceRegistry = JSON.parse(atob(zGMatch[1]));
        const configRegistry = JSON.parse(atob(zHMatch[1]));

        const serverNames = {};
        const serverLinks = html.matchAll(
            /<a[^>]+class="server-link"[^>]+data-server-id="(\d+)"[^>]*>\s*<span class="ser">([^<]+)<\/span>/g
        );
        for (const match of serverLinks) {
            serverNames[match[1]] = match[2].trim();
        }

        const servers = [];
        for (let i = 0; i < 10; i++) {
            const resourceData = resourceRegistry[i];
            const config = configRegistry[i];
            if (!resourceData || !config) continue;

            let decrypted = resourceData.split('').reverse().join('');
            decrypted = decrypted.replace(/[^A-Za-z0-9+/=]/g, '');
            let rawUrl = atob(decrypted);

            const indexKey = atob(config.k);
            const paramOffset = config.d[parseInt(indexKey, 10)];
            rawUrl = rawUrl.slice(0, -paramOffset);

            servers.push({
                id: i,
                name: serverNames[i] || `Unknown Server ${i}`,
                url: rawUrl.trim()
            });
        }

        return servers;
    } catch (error) {
        console.warn("a(html) failed:", error);
        return [];
    }
}

// === b(data) now returns array of qualities for HLS (Streamwish/Playerwish) ===
async function b(data, url = null) {
    try {
        // نحاول نلاقي سكربت مطبّق p.a.c.k.e.r أو hls url مباشرة
        // 1) لو في m3u8 مباشر في الصفحة
        const directM3 = data.match(/https?:\/\/[^\s"'<>]+\.m3u8/);
        if (directM3) {
            return await extractHlsQualities(directM3[0]);
        }

        // 2) لو فيه سكربت obfuscated
        const obf = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?\))<\/script>/i)
                 || data.match(/(eval\(function\(p,a,c,k,e,d[\s\S]*?\))<\/script>/i);

        if (!obf || !obf[1]) {
            // ممكن يكون JSON داخل سكربت فيه hls2
            const inline = data.match(/"hls2"\s*:\s*"([^"]+)"/);
            if (inline && inline[1]) {
                return await extractHlsQualities(inline[1]);
            }
            return [];
        }

        const unpacked = unpackSafe(obf[1]);
        if (!unpacked) return [];

        const m3u8Match = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/);
        if (!m3u8Match || !m3u8Match[1]) return [];
        const hlsUrl = m3u8Match[1];
        return await extractHlsQualities(hlsUrl);
    } catch (e) {
        console.warn("b() failed:", e);
        return [];
    }
}

// === c(data) now returns array (mp4upload) ===
async function c(data, url = null) {
    try {
        const srcMatch = data.match(/src:\s*"([^"]+\.mp4)"/) || data.match(/https?:\/\/[^\s"'<>]+\.mp4/);
        const srcUrl = srcMatch ? srcMatch[1] || srcMatch[0] : null;
        if (!srcUrl) return [];
        // حاول تحسب جودة من اسم الملف إن أمكن (مثلاً contains 720)
        const guessed = (srcUrl.match(/(\d{3,4})p/) || [null, null])[1];
        return [{ quality: guessed ? guessed + "p" : "default", url: srcUrl }];
    } catch (e) {
        console.warn("c() failed:", e);
        return [];
    }
}

// ==== Dailymotion Extractor (returns array of qualities) ====
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
            if (match) {
                videoId = match[1];
                break;
            }
        }
        if (!videoId) throw new Error("Invalid Dailymotion URL");

        const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();

        // حاول نأخذ أي رابط m3u8 متاح (auto أو hls)
        const candidate = metaJson.qualities?.auto?.[0]?.url || metaJson.qualities?.hq?.[0]?.url || metaJson.qualities?.hd?.[0]?.url;
        if (!candidate) throw new Error("No playable HLS link found in Dailymotion metadata");

        return await extractHlsQualities(candidate);

    } catch (err) {
        console.error("Dailymotion extractor failed:", err);
        return [];
    }
}

// === extractHlsQualities: يحلل ملف m3u8 ويرجع كل الجودات ===
async function extractHlsQualities(hlsUrl) {
    try {
        const res = await fetchv2(hlsUrl);
        const text = await res.text();

        const regex = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+)x(\d+)[^\n]*\r?\n(https?:\/\/[^\n\r]+)/g;
        const streams = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const height = parseInt(match[2], 10);
            streams.push({ quality: height + "p", url: match[3].trim() });
        }

        // بعض الـ m3u8 بيكون variant-less (direct media). في الحالة دي نعيد الرابط الأصلي
        if (streams.length === 0) {
            // حاول إذا كان الملف نفسه يحتوي على تسلسلات segments -> fallback to auto
            if (text.includes("#EXTINF")) {
                return [{ quality: "auto", url: hlsUrl }];
            }
            return [{ quality: "auto", url: hlsUrl }];
        }

        // رتب من الأعلى للأدنى (مش ضروري لكن مرتّب أجمل)
        streams.sort((a, b) => {
            const ah = parseInt(a.quality, 10) || 0;
            const bh = parseInt(b.quality, 10) || 0;
            return bh - ah;
        });

        return streams;
    } catch (e) {
        console.warn("extractHlsQualities failed:", e);
        return [{ quality: "auto", url: hlsUrl }];
    }
}

// === unpackSafe wrapper to avoid throwing ===
function unpackSafe(source) {
    try {
        if (!source) return null;
        return unpack(source);
    } catch (e) {
        console.warn("unpackSafe failed:", e);
        return null;
    }
}

/* ======= Unpacker (the same as your implementation, unchanged) ======= */
class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        }
        else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            }
            catch (er) {
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
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        }
        else {
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
            const args = juicer.exec(source);
            if (args) {
                try {
                    return {
                        payload: args[1],
                        symtab: args[4].split("|"),
                        radix: parseInt(args[2]),
                        count: parseInt(args[3]),
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
