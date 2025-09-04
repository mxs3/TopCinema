function decodeHtmlEntities(text) {
    return text
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8230;/g, '...')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));
}

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://www.faselhds.xyz/?s=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /<div class="postDiv[^"]*">[\s\S]*?<a href="([^"]+)">[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<div class="h1">([\s\S]*?)<\/div>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: match[1].trim()
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}


async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const match = /<div class="singleDesc">\s*<p>([\s\S]*?)<\/p>/.exec(html);
        const description = match ? match[1].trim() : "N/A";

        return JSON.stringify([{
            description: decodeHtmlEntities(description),
            aliases: "N/A",
            airdate: "N/A"
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }]);
    }
}

async function extractEpisodes(url) {
    const baseUrl = "https://www.faselhds.xyz";
    const allEpisodes = [];

    function extractEpisodesFromHtml(html) {
        const episodes = [];
        const regex = /<a href="([^"]+)"[^>]*>\s*الحلقة\s*(\d+)\s*<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            episodes.push({
                href: match[1].trim(),
                number: parseInt(match[2], 10),
            });
        }
        return episodes;
    }

    try {
        const response = await fetchv2(url);
        const html = await response.text();
        
        const seasonDivRegex = /<div[^>]+class=["'][^"']*seasonDiv[^"']*["'][^>]*>/g;
        const seasonMatches = html.match(seasonDivRegex);
        const seasonCount = seasonMatches ? seasonMatches.length : 0;
        
        console.log(`Found ${seasonCount} seasons`);
        
        if (seasonCount > 1) {
            const seasonHrefRegex = /<div[^>]+class=["'][^"']*seasonDiv[^"']*["'][^>]*onclick=["']window\.location\.href\s*=\s*['"](([^'"]+))['"][^>]*>/g;
            const seasonPaths = [];
            let match;
            
            while ((match = seasonHrefRegex.exec(html)) !== null) {
                seasonPaths.push(match[1]);
            }
            
            
            for (const path of seasonPaths) {
                const seasonUrl = path.startsWith("http") ? path : baseUrl + path;
                
                const seasonResponse = await fetchv2(seasonUrl);
                const seasonPageHtml = await seasonResponse.text();
                const episodes = extractEpisodesFromHtml(seasonPageHtml);
                
                allEpisodes.push(...episodes);
            }
            
            return JSON.stringify(allEpisodes);
        } else {
            const episodes = extractEpisodesFromHtml(html);
            
            if (episodes.length === 0) {
                return JSON.stringify([{ href: url, number: 1 }]);
            }
            
            return JSON.stringify(episodes);
        }
        
    } catch (err) {
        console.error("Error:", err);
        return JSON.stringify([{ href: "Error", number: "Error" }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const regex = /<li\s+class="active"\s+onclick="player_iframe\.location\.href\s*=\s*'([^']+)'"/i;
        const match = regex.exec(html);

        if (!match || !match[1]) {
            console.log("No stream URL found in page");
            return "";
        }

        const streamUrl = match[1].trim();
        const streamResponse = await fetchv2(streamUrl);
        const streamContent = await streamResponse.text();

        const deobfuscated = deobfuscate(streamContent);
        console.log("deob"+ deobfuscated);
        if (deobfuscated) {
            const fileMatch = /"sources"\s*:\s*\[\s*{\s*"file"\s*:\s*"([^"]+)"/.exec(deobfuscated);
            if (fileMatch && fileMatch[1]) {
                console.log(fileMatch[1]);
                const returnHLS = fileMatch[1].trim();
                return returnHLS;
            } else {
                console.log("Failed to extract HLS stream URL");
                return "bleh";
            }
        } else {
            console.log("Failed to deobfuscate");
            return "bleh";
        }
    } catch (err) {
        console.log("Error fetching stream URL content:"+ err);
        return "";
    }
}

/// FML
function deobfuscate(streamContent) {
    try {
        const hideVarRegex = /var\s+(hide[*_]my_HTML_[a-zA-Z0-9_*]+)\s*=\s*([^;]+);/;
        const hideMatch = streamContent.match(hideVarRegex);
        
        const hideVarName = hideMatch[1];
        const hideVarValue = hideMatch[2].trim();

        let encodedString = hideVarValue;
        
        if (encodedString.includes('+')) {
            const stringParts = [];
            const stringMatches = encodedString.matchAll(/'([^']*)'/g);
            for (const match of stringMatches) {
                stringParts.push(match[1]);
            }
            encodedString = stringParts.join('');
        } else {
            encodedString = encodedString.replace(/^['"]|['"]$/g, '');
        }

        const parts = encodedString.split('.').filter(p => p.trim().length > 0);

        let subtractionValue = 61; 
        
        const dynamicSubRegex = /\)\s*-\s*(\d+)\s*\)\s*;\s*\}\s*\)\s*;\s*document/;
        const dynamicMatch = streamContent.match(dynamicSubRegex);
        
        if (dynamicMatch) {
            subtractionValue = parseInt(dynamicMatch[1]);
            console.log(subtractionValue);
        } else {
            const fallbackRegex = /parseInt\([^)]+\)[^)]*\)\s*-\s*(\d+)/;
            const fallbackMatch = streamContent.match(fallbackRegex);
            if (fallbackMatch) {
                subtractionValue = parseInt(fallbackMatch[1]);
                console.log(subtractionValue);
            } else {
                console.log(subtractionValue);
            }
        }

        let decodedString = '';
        let successCount = 0;
        let errorCount = 0;
        
        function addBase64Padding(str) {
            const padding = str.length % 4;
            if (padding === 2) return str + '==';
            if (padding === 3) return str + '=';
            return str;
        }
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;
            
            try {
                const paddedPart = addBase64Padding(part);
                const decoded = atob(paddedPart);
                const numbers = decoded.replace(/\D/g, '');
                
                if (numbers) {
                    const charCode = parseInt(numbers) - subtractionValue;
                    
                    if (charCode > 0 && charCode < 1114111) {
                        const char = String.fromCharCode(charCode);
                        decodedString += char;
                        successCount++;
                        
                        if (i < 5) {
                            console.log("Part " + i + ": '" + part + "' -> padded: '" + paddedPart + "' -> '" + decoded + "' -> " + numbers + " -> " + charCode + " -> '" + char + "'");
                        }
                    }
                }
            } catch (e) {
                errorCount++;
                if (i < 5) {
                    console.log("Part " + i + " ('" + part + "') error: " + e.message);
                }
            }
        }
        
        try {
            const finalResult = decodeURIComponent(escape(decodedString));
            return finalResult;
        } catch (e) {
            return decodedString;
        }
        
    } catch (error) {
        console.log("Error: " + error.message);
        return null;
    }
}
