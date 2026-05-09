import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const args = new Map();
const minApkSizeBytes = 1024 * 1024;

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith('--')) {
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(arg, next);
      index += 1;
    } else {
      args.set(arg, 'true');
    }
  }
}

const failures = [];
const warnings = [];
const reportChecks = [];

function pass(message) {
  reportChecks.push({ status: 'ok', message });
  console.log(`OK   ${message}`);
}

function fail(message) {
  failures.push(message);
  reportChecks.push({ status: 'error', message });
  console.error(`FAIL ${message}`);
}

function warn(message) {
  warnings.push(message);
  reportChecks.push({ status: 'warn', message });
  console.warn(`WARN ${message}`);
}

function requireFile(relativePath, label = relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${label} is missing`);
    return null;
  }

  const size = statSync(absolutePath).size;
  if (size <= 0) {
    fail(`${label} is empty`);
    return null;
  }

  pass(`${label} exists (${size} bytes)`);
  return { absolutePath, size };
}

function requireApk(relativePath, label = relativePath) {
  const file = requireFile(relativePath, label);
  if (!file) return;

  if (file.size < minApkSizeBytes) {
    fail(`${label} is unexpectedly small (${file.size} bytes)`);
    return;
  }

  const signature = readFileSync(file.absolutePath).subarray(0, 4).toString('latin1');
  if (signature !== 'PK\u0003\u0004') {
    fail(`${label} does not look like an APK/ZIP file`);
    return;
  }

  pass(`${label} has APK/ZIP signature`);
}

function readArchiveEntry(archivePath, entryPath) {
  try {
    return execFileSync('tar', ['-xOf', archivePath, entryPath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail(`cannot read ${entryPath} from ${archivePath}: ${error.message}`);
    return null;
  }
}

function readArchiveEntryBuffer(archivePath, entryPath) {
  try {
    return execFileSync('tar', ['-xOf', archivePath, entryPath], {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail(`cannot read ${entryPath} from ${archivePath}: ${error.message}`);
    return null;
  }
}

function listArchive(archivePath) {
  try {
    const output = execFileSync('tar', ['-tzf', archivePath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    fail(`cannot list ${archivePath}: ${error.message}`);
    return [];
  }
}

function archiveHas(entries, expectedPath) {
  const normalized = expectedPath.replaceAll('\\', '/').replace(/^\.?\//, '');
  return entries.some((entry) => entry.replace(/^\.?\//, '') === normalized);
}

function archiveHasPrefix(entries, expectedPrefix) {
  const normalized = expectedPrefix.replaceAll('\\', '/').replace(/^\.?\//, '');
  return entries.some((entry) => entry.replace(/^\.?\//, '').startsWith(normalized));
}

function normalizeArchiveEntry(entry) {
  return entry.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function isAllowedEnvEntry(entry) {
  return entry === '.env.example' || entry === '.env.production';
}

function readEnvFile(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return {};
  const env = {};
  for (const line of readFileSync(absolutePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    env[trimmed.slice(0, separator)] = trimmed.slice(separator + 1).trim();
  }
  return env;
}

function normalizeTextForArchiveCompare(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function requireApkWebAssetsCurrent() {
  const apkPath = 'downloads/persona-chat.apk';
  const androidWebDir = join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
  const entries = listArchive(apkPath).map(normalizeArchiveEntry);
  if (entries.length === 0) return;

  const requiredAssets = ['index.html', 'manifest.json', 'sw.js', 'offline.html'];
  for (const asset of requiredAssets) {
    const androidAssetPath = join(androidWebDir, asset);
    const apkEntry = `assets/public/${asset}`;
    if (!existsSync(androidAssetPath)) {
      fail(`android web asset ${asset} is missing; run capacitor sync after the Android web build`);
      continue;
    }
    if (!entries.includes(apkEntry)) {
      fail(`release APK is missing ${apkEntry}`);
      continue;
    }

    const androidAssetContent = readFileSync(androidAssetPath, 'utf8');
    const apkContent = readArchiveEntry(apkPath, apkEntry);
    if (apkContent === null) continue;
    if (normalizeTextForArchiveCompare(androidAssetContent) !== normalizeTextForArchiveCompare(apkContent)) {
      fail(`release APK ${apkEntry} does not match Android web asset ${asset}; rebuild and sign the APK after capacitor sync`);
    } else {
      pass(`release APK ${apkEntry} matches Android web asset ${asset}`);
    }
  }

  const androidIndexPath = join(androidWebDir, 'index.html');
  if (!existsSync(androidIndexPath)) return;
  const indexHtml = readFileSync(androidIndexPath, 'utf8');
  const referencedAssets = [...indexHtml.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((match) => match[1]);
  const missingAssets = referencedAssets.filter(
    (asset) => !existsSync(join(androidWebDir, 'assets', asset)) || !entries.includes(`assets/public/assets/${asset}`),
  );
  if (missingAssets.length > 0) {
    fail(`release APK is missing current Android web asset(s): ${missingAssets.join(', ')}`);
  } else {
    pass(`release APK contains ${referencedAssets.length} current Android web asset reference(s)`);
  }
}

function requireAndroidWebAssetsMatchDist() {
  const distDir = join(root, 'dist');
  const androidWebDir = join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
  const distIndex = requireFile('dist/index.html');
  const androidIndexPath = join(androidWebDir, 'index.html');
  if (!distIndex || !existsSync(androidIndexPath)) {
    fail('Android web assets are missing index.html; run capacitor sync after build:android');
    return;
  }

  const distFiles = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) distFiles.push(relative);
    }
  };
  walk(distDir);

  const mismatched = [];
  const missing = [];
  for (const entry of distFiles) {
    const distPath = join(distDir, entry);
    const androidPath = join(androidWebDir, entry);
    if (!existsSync(androidPath)) {
      missing.push(entry);
      continue;
    }
    if (!readFileSync(distPath).equals(readFileSync(androidPath))) {
      mismatched.push(entry);
    }
  }
  if (missing.length > 0) fail(`Android web assets are missing dist file(s): ${missing.slice(0, 8).join(', ')}`);
  if (mismatched.length > 0) fail(`Android web assets differ from dist file(s): ${mismatched.slice(0, 8).join(', ')}`);
  if (missing.length === 0 && mismatched.length === 0) pass(`Android web assets match dist (${distFiles.length} file(s))`);
}

function requireApkCapacitorConfigCurrent() {
  const localConfig = join(root, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  if (!existsSync(localConfig)) {
    fail('android capacitor.config.json is missing; run capacitor sync');
    return;
  }
  const archived = readArchiveEntryBuffer('downloads/persona-chat.apk', 'assets/capacitor.config.json');
  if (!archived) return;
  if (!archived.equals(readFileSync(localConfig))) {
    fail('release APK capacitor.config.json does not match Android assets; rebuild the APK after capacitor sync');
    return;
  }
  pass('release APK capacitor.config.json matches Android assets');
}

function requireApkSigned() {
  const entries = listArchive('downloads/persona-chat.apk').map(normalizeArchiveEntry);
  const hasV1Signature = entries.includes('META-INF/MANIFEST.MF') && entries.some((entry) => /^META-INF\/.+\.(RSA|DSA|EC)$/i.test(entry));
  if (hasV1Signature) {
    pass('release APK includes v1 signature metadata');
    return;
  }

  const buildToolsDir = join(root, '.tools', 'android-sdk', 'build-tools');
  const candidates = [];
  if (existsSync(buildToolsDir)) {
    const executableName = process.platform === 'win32' ? 'apksigner.bat' : 'apksigner';
    for (const version of readdirSync(buildToolsDir).sort().reverse()) {
      candidates.push(join(buildToolsDir, version, executableName));
    }
  }
  candidates.push(process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');

  const env = { ...process.env };
  const bundledJavaHome = join(root, '.tools', 'jdk-21');
  if (!env.JAVA_HOME && existsSync(bundledJavaHome)) {
    env.JAVA_HOME = bundledJavaHome;
    env.Path = `${join(bundledJavaHome, 'bin')};${env.Path ?? env.PATH ?? ''}`;
  }

  for (const candidate of candidates) {
    try {
      const output = execFileSync(candidate, ['verify', '--verbose', 'downloads/persona-chat.apk'], {
        cwd: root,
        encoding: 'utf8',
        env,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/Verifies/i.test(output) && /Verified using v(?:2|3|3\.1) scheme .*true/i.test(output)) {
        pass('release APK verifies with apksigner v2+ signature');
        return;
      }
      warn('release APK apksigner check completed, but no v2+ signature was detected');
      return;
    } catch {
      // Try the next bundled or PATH candidate.
    }
  }

  warn('release APK does not include v1 signature metadata and apksigner was unavailable; run apksigner verify before final store distribution');
}

function requireArchiveFileMatchesLocal(archivePath, archiveEntry, localRelativePath) {
  const localPath = join(root, localRelativePath);
  if (!existsSync(localPath)) {
    fail(`${localRelativePath} is missing`);
    return;
  }
  const archived = readArchiveEntryBuffer(archivePath, archiveEntry);
  if (!archived) return;
  const local = readFileSync(localPath);
  if (!archived.equals(local)) {
    fail(`archive ${archiveEntry} does not match local ${localRelativePath}; rebuild persona-chat-release.tar.gz`);
    return;
  }
  pass(`archive ${archiveEntry} matches local ${localRelativePath}`);
}

async function smokeCheck(baseUrl) {
  const origin = baseUrl.replace(/\/+$/, '');
  const checks = [
    { path: '/', label: 'web home', expectOk: true },
    { path: '/api/health', label: 'API health', expectOk: true, expectJson: true },
    { path: '/api/admin/dashboard', label: 'admin dashboard unauthenticated', expectForbidden: true },
    { path: '/downloads/persona-chat.apk', label: 'release APK download', expectOk: true },
    { path: '/downloads/persona-chat-debug.apk', label: 'debug APK blocked', expectBlocked: true },
  ];

  for (const check of checks) {
    const url = `${origin}${check.path}`;
    try {
      const response = await fetch(url);
      if (check.expectBlocked) {
        if (response.status === 404 || response.status === 403) {
          pass(`${check.label} returned ${response.status}`);
        } else {
          fail(`${check.label} should be blocked, got HTTP ${response.status}`);
        }
        continue;
      }

      if (check.expectForbidden) {
        if (response.status === 401 || response.status === 403) {
          pass(`${check.label} returned ${response.status}`);
        } else {
          fail(`${check.label} should require admin auth, got HTTP ${response.status}`);
        }
        continue;
      }

      if (!response.ok) {
        fail(`${check.label} returned HTTP ${response.status}`);
        continue;
      }

      if (check.expectJson) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          fail(`${check.label} content-type is not JSON: ${contentType || '(empty)'}`);
          continue;
        }

        const body = await response.json();
        if (body && body.llmEnabled === false) {
          warn(`${check.label} reports llmEnabled=false; public beta should use real LLM`);
        }
      }

      pass(`${check.label} returned HTTP ${response.status}`);
    } catch (error) {
      fail(`${check.label} request failed: ${error.message}`);
    }
  }
}

console.log('Persona Chat release check');
console.log(`Root: ${root}`);

requireFile('dist/index.html');
requireFile('dist/manifest.json');
requireFile('dist/sw.js');
requireFile('dist/offline.html');
requireApk('downloads/persona-chat.apk', 'release APK');
requireAndroidWebAssetsMatchDist();
requireApkWebAssetsCurrent();
requireApkCapacitorConfigCurrent();
requireApkSigned();
requireFile('persona-chat-release.tar.gz', 'release archive');
requireFile('deploy-vps.sh');

if (existsSync(join(root, 'downloads/persona-chat-debug.apk'))) {
  warn('local debug APK exists; deploy-vps.sh removes it from deployed app and release archive must not include it');
}

const entries = listArchive('persona-chat-release.tar.gz');
if (entries.length > 0) {
  const requiredArchiveItems = [
    'dist/',
    'server/index.mjs',
    'downloads/persona-chat.apk',
    'package.json',
    'package-lock.json',
    'README.md',
    '.env.example',
    '.env.production',
    'deploy-vps.sh',
    'deploy-vps-commands.md',
    'scripts/check-ai-chain.mjs',
    'scripts/deploy-from-windows.ps1',
    'scripts/check-deploy-target.mjs',
    'scripts/check-release.mjs',
    'scripts/quality-gate.ps1',
    'docs/release-checklist.md',
    'docs/release-checklist.en.md',
  ];

  for (const item of requiredArchiveItems) {
    const ok = item.endsWith('/') ? archiveHasPrefix(entries, item) : archiveHas(entries, item);
    if (ok) {
      pass(`archive includes ${item}`);
    } else {
      fail(`archive is missing ${item}`);
    }
  }

  const exactArchiveItems = [
    ['downloads/persona-chat.apk', 'downloads/persona-chat.apk'],
    ['dist/index.html', 'dist/index.html'],
    ['server/index.mjs', 'server/index.mjs'],
    ['deploy-vps.sh', 'deploy-vps.sh'],
    ['scripts/check-release.mjs', 'scripts/check-release.mjs'],
  ];
  for (const [archiveEntry, localPath] of exactArchiveItems) {
    requireArchiveFileMatchesLocal('persona-chat-release.tar.gz', archiveEntry, localPath);
  }

  const forbiddenPatterns = [
    { label: 'unexpected env files', test: (entry) => entry.split('/').some((part) => part.startsWith('.env')) && !isAllowedEnvEntry(entry) },
    { label: 'server/data', test: (entry) => entry.startsWith('server/data/') || entry === 'server/data' },
    { label: 'server logs', test: (entry) => entry.startsWith('server/') && entry.endsWith('.log') },
    { label: 'server data backups', test: (entry) => entry.startsWith('server/') && entry.endsWith('.bak') },
    { label: 'keystore files', test: (entry) => entry.endsWith('.jks') || entry.endsWith('.keystore') },
    { label: 'Android signing properties', test: (entry) => entry === 'android/app/signing.properties' || entry.endsWith('/signing.properties') },
    { label: 'debug APK', test: (entry) => entry === 'downloads/persona-chat-debug.apk' },
    { label: 'node_modules', test: (entry) => entry === 'node_modules' || entry.startsWith('node_modules/') },
    { label: '.tools', test: (entry) => entry === '.tools' || entry.startsWith('.tools/') },
    { label: 'nested release archives', test: (entry) => /^persona-chat-.*\.(tar\.gz|zip)$/i.test(entry) },
  ];

  for (const pattern of forbiddenPatterns) {
    const matched = entries.filter((entry) => pattern.test(normalizeArchiveEntry(entry)));
    if (matched.length > 0) {
      fail(`archive contains forbidden ${pattern.label}: ${matched.join(', ')}`);
    } else {
      pass(`archive excludes ${pattern.label}`);
    }
  }
}

const url = args.get('--url');
if (url) {
  await smokeCheck(url);
} else {
  console.log('SKIP remote smoke checks; pass --url https://example.com to enable them');
}

if (warnings.length > 0) {
  console.log(`Warnings: ${warnings.length}`);
}

if (failures.length > 0) {
  writeReleaseReport();
  console.error(`Release check failed with ${failures.length} issue(s).`);
  process.exit(1);
}

writeReleaseReport();
console.log('Release check passed.');

function writeReleaseReport() {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const androidEnv = readEnvFile('.env.android');
  const apkApiOrigin = androidEnv.VITE_API_BASE_URL || 'not-set';
  const checkedOrigin = url ?? process.env.APP_URL ?? process.env.VITE_API_BASE_URL ?? 'not-set';
  const apkPath = join(root, 'downloads/persona-chat.apk');
  const archivePath = join(root, 'persona-chat-release.tar.gz');
  const risks = [
    ...warnings,
    ...(checkedOrigin !== 'not-set' && String(checkedOrigin).includes('202.182.102.34')
      ? ['HTTPS is still pinned to raw IP; production should bind a domain with a valid certificate.']
      : []),
  ];
  if (apkApiOrigin === 'not-set') {
    risks.push('APK API origin is not set in .env.android; Android builds need a final public backend origin.');
  } else if (checkedOrigin === 'not-set' || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(String(checkedOrigin))) {
    risks.push(`APK API origin ${apkApiOrigin} was not validated by this local-only release check.`);
  } else if (String(apkApiOrigin).replace(/\/+$/, '') !== String(checkedOrigin).replace(/\/+$/, '')) {
    risks.push(`APK API origin ${apkApiOrigin} differs from validated origin ${checkedOrigin}.`);
  }
  if (/^http:\/\//i.test(String(apkApiOrigin))) {
    risks.push(`APK API origin ${apkApiOrigin} uses HTTP; public beta should use HTTPS unless this is an internal preview.`);
  }
  const report = {
    id: `release-${Date.now()}`,
    version: packageJson.version ?? '0.0.0',
    generatedAt: new Date().toISOString(),
    checkedOrigin,
    apkApiOrigin,
    apk: existsSync(apkPath)
      ? {
          path: 'downloads/persona-chat.apk',
          sizeBytes: statSync(apkPath).size,
        }
      : undefined,
    archive: existsSync(archivePath)
      ? {
          path: 'persona-chat-release.tar.gz',
          sizeBytes: statSync(archivePath).size,
        }
      : undefined,
    checks: reportChecks,
    warnings,
    failures,
    risks,
  };
  writeFileSync(join(root, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('Wrote release-report.json');
}
