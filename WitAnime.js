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
  try {
    // Helper عشان نجيب الصفحة
    async function getPage(u) {
      const res = await fetchv2(u);
      if (!res) return "";
      return await res.text();
    }

    // هات الـ HTML
    const html = await getPage(url);
    if (!html) return JSON.stringify([]);

    const episodes = new Map();

    // 1️⃣ هات أي لينك مباشر فيه /episode/
    const linkRegex = /href="([^"]*\/episode\/[^"]+)"/gi;
    let m;
    while ((m = linkRegex.exec(html))) {
      const href = m[1].trim();
      if (href) episodes.set(href, href);
    }

    // 2️⃣ هات أي لينك جاي من openEpisode('base64')
    const onclickRegex = /openEpisode\('([^']+)'\)/gi;
    while ((m = onclickRegex.exec(html))) {
      try {
        const decoded = atob(m[1]); // نفك Base64
        if (decoded.includes("/episode/")) {
          episodes.set(decoded, decoded);
        }
      } catch (e) {
        continue;
      }
    }

    // 3️⃣ غشيم زيادة: أي كلمة episode في الصفحة
    const bruteRegex = /(https?:\/\/[^\s"'<>]+\/episode\/[^\s"'<>]+)/gi;
    while ((m = bruteRegex.exec(html))) {
      const href = m[1].trim();
      if (href) episodes.set(href, href);
    }

    // نرتبهم حسب الرقم اللي في العنوان (لو موجود)
    const numRegex = /(\d+)(?=\/?$)/;
    const finalEpisodes = Array.from(episodes.values())
      .map(href => {
        const numMatch = href.match(numRegex);
        const number = numMatch ? parseInt(numMatch[1]) : null;
        return { href, number };
      })
      .sort((a, b) => {
        if (a.number == null) return 1;
        if (b.number == null) return -1;
        return a.number - b.number;
      })
      .map((ep, i) => ({
        href: ep.href,
        number: ep.number ?? i + 1
      }));

    return JSON.stringify(finalEpisodes);
  } catch (error) {
    console.log("Episode extraction error:", error);
    return JSON.stringify([]);
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
