import { FilePath, FullSlug, slugifyFilePath } from "./path"

export type WikilinkWithPosition = {
  wikilink: ParsedWikilink
  start: number
  end: number
}

export type ParsedWikilink = {
  raw: string
  target: string
  anchor?: string
  alias?: string
  embed: boolean
}

export type ResolvedWikilink = {
  slug: FullSlug
  anchor?: string
}

const wikilinkRegex = /^!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/

export function parseWikilink(text: string): ParsedWikilink | null {
  const trimmed = text.trim()
  const match = wikilinkRegex.exec(trimmed)
  if (!match) return null

  const [, target, anchor, alias] = match
  return {
    raw: trimmed,
    target: target?.trim() ?? "",
    anchor: anchor?.trim(),
    alias: alias?.trim(),
    embed: trimmed.startsWith("!"),
  }
}

export function resolveWikilinkTarget(
  parsed: ParsedWikilink,
  currentSlug: FullSlug,
): ResolvedWikilink | null {
  const target = parsed.target.trim()
  if (!target) return null

  if (target.startsWith("/")) {
    const slug = slugifyFilePath(target.slice(1).replace(/\\/g, "/") as FilePath)
    return { slug, anchor: parsed.anchor }
  }

  const currentParts = currentSlug.split("/")
  const currentDir = currentParts.slice(0, -1)

  const targetParts = target.replace(/\\/g, "/").split("/")
  const resolved: string[] = [...currentDir]

  for (const part of targetParts) {
    if (part === "..") {
      resolved.pop()
    } else if (part !== "." && part.length > 0) {
      resolved.push(part)
    }
  }

  const slug = slugifyFilePath(resolved.join("/") as FilePath)
  return { slug, anchor: parsed.anchor }
}

const globalWikilinkRegex = /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

export function extractWikilinksWithPositions(text: string): WikilinkWithPosition[] {
  const results: WikilinkWithPosition[] = []
  let match: RegExpExecArray | null

  globalWikilinkRegex.lastIndex = 0

  while ((match = globalWikilinkRegex.exec(text)) !== null) {
    const [fullMatch, target, anchor, alias] = match

    results.push({
      wikilink: {
        raw: fullMatch,
        target: target?.trim() ?? "",
        anchor: anchor?.trim(),
        alias: alias?.trim(),
        embed: fullMatch.startsWith("!"),
      },
      start: match.index,
      end: match.index + fullMatch.length,
    })
  }

  return results
}
