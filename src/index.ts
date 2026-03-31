#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as cheerio from "cheerio";

// ── OG Tag Parser (self-contained, no external API dependency) ──

interface OgData {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  image: string | null;
  imageWidth: string | null;
  imageHeight: string | null;
  type: string | null;
  siteName: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  favicon: string | null;
  canonicalUrl: string | null;
}

interface ScoreResult {
  total: number;
  label: string;
  platforms: { twitter: boolean; linkedin: boolean; facebook: boolean; slack: boolean };
}

interface CheckResult {
  ogData: OgData;
  score: ScoreResult;
  issues: string[];
}

function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative) return null;
  if (relative.startsWith("http://") || relative.startsWith("https://")) return relative;
  if (relative.startsWith("//")) return `https:${relative}`;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

async function checkUrl(url: string): Promise<CheckResult> {
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const response = await fetch(normalizedUrl, {
    headers: {
      "User-Agent": "PageShot-MCP/1.0 (+https://pageshot.uncommondigitalgroup.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const finalUrl = response.url;

  const allTags: Record<string, string> = {};
  $("meta").each((_, el) => {
    const $el = $(el);
    const property = $el.attr("property") || $el.attr("name") || "";
    const content = $el.attr("content") || "";
    if (property && content) allTags[property] = content;
  });

  const ogData: OgData = {
    url: normalizedUrl,
    finalUrl,
    title: allTags["og:title"] || null,
    description: allTags["og:description"] || null,
    image: resolveUrl(finalUrl, allTags["og:image"] || null),
    imageWidth: allTags["og:image:width"] || null,
    imageHeight: allTags["og:image:height"] || null,
    type: allTags["og:type"] || null,
    siteName: allTags["og:site_name"] || null,
    twitterCard: allTags["twitter:card"] || null,
    twitterTitle: allTags["twitter:title"] || null,
    twitterDescription: allTags["twitter:description"] || null,
    twitterImage: resolveUrl(finalUrl, allTags["twitter:image"] || null),
    favicon: resolveUrl(
      finalUrl,
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      "/favicon.ico"
    ),
    canonicalUrl: $('link[rel="canonical"]').attr("href") || null,
  };

  // Fallbacks
  const pageTitle = $("title").text() || null;
  const metaDescription = allTags["description"] || null;

  // Score
  const hasTitle = !!(ogData.title || pageTitle);
  const hasDescription = !!(ogData.description || metaDescription);
  const hasImage = !!ogData.image;

  let total = 0;
  if (hasTitle) total += 1;
  if (hasDescription) total += 1;
  if (hasImage) total += 2;
  if (ogData.imageWidth && ogData.imageHeight) total += 1;
  if (ogData.twitterCard) total += 1;
  if (ogData.twitterImage || ogData.image) total += 1;
  if (ogData.favicon) total += 1;
  if (ogData.canonicalUrl) total += 1;
  if (ogData.siteName) total += 1;

  let label: string;
  if (total <= 3) label = "Poor";
  else if (total <= 5) label = "Needs Work";
  else if (total <= 7) label = "Good";
  else if (total <= 9) label = "Great";
  else label = "Perfect";

  const hasBasicPreview = hasTitle && hasDescription && hasImage;
  const platforms = {
    twitter: hasBasicPreview && !!ogData.twitterCard,
    linkedin: hasBasicPreview,
    facebook: hasBasicPreview,
    slack: hasTitle && hasDescription,
  };

  // Issues
  const issues: string[] = [];
  if (!ogData.title && !pageTitle) issues.push("No title found — add og:title or a <title> element");
  else if (!ogData.title) issues.push("No og:title — page <title> is being used as fallback");

  if (!ogData.description && !metaDescription) issues.push("No description found — add og:description");
  else if (!ogData.description) issues.push("No og:description — meta description is being used as fallback");

  if (!ogData.image) issues.push("No og:image — links without images get significantly fewer clicks");
  else {
    if (!ogData.imageWidth || !ogData.imageHeight) issues.push("No og:image:width/height — add dimensions (recommended: 1200x630)");
  }

  if (!ogData.twitterCard) issues.push("No twitter:card — set to 'summary_large_image' for large preview images");
  if (!ogData.siteName) issues.push("No og:site_name — appears above the title on Facebook");
  if (!ogData.canonicalUrl) issues.push("No canonical URL — helps identify the preferred page version");

  return { ogData, score: { total, label, platforms }, issues };
}

// ── MCP Server ──

const server = new McpServer({
  name: "pageshot",
  version: "1.0.0",
});

server.tool(
  "check_url",
  "Check a URL's Open Graph tags and social media preview readiness. Returns a 0-10 score, platform readiness (Twitter, LinkedIn, Facebook, Slack), and specific issues to fix. Use this when someone asks about their site's social sharing previews, OG tags, meta tags, or how their links look when shared.",
  {
    url: z.string().describe("The URL to check (e.g. https://example.com)"),
  },
  async ({ url }) => {
    try {
      const result = await checkUrl(url);

      const readyPlatforms = Object.entries(result.score.platforms)
        .filter(([, ready]) => ready)
        .map(([name]) => name);

      const notReadyPlatforms = Object.entries(result.score.platforms)
        .filter(([, ready]) => !ready)
        .map(([name]) => name);

      let text = `## Social Preview Score: ${result.score.total}/10 (${result.score.label})\n\n`;
      text += `**URL:** ${result.ogData.finalUrl}\n\n`;

      text += `### Platform Readiness\n`;
      if (readyPlatforms.length > 0) text += `- Ready: ${readyPlatforms.join(", ")}\n`;
      if (notReadyPlatforms.length > 0) text += `- Not ready: ${notReadyPlatforms.join(", ")}\n`;
      text += "\n";

      text += `### Detected Tags\n`;
      text += `- Title: ${result.ogData.title || "(missing)"}\n`;
      text += `- Description: ${result.ogData.description || "(missing)"}\n`;
      text += `- Image: ${result.ogData.image || "(missing)"}\n`;
      text += `- Twitter Card: ${result.ogData.twitterCard || "(missing)"}\n`;
      text += `- Site Name: ${result.ogData.siteName || "(missing)"}\n`;
      text += `- Type: ${result.ogData.type || "(missing)"}\n`;
      text += "\n";

      if (result.issues.length > 0) {
        text += `### Issues to Fix\n`;
        for (const issue of result.issues) {
          text += `- ${issue}\n`;
        }
        text += "\n";
      } else {
        text += "### No Issues Found\nAll major social preview tags are properly configured.\n\n";
      }

      text += `---\n*Checked by [PageShot](https://pageshot.uncommondigitalgroup.com) — check any URL's social previews free.*`;

      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to check URL";
      return { content: [{ type: "text" as const, text: `Error checking URL: ${message}` }], isError: true };
    }
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
