async function searchResults(keyword) {
  try {
    const url = `https://witanime.today/?s=${encodeURIComponent(keyword)}`;
    const res = await fetchv2(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://witanime.today/'
      }
    });
    const html = await res.text();

    const results = [];
    const blocks = html.split('anime-card'); // الجزء اللي يحتوي على كل كارت أنمي
    for (const block of blocks) {
      const hrefMatch = block.match(/<a href="([^"]+)"/); // رابط الأنمي
      const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/); // صورة الغلاف
      const titleMatch = block.match(/<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/); // عنوان الأنمي

      if (hrefMatch && imgMatch && titleMatch) {
        results.push({
          title: decodeHTMLEntities(titleMatch[1]),
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

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };

    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}
