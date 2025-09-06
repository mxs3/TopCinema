async function soraFetch(url, options = { headers: {}, method: "GET", body: null, encoding: "utf-8" }) {
  try {
    if (typeof fetchv2 === "function") {
      return await fetchv2(
        url,
        options.headers ?? {},
        options.method ?? "GET",
        options.body ?? null,
        true,
        options.encoding ?? "utf-8"
      );
    }
    const res = await fetch(url, { method: options.method ?? "GET", headers: options.headers ?? {}, body: options.body ?? null });
    return await res.text();
  } catch (e) {
    return null;
  }
}

function decodeHTMLEntities(text) {
  text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  const entities = {
    "&quot;": '"',
    "&amp;": "&",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">"
  };
  for (const entity in entities) {
    text = text.replace(new RegExp(entity, "g"), entities[entity]);
  }
  return text;
}

async function searchResults(keyword) {
  try {
    const base = "https://w.cinamamix.com";
    const url = `${base}/?s=${encodeURIComponent(keyword)}`;
    const headers = { "User-Agent": "Mozilla/5.0" };

    const html = await soraFetch(url, { headers });

    if (!html) {
      return JSON.stringify([{ title: "Error: no response", image: "", href: "" }]);
    }

    // اطبع جزء من الـ HTML للتشخيص
    console.log(html.slice(0, 1000));

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
