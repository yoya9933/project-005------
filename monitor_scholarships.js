const fs = require("fs");
const path = require("path");

const SOURCES = [
  {
    name: "成大官網 / All Notices",
    url: "https://web.ncku.edu.tw/p/422-1000-1024.php?Lang=en",
  },
  {
    name: "成大生輔組",
    url: "https://assistance-osa.ncku.edu.tw/",
  },
  {
    name: "成大獎學金系統",
    url: "https://sgd.adm.ncku.edu.tw/scholarship/",
  },
  {
    name: "KUAP 成大公告平台",
    url: "https://cc.ncku.edu.tw/p/412-1213-29125.php?Lang=zh-tw",
  },
  {
    name: "成大水利系官網",
    url: "https://www.hyd.ncku.edu.tw/",
  },
  {
    name: "成大工學院公告",
    url: "https://eng.ncku.edu.tw/",
  },
  {
    name: "成大工學院 / 袁福國學長獎助學金補助辦法",
    url: "https://eng.ncku.edu.tw/p/412-1014-31696.php?Lang=zh-tw",
  },
  {
    name: "成大工學院 / 袁福國學長獎助學金申請時程",
    url: "https://eng.ncku.edu.tw/p/412-1014-32013.php?Lang=zh-tw",
  },
  {
    name: "成大工學院 / 袁福國學長獎助學金補助成果",
    url: "https://eng.ncku.edu.tw/p/412-1014-31697.php?Lang=zh-tw",
  },
];

const KEYWORDS = [
  "獎學金",
  "獎助學金",
  "助學金",
  "補助",
  "申請",
  "推薦",
  "系所推薦",
  "老師推薦",
  "清寒",
  "優秀",
  "專題",
  "成果",
  "研究",
  "競賽",
  "論文",
  "企業",
  "基金會",
];

const CORE_KEYWORDS = ["獎學金", "獎助學金", "助學金", "補助", "scholarship", "grant", "subsidy"];
const PROJECT_KEYWORDS = ["專題", "成果", "研究", "競賽", "論文", "project", "research", "competition", "thesis"];

const OUTPUT_DIR = path.join(process.cwd(), "monitor_results");
const WATCH_CSV = path.join(process.cwd(), "scholarship_watch.csv");

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function extractLinks(html, baseUrl) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const href = match[1].trim();
    const text = stripHtml(match[2]);
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;

    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    links.push({ text, url });
  }
  return links;
}

function decodeResponse(response, buffer) {
  const contentType = response.headers.get("content-type") || "";
  const charset = contentType.match(/charset=([^;\s]+)/i)?.[1]?.toLowerCase();
  const labels = charset ? [charset, "utf-8", "big5"] : ["utf-8", "big5"];

  let bestText = "";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const label of labels) {
    try {
      const text = new TextDecoder(label).decode(buffer);
      const score = (text.match(/\uFFFD/g) || []).length + (text.match(/�/g) || []).length;
      if (score < bestScore) {
        bestScore = score;
        bestText = text;
      }
    } catch {
      // Ignore unsupported labels and try the next candidate.
    }
  }

  return bestText;
}

function relevantLinks(html, baseUrl) {
  return extractLinks(html, baseUrl)
    .filter((link) => {
      const haystack = `${link.text} ${link.url}`.toLowerCase();
      return CORE_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
    })
    .slice(0, 30);
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "Mozilla/5.0 scholarship-monitor/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const buffer = await response.arrayBuffer();
    const html = decodeResponse(response, buffer);
    return {
      source,
      ok: response.ok,
      status: response.status,
      title: extractTitle(html),
      matchedKeywords: KEYWORDS.filter((keyword) => html.includes(keyword)),
      links: relevantLinks(html, source.url),
      error: "",
    };
  } catch (error) {
    return {
      source,
      ok: false,
      status: "",
      title: "",
      matchedKeywords: [],
      links: [],
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function writeRunReport(results) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(OUTPUT_DIR, `scholarship_scan_${stamp}.md`);

  const lines = [
    "# 成大獎學金監控結果",
    "",
    `檢查時間：${now.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.source.name}`);
    lines.push("");
    lines.push(`- 網址：${result.source.url}`);
    lines.push(`- 狀態：${result.ok ? "成功" : "失敗"}${result.status ? ` (${result.status})` : ""}`);
    if (result.title) lines.push(`- 頁面標題：${result.title}`);
    if (result.error) lines.push(`- 錯誤：${result.error}`);
    lines.push(`- 命中關鍵字：${result.matchedKeywords.length ? result.matchedKeywords.join("、") : "無"}`);
    lines.push("");

    if (result.links.length) {
      lines.push("| 文字 | 連結 |");
      lines.push("|---|---|");
      for (const link of result.links) {
        lines.push(`| ${link.text.replaceAll("|", " ")} | ${link.url} |`);
      }
      lines.push("");
    } else {
      lines.push("未抓到明確相關連結。");
      lines.push("");
    }
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  return outputPath;
}

function appendWatchRows(results) {
  const checkedAt = new Date().toISOString();
  const rows = [];

  for (const result of results) {
    for (const link of result.links) {
      rows.push([
        result.source.name,
        result.source.url,
        "",
        link.text,
        link.url,
        "",
        "",
        "",
        "",
        "",
        PROJECT_KEYWORDS.some((keyword) => link.text.toLowerCase().includes(keyword.toLowerCase())) ? "待確認" : "",
        "",
        "C. 值得追蹤",
        "待判斷",
        "",
        "",
        checkedAt,
      ]);
    }
  }

  if (!rows.length) return 0;

  const existing = fs.existsSync(WATCH_CSV) ? fs.readFileSync(WATCH_CSV, "utf8") : "";
  const existingUrls = new Set(
    existing
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(",")[4])
      .filter(Boolean),
  );
  const newRows = rows.filter((row) => !existingUrls.has(row[4]));
  if (!newRows.length) return 0;

  const text = newRows.map((row) => row.map(csvEscape).join(",")).join("\n");
  fs.appendFileSync(WATCH_CSV, `${text}\n`, "utf8");
  return newRows.length;
}

async function main() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const reportPath = writeRunReport(results);
  const addedRows = appendWatchRows(results);

  console.log(`Report: ${reportPath}`);
  console.log(`Added rows: ${addedRows}`);
  for (const result of results) {
    console.log(`${result.ok ? "OK" : "FAIL"} ${result.source.name}: ${result.links.length} related links`);
    if (result.error) console.log(`  ${result.error}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
