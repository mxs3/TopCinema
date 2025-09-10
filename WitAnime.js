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

async function extractStreamUrl(url) {
    try {
        const res = await fetchv2(url);
        const html = await res.text();

        // نجيب السيرفرات من صفحة الحلقة
        const servers = [];
        const serverRegex = /data-server-id="(\d+)"[^>]*>\s*<span[^>]*>(.*?)<\/span>/gi;
        let m;
        while ((m = serverRegex.exec(html))) {
            servers.push({ id: m[1], title: m[2].trim() });
        }

        if (!servers.length) {
            return JSON.stringify({ streams: [] });
        }

        const iframeRegex = /<iframe[^>]+src="([^"]+)"[^>]*>/i;
        const streams = [];

        for (const s of servers) {
            try {
                const iframePage = await fetchv2(`${url}?server=${s.id}`);
                const iframeHtml = await iframePage.text();
                const iframeMatch = iframeRegex.exec(iframeHtml);
                if (!iframeMatch) continue;

                const embedUrl = iframeMatch[1];
                let extracted = null;

                if (/dailymotion\.com/.test(embedUrl)) {
                    extracted = await extractDailymotion(embedUrl);
                } else if (/videa\.hu/.test(embedUrl)) {
                    extracted = await extractVidea(embedUrl);
                } else if (/ok\.ru/.test(embedUrl)) {
                    extracted = await extractOkru(embedUrl);
                } else if (/streamwish/.test(embedUrl)) {
                    extracted = await extractStreamwish(embedUrl);
                }

                if (extracted) {
                    const parsed = JSON.parse(extracted);
                    if (parsed.streams?.length) {
                        streams.push({
                            title: s.title,
                            streamUrl: parsed.streams[0],
                            subtitles: parsed.subtitles || ""
                        });
                    }
                }
            } catch (err) {
                console.log("Server failed:", s.title, err);
            }
        }

        return JSON.stringify({ streams });
    } catch (err) {
        console.log("Stream extraction error:", err);
        return JSON.stringify({ streams: [] });
    }
}

/* ===== دوال السيرفرات ===== */

// Dailymotion
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
        if (!videoId) return null;

        const metaRes = await fetchv2(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();
        const hlsLink = metaJson.qualities?.auto?.[0]?.url;
        if (!hlsLink) return null;

        const bestHls = await pickBestHls(hlsLink);
        const subtitles = metaJson.subtitles?.data?.['en-auto']?.urls?.[0] || "";

        return JSON.stringify({
            streams: [bestHls],
            subtitles
        });
    } catch {
        return null;
    }
}

// Videa
async function extractVidea(url) {
    try {
        const res = await fetchv2(url);
        const html = await res.text();
        const regex = /sources:\s*\[{src:\s*"(.*?)"/;
        const match = regex.exec(html);
        if (!match) return null;
        return JSON.stringify({ streams: [match[1]], subtitles: "" });
    } catch {
        return null;
    }
}

// OK.ru
async function extractOkru(url) {
    try {
        const res = await fetchv2(url);
        const html = await res.text();
        const regex = /"hlsManifestUrl":"(https:[^"]+)"/;
        const match = regex.exec(html);
        if (!match) return null;
        return JSON.stringify({ streams: [match[1].replace(/\\u0026/g, "&")], subtitles: "" });
    } catch {
        return null;
    }
}

// Streamwish
async function extractStreamwish(url) {
    try {
        const res = await fetchv2(url);
        const html = await res.text();
        const regex = /sources\s*:\s*\[\{file:\s*"(.*?)"/;
        const match = regex.exec(html);
        if (!match) return null;
        return JSON.stringify({ streams: [match[1]], subtitles: "" });
    } catch {
        return null;
    }
}

/* ===== هيلبر لإختيار أعلى جودة HLS ===== */
async function pickBestHls(hlsUrl) {
    try {
        const res = await fetchv2(hlsUrl);
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
    } catch {
        return hlsUrl;
    }
}

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
