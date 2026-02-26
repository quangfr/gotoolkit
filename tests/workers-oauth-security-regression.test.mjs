import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const WORKERS = [
    'workers/notion-proxy/index.js',
    'workers/gmail-proxy/index.js',
    'workers/ms-proxy/index.js',
    'workers/youtube-proxy/index.js',
];

const ROOT = process.cwd();

async function readWorker(relPath) {
    const absPath = path.join(ROOT, relPath);
    return fs.readFile(absPath, 'utf8');
}

test('oauth workers compile (syntax check)', () => {
    for (const relPath of WORKERS) {
        const result = spawnSync('node', ['--check', relPath], {
            cwd: ROOT,
            encoding: 'utf8',
        });

        assert.equal(
            result.status,
            0,
            `Syntax check failed for ${relPath}\n${result.stderr || result.stdout || ''}`,
        );
    }
});

test('oauth workers enforce nonce-based state and server-side consumption', async () => {
    for (const relPath of WORKERS) {
        const source = await readWorker(relPath);

        assert.match(source, /OAUTH_STATE_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
        assert.match(source, /generateOAuthNonce\s*\(/);
        assert.match(source, /writeOAuthState\s*\(/);
        assert.match(source, /consumeOAuthState\s*\(/);

        assert.ok(
            /statePayload\s*=\s*\{\s*nonce\s*\}/s.test(source)
            || /encodeState\s*\(\s*\{\s*nonce\s*\}\s*\)/s.test(source)
            || /btoa\s*\(\s*JSON\.stringify\s*\(\s*\{\s*nonce\s*\}\s*\)\s*\)/s.test(source),
            `${relPath} does not set OAuth state payload to nonce-only`,
        );
        assert.match(source, /state\s*=\s*decodeState\(/);
        assert.match(source, /state\.nonce/);
        assert.match(source, /await\s+consumeOAuthState\(/);

        assert.match(source, /State OAuth invalide ou expiré/);
        assert.doesNotMatch(source, /state\.sessionId/);
        assert.doesNotMatch(source, /state\.origin/);
    }
});

test('oauth callback target origin is normalized (no wildcard fallback)', async () => {
    for (const relPath of WORKERS) {
        const source = await readWorker(relPath);

        assert.match(source, /function\s+normalizeTargetOrigin\s*\(/);
        assert.match(source, /normalizedTargetOrigin\s*=\s*normalizeTargetOrigin\(/);

        assert.doesNotMatch(source, /\|\|\s*"\*"\s*\)/);
        assert.doesNotMatch(source, /\|\|\s*'\*'\s*\)/);
    }
});
