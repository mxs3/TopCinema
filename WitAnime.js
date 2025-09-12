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
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const servers = a(html);
        console.log(JSON.stringify(servers));
        const priorities = [
            "streamwish - fhd",
            "streamwish",
            "mp4upload",
            "playerwish - fhd",
            "playerwish",
            "dailymotion"
        ];

        // لو لقيت سيرفرات متاحة نخلي المستخدم يختار
        if (servers.length > 0) {
            const choice = await soraPrompt(
                "اختر السيرفر اللي تحب تشغله:",
                servers.map(s => s.name)
            );
            const chosenServer = servers.find(s => s.name === choice);

            if (chosenServer) {
                const streamUrl = chosenServer.url;
                const name = chosenServer.name.toLowerCase();

                if (name.includes("streamwish")) {
                    const newUrl = "https://hgplaycdn.com/e/" + streamUrl.replace(/^https?:\/\/[^/]+\/e\//, '');
                    const response = await fetchv2(newUrl);
                    const html = await response.text();
                    const result = await b(html);
                    return result;

                } else if (name.includes("mp4upload")) {
                    const response = await fetchv2(streamUrl);
                    const html = await response.text();
                    const result = await c(html);
                    return result;

                } else if (name.includes("playerwish")) {
                    const response = await fetchv2(streamUrl);
                    const html = await response.text();
                    const result = await b(html);
                    return result;

                } else if (name.includes("dailymotion")) {
                    const result = await extractDailymotion(streamUrl);
                    return result;

                } else {
                    throw new Error("Unsupported provider: " + chosenServer.name);
                }
            }
        }

        throw new Error("No valid server found");
    } catch (err) {
        console.error(err);
        return "https://files.catbox.moe/avolvc.mp4";
    }
}

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
        return [];
    }
}

async function b(data, url = null) {
    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    const unpackedScript = unpack(obfuscatedScript[1]);
    const m3u8Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
    const m3u8Url = m3u8Match[1];
    return m3u8Url;
}

async function c(data, url = null) {
    const srcMatch = data.match(/src:\s*"([^"]+\.mp4)"/);
    const srcUrl = srcMatch ? srcMatch[1] : null;
    return srcUrl;
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
            if (match) {
                videoId = match[1];
                break;
            }
        }
        if (!videoId) throw new Error("Invalid Dailymotion URL");

        const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();
        const hlsLink = metaJson.qualities?.auto?.[0]?.url;
        if (!hlsLink) throw new Error("No playable HLS link found");

        async function getBestHls(hlsUrl) {
            try {
                const res = await fetch(hlsUrl);
                const text = await res.text();
                const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
                const streams = [];
                let match;
                while ((match = regex.exec(text)) !== null) {
                    streams.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
                }
                if (streams.length === 0) return hlsUrl;
                streams.sort((a, b) => b.height - a.height);
                return streams[0].url;
            } catch {
                return hlsUrl;
            }
        }

        const bestHls = await getBestHls(hlsLink);
        return bestHls;

    } catch (err) {
        console.error("Dailymotion extractor failed:", err);
        return null;
    }
}

// ==== Helper Classes (Unpacker) ====
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
