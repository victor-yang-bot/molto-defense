import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = '/tmp/citycore_sessions';
const MAX_SESSION_SIZE = 512 * 1024; // 512KB max per session
const MAX_SESSIONS = 10000;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function ensureDir() {
    if (!existsSync(SESSION_DIR)) {
        mkdirSync(SESSION_DIR, { recursive: true });
    }
}

function getSessionPath(sessionId) {
    // Validate session ID - only alphanumeric, 16-64 chars
    if (!sessionId || !/^[a-zA-Z0-9]{16,64}$/.test(sessionId)) {
        return null;
    }
    return join(SESSION_DIR, `${sessionId}.json`);
}

function cleanupOldSessions() {
    try {
        ensureDir();
        const files = readdirSync(SESSION_DIR);
        const now = Date.now();

        // Delete expired sessions
        for (const file of files) {
            try {
                const filePath = join(SESSION_DIR, file);
                const stat = statSync(filePath);
                if (now - stat.mtimeMs > SESSION_TTL) {
                    unlinkSync(filePath);
                }
            } catch (e) { /* skip */ }
        }

        // If still too many, delete oldest
        const remaining = readdirSync(SESSION_DIR);
        if (remaining.length > MAX_SESSIONS) {
            remaining.sort((a, b) => {
                const sa = statSync(join(SESSION_DIR, a));
                const sb = statSync(join(SESSION_DIR, b));
                return sa.mtimeMs - sb.mtimeMs;
            });
            for (let i = 0; i < remaining.length - MAX_SESSIONS; i++) {
                try { unlinkSync(join(SESSION_DIR, remaining[i])); } catch (e) { /* skip */ }
            }
        }
    } catch (e) { /* cleanup is best-effort */ }
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    cleanupOldSessions();

    // GET /api/session/[id] - load session
    if (req.method === 'GET') {
        // URL: /api/session/abc123
        const urlParts = req.url.split('/').filter(Boolean);
        // urlParts = ['api', 'session', 'abc123']
        const sessionId = urlParts[2];
        const path = getSessionPath(sessionId);

        if (!path) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        try {
            if (existsSync(path)) {
                const raw = readFileSync(path, 'utf-8');
                const data = JSON.parse(raw);
                return res.status(200).json({ data });
            }
            return res.status(404).json({ error: 'Session not found' });
        } catch (e) {
            return res.status(500).json({ error: 'Failed to read session' });
        }
    }

    // POST /api/session - save session
    if (req.method === 'POST') {
        const { sessionId, data } = req.body;
        const path = getSessionPath(sessionId);

        if (!path) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        const json = JSON.stringify(data);
        if (json.length > MAX_SESSION_SIZE) {
            return res.status(413).json({ error: 'Session data too large' });
        }

        try {
            ensureDir();
            writeFileSync(path, json, 'utf-8');
            return res.status(200).json({ ok: true });
        } catch (e) {
            return res.status(500).json({ error: 'Failed to save session' });
        }
    }

    // DELETE /api/session/[id] - delete session
    if (req.method === 'DELETE') {
        const urlParts = req.url.split('/').filter(Boolean);
        const sessionId = urlParts[2];
        const path = getSessionPath(sessionId);

        if (!path) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        try {
            if (existsSync(path)) {
                unlinkSync(path);
                return res.status(200).json({ ok: true });
            }
            return res.status(404).json({ error: 'Session not found' });
        } catch (e) {
            return res.status(500).json({ error: 'Failed to delete session' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
