# PageShot MCP Server

Check any URL's Open Graph tags and social media preview readiness from your AI assistant.

## What It Does

- Checks OG tags and Twitter Card meta tags for any URL
- Scores social preview readiness on a 0-10 scale
- Shows platform readiness for Twitter, LinkedIn, Facebook, and Slack
- Lists specific issues to fix

## Installation

```bash
npx -y github:coffee-fuelled-code/mcp-pageshot   # runs it straight from GitHub
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pageshot": {
      "command": "npx",
      "args": ["-y", "github:coffee-fuelled-code/mcp-pageshot"]
    }
  }
}
```

### Other MCP Clients

Run via stdio:

```bash
npx -y github:coffee-fuelled-code/mcp-pageshot
```

## Tools

### check_url

Check a URL's social media preview readiness.

**Parameters:**
- `url` (string, required): The URL to check

**Returns:**
- Social preview score (0-10)
- Platform readiness (Twitter, LinkedIn, Facebook, Slack)
- Detected OG tags
- Issues to fix

## Example

```
> Check the OG tags for https://example.com

## Social Preview Score: 4/10 (Needs Work)

### Platform Readiness
- Ready: Slack
- Not ready: Twitter, LinkedIn, Facebook

### Issues to Fix
- No og:image — links without images get significantly fewer clicks
- No twitter:card — set to 'summary_large_image' for large preview images
```

## Made By

[PageShot](https://pageshot.uncommondigitalgroup.com) by [Uncommon Digital Group](https://uncommondigitalgroup.com)
