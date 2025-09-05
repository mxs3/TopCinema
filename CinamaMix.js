async function searchResults(keyword) {
    try {
        const baseUrl = "https://w.cinamamix.com";

        // --- تنظيف الكلمة: إزالة أي حروف عربية أو رموز مش إنجليزي ---
        const cleanedKeyword = keyword.replace(/[\u0600-\u06FF]/g, "").trim();
        const searchUrl = `${baseUrl}/?s=${encodeURIComponent(cleanedKeyword)}`;

        const hasFetchV2 = typeof fetchv2 === "function";
        async function httpGet(u) {
            if (hasFetchV2) return await fetchv2(u, {}, "GET");
            return await fetch(u).then(r => r.text());
        }

        const html = await httpGet(searchUrl);

        // Regex: (الرابط - الصورة - العنوان)
        const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/g;

        const results = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2],
                href: match[1]
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log("Fetch error:", error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}
