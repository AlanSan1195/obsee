import type { ConsoleModel, OBSGoalPreferences, OBSMode, OBSPlatform } from './types';

export interface ParsedHardware {
  cpuModel?: string;
  cpuCores?: number;
  ramGb?: number;
}

export interface ParsedGoal {
  mode: OBSMode | null;
  platform: OBSPlatform | null;
  preferences: OBSGoalPreferences;
  consoleModel: ConsoleModel | null;
  captureCard?: string;
  monitor?: string;
  hardware: ParsedHardware;
}

const resolutionAliases: Array<[RegExp, string]> = [
  [/\b(?:4k|2160p?)(?=(?:24|25|30|50|60|120)\b|\W|$)/i, '3840x2160'],
  [/\b(?:1440p?|2k)(?=(?:24|25|30|50|60|120)\b|\W|$)/i, '2560x1440'],
  [/\b1080p?(?=(?:24|25|30|50|60|120)\b|\W|$)/i, '1920x1080'],
  [/\b720p?(?=(?:24|25|30|50|60|120)\b|\W|$)/i, '1280x720'],
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface ResolutionMention {
  index: number;
  resolution: string;
}

function findResolutionMentions(value: string): ResolutionMention[] {
  const explicitPattern = /\b(\d{3,4})\s*[x×]\s*(\d{3,4})\b/gi;
  const candidates = resolutionAliases.flatMap(([pattern, resolution]) => {
    const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    return Array.from(value.matchAll(globalPattern), (match) => ({
      index: match.index,
      resolution,
    }));
  });
  for (const match of value.matchAll(explicitPattern)) {
    candidates.push({
      index: match.index,
      resolution: `${match[1]}x${match[2]}`,
    });
  }
  candidates.sort((a, b) => a.index - b.index);
  return candidates.filter((candidate, index) => (
    index === 0
    || candidate.index !== candidates[index - 1].index
    || candidate.resolution !== candidates[index - 1].resolution
  ));
}

function findResolutionNear(text: string, keywords: string[]): string | undefined {
  const normalized = normalize(text);
  const keywordPattern = keywords.join('|');
  const mentions = findResolutionMentions(normalized);
  const keywordMatches = Array.from(
    normalized.matchAll(new RegExp(`(?:${keywordPattern})`, 'gi')),
  );

  // Recorremos todas las apariciones del verbo, no solo la primera. Esto evita
  // que una introduccion como "quiero streamear y grabar" oculte la instruccion
  // concreta posterior: "streamear a 1080p y grabar en 4K".
  const afterCandidates = keywordMatches.flatMap((keyword) => {
    const start = keyword.index + keyword[0].length;
    return mentions
      .filter((mention) => mention.index >= start && mention.index - start <= 90)
      .map((mention) => ({
        ...mention,
        distance: mention.index - start,
      }));
  });
  afterCandidates.sort((a, b) => a.distance - b.distance || b.index - a.index);
  if (afterCandidates[0]) return afterCandidates[0].resolution;

  const beforeCandidates = keywordMatches.flatMap((keyword) => (
    mentions
      .filter((mention) => mention.index < keyword.index && keyword.index - mention.index <= 45)
      .map((mention) => ({
        ...mention,
        distance: keyword.index - mention.index,
      }))
  ));
  beforeCandidates.sort((a, b) => a.distance - b.distance || b.index - a.index);
  return beforeCandidates[0]?.resolution;
}

function parseMode(text: string): OBSMode | null {
  const normalized = normalize(text);
  const wantsStream = /\b(stream|streaming|stremear|streamear|transmitir|transmision|directo|emitir|emision)\b/.test(normalized);
  const wantsRecording = /\b(graba(?:r|ndo)?|grabacion|recording|recordar|guardar|archivo local|copia local)\b/.test(normalized);

  if (wantsStream && wantsRecording) return 'stream_record';
  if (wantsStream) return 'stream_only';
  if (wantsRecording) return 'record_only';
  return null;
}

function parsePlatform(text: string): OBSPlatform | null {
  const normalized = normalize(text);
  if (/\byou\s*tube\b|\byt\b/.test(normalized)) return 'youtube';
  if (/\btwitch\b/.test(normalized)) return 'twitch';
  return null;
}

function parseConsole(text: string): ConsoleModel | null {
  const normalized = normalize(text);
  if (/\bps\s*5\s*pro\b|\bplaystation\s*5\s*pro\b/.test(normalized)) return 'ps5_pro';
  if (/\bps\s*5\b|\bplaystation\s*5\b/.test(normalized)) return 'ps5';
  if (/\bxbox\s*series\s*x\b/.test(normalized)) return 'xbox_series_x';
  if (/\bxbox\s*series\s*s\b/.test(normalized)) return 'xbox_series_s';
  if (/\bswitch\s*2\b/.test(normalized)) return 'switch2';
  if (/\bnintendo\s*switch\b|\bswitch\b/.test(normalized)) return 'switch';
  return null;
}

function parseHardware(text: string): ParsedHardware {
  const normalized = normalize(text);
  const apple = /\b(?:apple\s*)?(m[1-4](?:\s*(?:pro|max|ultra))?)\b/i.exec(text);
  const ryzen = /\b(?:amd\s+)?ryzen\s+\d(?:\s+\d{4,5}[a-z]{0,2})?\b/i.exec(text);
  const intel = /\b(?:intel\s+)?core\s+(?:ultra\s+)?[3579](?:[-\s]\d{4,5}[a-z]{0,2})?\b/i.exec(text);
  const ram = /(\d{1,3})\s*(?:gb|gigas?)(?:\s+de)?\s*(?:ram|memoria)?\b/i.exec(normalized)
    ?? /\b(?:ram|memoria)[^\d]{0,12}(\d{1,3})\s*(?:gb|gigas?)?/i.exec(normalized);
  const cores = /(\d{1,3})\s*(?:nucleos?|cores?|cpu cores?)\b/i.exec(normalized)
    ?? /\b(?:cpu|procesador)[^\d]{0,12}(\d{1,3})\s*(?:nucleos?|cores?)?/i.exec(normalized);

  let cpuModel: string | undefined;
  if (apple) cpuModel = `Apple ${apple[1].replace(/\s+/g, ' ').toUpperCase()}`;
  else if (ryzen) cpuModel = ryzen[0].replace(/\s+/g, ' ').trim();
  else if (intel) cpuModel = intel[0].replace(/\s+/g, ' ').trim();

  return {
    cpuModel,
    cpuCores: cores ? Number(cores[1]) : undefined,
    ramGb: ram ? Number(ram[1]) : undefined,
  };
}

function parseNamedDevice(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[1]?.replace(/[,.].*$/, '').trim();
}

export function parseGoal(text: string): ParsedGoal {
  const consoleModel = parseConsole(text);
  const streamResolution = findResolutionNear(text, [
    'stream(?:ing)?',
    'stremear',
    'streamear',
    'transmitir',
    'transmision',
    'directo',
  ]);
  const recordingResolution = findResolutionNear(text, [
    'graba(?:r|ndo)?',
    'grabacion',
    'archivo',
    'guardar',
    'subir',
  ]);
  const fpsMatch = /(?:\b|p|@)(24|25|30|50|60|120)\s*(?:fps|cuadros)?\b/i.exec(text);
  const captureCard = parseNamedDevice(
    text,
    /(?:capturadora|capture\s*card)(?:\s+(?:es|una|el|la|modelo))?\s+(.{3,55}?)(?=\s+y\s+(?:un[ao]?\s+)?(?:monitor|pantalla)|[,.;\n]|$)/i,
  );
  const monitor = parseNamedDevice(
    text,
    /(?:monitor|pantalla)(?:\s+(?:es|un|una|el|la|modelo))?\s+(.{3,55}?)(?=[,.;\n]|$)/i,
  );

  return {
    mode: parseMode(text),
    platform: parsePlatform(text),
    consoleModel,
    captureCard,
    monitor,
    hardware: parseHardware(text),
    preferences: {
      description: text.trim(),
      streamResolution,
      recordingResolution,
      fps: fpsMatch ? Number(fpsMatch[1]) : undefined,
      source: consoleModel ? 'console' : 'computer',
      deviceNotes: consoleModel ? text.trim() : undefined,
    },
  };
}
