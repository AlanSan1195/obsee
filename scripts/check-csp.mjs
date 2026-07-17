/* global console, process */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.resolve(repositoryRoot, process.argv[2] || 'index.html');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}

function parseDirectives(policy) {
  const directives = new Map();
  for (const rawDirective of policy.split(';')) {
    const [rawName, ...values] = rawDirective.trim().split(/\s+/);
    if (!rawName) continue;
    const name = rawName.toLowerCase();
    assert(!directives.has(name), `CSP contains duplicate directive: ${name}`);
    directives.set(name, values);
  }
  return directives;
}

function assertExactDirective(directives, name, expectedValues) {
  const actualValues = directives.get(name);
  assert(actualValues, `CSP is missing required directive: ${name}`);
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  assert(
    actual.size === expected.size && [...expected].every((value) => actual.has(value)),
    `CSP directive ${name} must be exactly: ${expectedValues.join(' ')}`,
  );
}

function readInlineScripts(html) {
  const scripts = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = match[1];
    const body = match[2];
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase() ?? '';
    scripts.push({ type, body });
  }

  return scripts;
}

const [html, vercelSource] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(path.join(repositoryRoot, 'vercel.json'), 'utf8'),
]);
const vercel = JSON.parse(vercelSource);

assert(
  !/<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html),
  `${path.relative(repositoryRoot, htmlPath)} must not contain a meta CSP.`,
);

const cspHeaders = (vercel.headers ?? []).flatMap((rule) => (
  (rule.headers ?? []).filter((header) => header.key?.toLowerCase() === 'content-security-policy')
));
assert(cspHeaders.length === 1, 'vercel.json must define exactly one Content-Security-Policy header.');

const directives = parseDirectives(cspHeaders[0].value);
const inlineScripts = readInlineScripts(html);
assert(inlineScripts.length > 0, 'Expected the SEO JSON-LD inline script.');
assert(
  inlineScripts.every((script) => script.type === 'application/ld+json'),
  'Unexpected inline executable script found.',
);

const jsonLdHashes = inlineScripts.map((script) => {
  const parsed = JSON.parse(script.body);
  assert(parsed['@context'] === 'https://schema.org', 'JSON-LD must retain its schema.org context.');
  assert(parsed['@type'] === 'WebApplication', 'JSON-LD must retain the WebApplication type.');
  return `'${sha256(script.body)}'`;
});

assertExactDirective(directives, 'default-src', ["'self'"]);
assertExactDirective(directives, 'script-src', ["'self'", ...jsonLdHashes]);
assertExactDirective(directives, 'style-src', ["'self'", "'unsafe-inline'"]);
assertExactDirective(directives, 'img-src', ["'self'", 'data:']);
assertExactDirective(directives, 'font-src', ["'self'"]);
assertExactDirective(directives, 'connect-src', ["'self'", 'ws://localhost:*', 'ws://127.0.0.1:*']);
assertExactDirective(directives, 'object-src', ["'none'"]);
assertExactDirective(directives, 'base-uri', ["'none'"]);
assertExactDirective(directives, 'form-action', ["'self'"]);
assertExactDirective(directives, 'frame-ancestors', ["'none'"]);

const scriptSources = directives.get('script-src') ?? [];
assert(!scriptSources.includes("'unsafe-inline'"), "script-src must not contain 'unsafe-inline'.");
assert(!scriptSources.includes("'unsafe-eval'"), "script-src must not contain 'unsafe-eval'.");

for (const script of inlineScripts) {
  const changedHash = `'${sha256(`${script.body}\n`)}'`;
  assert(!scriptSources.includes(changedHash), 'CSP negative drift self-check did not detect changed JSON-LD.');
}

console.log(`CSP verified for ${path.relative(repositoryRoot, htmlPath)} (${jsonLdHashes.join(', ')}).`);
