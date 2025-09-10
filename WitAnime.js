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
    async function getPage(u) {
      const res = await fetchv2(u);
      if (!res) return "";
      return await res.text();
    }

    const html = await getPage(url);
    if (!html) return JSON.stringify([]);

    const episodes = [];

    // --- 1. استخراج onclick="openEpisode('base64')"
    const onclickRegex = /onclick="openEpisode\('([^']+)'\)[^"]*"\s*[^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = onclickRegex.exec(html))) {
      const encoded = match[1].trim();
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      let href = "";
      try {
        href = atob(encoded); // فك base64
      } catch (e) {
        href = encoded;
      }
      episodes.push({ href, title });
    }

    // --- 2. روابط عادية /episode/
    const linkRegex = /<a[^>]+href="([^"]*\/episode\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
    while ((match = linkRegex.exec(html))) {
      const href = match[1].trim();
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      if (!episodes.find(ep => ep.href === href)) {
        episodes.push({ href, title });
      }
    }

    // --- 3. Fallback: API extraction
    if (episodes.length === 0) {
      const idMatch = html.match(/data-id=["'](\d+)["']/);
      if (idMatch) {
        const animeId = idMatch[1];
        const apiUrl = `${url.replace(/\/$/, "")}/wp-admin/admin-ajax.php`;

        const formData = new URLSearchParams();
        formData.append("action", "getEpisodes");
        formData.append("id", animeId);

        const res = await fetchv2(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          },
          body: formData.toString(),
        });

        const jsonText = await res.text();
        try {
          const json = JSON.parse(jsonText);
          if (Array.isArray(json)) {
            json.forEach(ep => {
              episodes.push({
                href: ep.url || ep.link || "",
                title: ep.title || `الحلقة ${ep.number || ""}`,
              });
            });
          }
        } catch (e) {
          console.log("API not JSON, maybe HTML fallback:", e);
        }
      }
    }

    // --- 4. ترتيب الحلقات بالأرقام لو متاحة
    const numRegex = /(\d+)/;
    const unique = Array.from(
      new Map(episodes.map(ep => [ep.href, ep])).values()
    ).sort((a, b) => {
      const numA = (a.title.match(numRegex) || [])[1];
      const numB = (b.title.match(numRegex) || [])[1];
      if (!numA) return 1;
      if (!numB) return -1;
      return parseInt(numA) - parseInt(numB);
    });

    return JSON.stringify(unique);
  } catch (error) {
    console.log("Fetch error:", error);
    return JSON.stringify([]);
  }
}
