async function searchResults(keyword) {
  try {
    const base = "https://w.cinamamix.com";
    const url = `${base}/?s=${encodeURIComponent(keyword)}`;
    const headers = { "User-Agent": "Mozilla/5.0" };

    const html = await soraFetch(url, { headers });

    if (!html) {
      return JSON.stringify([{ title: "Error: no response", image: "", href: "" }]);
    }

    // === تحديث الريجيكس ليتوافق مع الشكل الجديد ===
    const regex =
      /<article[^>]*?class="[^"]*?post[^"]*?"[^>]*?>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*?>[\s\S]*?<img[^>]+data-img="([^"]+)"[^>]*?>[\s\S]*?<h3[^>]*class="title"[^>]*>(.*?)<\/h3>/gi;

    const results = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      results.push({
        title: decodeHTMLEntities(match[3].trim()),
        image: match[2].trim(),
        href: match[1].trim()
      });
    }

    return results.length
      ? JSON.stringify(results)
      : JSON.stringify([{ title: "No results", image: "", href: "" }]);
  } catch (e) {
    return JSON.stringify([{ title: "Error", image: "", href: "" }]);
  }
}
