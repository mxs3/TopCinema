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

async function extractDetails(url) {
  try {
    const response = await fetchv2(url);
    const html = await response.text();

    let description = "لا يوجد وصف متاح.";
    let airdate = "غير معروف";
    let aliases = "غير مصنف";

    // ====== الوصف ======
    const descMatch = html.match(/<div[^>]*class=["']anime-story["'][^>]*>\s*<p>(.*?)<\/p>/s);
    if (descMatch) {
      description = descMatch[1].replace(/<\/?[^>]+>/g, "").trim();
    }

    // ====== التصنيفات ======
    const genresMatch = [...html.matchAll(/<div[^>]*class=["']anime-genres["'][^>]*>.*?<a[^>]*>(.*?)<\/a>/gs)];
    if (genresMatch.length > 0) {
      aliases = genresMatch.map(m => m[1].trim()).join(", ");
    }

    // ====== سنة العرض ======
    const yearMatch = html.match(/<span[^>]*class=["']anime-date["'][^>]*>(\d{4})<\/span>/);
    if (yearMatch) {
      airdate = `سنة العرض: ${yearMatch[1]}`;
    }

    // ====== إرجاع MediaItem زي فور أب ======
    return [
      {
        id: generateUUID(),        // سورا بيحتاج UUID لكل MediaItem
        description,
        aliases,
        airdate
      }
    ];

  } catch (err) {
    return [
      {
        id: generateUUID(),
        description: "فشل في جلب البيانات.",
        aliases: "غير مصنف",
        airdate: "غير معروف"
      }
    ];
  }
}
