import 'node:process';
if (process.loadEnvFile) {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional when variables are set in environment
  }
}

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

// Local SQLite backup / fallback database
const db = new DatabaseSync(join(dataDir, 'lerp.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    full_name TEXT NOT NULL,
    kingschat_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    state_province TEXT NOT NULL,
    city TEXT NOT NULL,
    church_ministry_centre TEXT NOT NULL,
    zone_group_church TEXT NOT NULL,
    business_name TEXT,
    industry_category TEXT NOT NULL,
    products_services TEXT NOT NULL,
    assessment_answers TEXT NOT NULL,
    assessment_score INTEGER,
    assessment_result TEXT
  );
`);

// Supabase cloud database client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const fields = [
  'fullName', 'kingschatId', 'phoneNumber', 'email', 'country', 'stateProvince',
  'city', 'churchMinistryCentre', 'zoneGroupChurch', 'industryCategory', 'productsServices'
];
const maxLength = 500;
const resultFor = (score) => score <= 2 ? 'Not Export Ready' : score <= 4 ? 'Almost Export Ready' : 'Export Ready';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v.length === 2)
  );
}

function sessionToken() {
  const expiry = Date.now() + 1000 * 60 * 60 * 8;
  const value = `${expiry}.${randomBytes(18).toString('hex')}`;
  const key = process.env.LERP_SESSION_SECRET || process.env.LERP_ADMIN_PASSWORD || '';
  return `${value}.${createHmac('sha256', key).update(value).digest('hex')}`;
}

function isAdmin(req) {
  const token = parseCookies(req).lerp_admin;
  const key = process.env.LERP_SESSION_SECRET || process.env.LERP_ADMIN_PASSWORD || '';
  if (!token || !key) return false;
  const [expiry, nonce, signature] = token.split('.');
  const value = `${expiry}.${nonce}`;
  const expected = createHmac('sha256', key).update(value).digest('hex');
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }
  return Number(expiry) > Date.now();
}

async function body(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 50_000) throw new Error('Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    throw new Error('Invalid request body');
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function validate(input) {
  const value = {};
  for (const key of fields) {
    value[key] = clean(input[key]);
    if (!value[key]) return { error: `${key} is required.` };
    if (value[key].length > maxLength) return { error: `${key} is too long.` };
  }
  value.businessName = clean(input.businessName);
  if (value.businessName.length > maxLength) return { error: 'Business name is too long.' };
  if (!/^\S+@\S+\.\S+$/.test(value.email)) return { error: 'Enter a valid email address.' };
  if (!/^[+()\-\s\d]{7,25}$/.test(value.phoneNumber)) return { error: 'Enter a valid phone number.' };
  if (input.consent !== true) return { error: 'Consent is required to register.' };

  const answers = Array.isArray(input.assessmentAnswers) && input.assessmentAnswers.length === 6
    ? input.assessmentAnswers.map(v => v === true ? true : v === false ? false : null)
    : Array(6).fill(null);
  const completed = answers.every(v => v !== null);

  value.answers = answers;
  value.score = completed ? answers.filter(Boolean).length : null;
  value.result = completed ? resultFor(value.score) : null;
  return { value };
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/register') {
      const check = validate(await body(req));
      if (check.error) return json(res, 400, { error: check.error });
      const v = check.value;

      const record = {
        full_name: v.fullName,
        kingschat_id: v.kingschatId,
        phone_number: v.phoneNumber,
        email: v.email.toLowerCase(),
        country: v.country,
        state_province: v.stateProvince,
        city: v.city,
        church_ministry_centre: v.churchMinistryCentre,
        zone_group_church: v.zoneGroupChurch,
        business_name: v.businessName || null,
        industry_category: v.industryCategory,
        products_services: v.productsServices,
        assessment_answers: v.answers,
        assessment_score: v.score,
        assessment_result: v.result
      };

      if (supabase) {
        const { error: sbError } = await supabase.from('registrations').insert([record]);
        if (sbError) {
          if (sbError.code === '23505' || sbError.message?.includes('duplicate key') || sbError.message?.includes('UNIQUE')) {
            return json(res, 409, { error: 'This email address has already been registered.' });
          }
          console.error('Supabase registration insert error:', sbError);
          return json(res, 500, { error: `Database error: ${sbError.message || 'Could not save registration.'}` });
        }
      }

      // Always save a local copy in SQLite backup table
      try {
        db.prepare(`
          INSERT INTO registrations (
            full_name,kingschat_id,phone_number,email,country,state_province,city,
            church_ministry_centre,zone_group_church,business_name,industry_category,
            products_services,assessment_answers,assessment_score,assessment_result
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          v.fullName, v.kingschatId, v.phoneNumber, v.email.toLowerCase(), v.country,
          v.stateProvince, v.city, v.churchMinistryCentre, v.zoneGroupChurch,
          v.businessName || null, v.industryCategory, v.productsServices,
          JSON.stringify(v.answers), v.score, v.result
        );
      } catch (error) {
        if (!supabase) {
          if (String(error).includes('UNIQUE')) {
            return json(res, 409, { error: 'This email address has already been registered.' });
          }
          throw error;
        }
      }

      return json(res, 201, { ok: true, assessmentResult: v.result });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const { password = '' } = await body(req);
      const configured = process.env.LERP_ADMIN_PASSWORD || '';
      if (!configured) {
        return json(res, 503, { error: 'Admin access has not been configured. Set LERP_ADMIN_PASSWORD first.' });
      }
      const incoming = createHash('sha256').update(String(password)).digest();
      const expected = createHash('sha256').update(configured).digest();
      if (!timingSafeEqual(incoming, expected)) {
        return json(res, 401, { error: 'Incorrect password.' });
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `lerp_admin=${encodeURIComponent(sessionToken())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
        'Cache-Control': 'no-store'
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'lerp_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
      });
      return res.end('{"ok":true}');
    }

    if (url.pathname.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return json(res, 401, { error: 'Sign in required.' });

      if (req.method === 'GET' && url.pathname === '/api/admin/stats') {
        if (supabase) {
          const { count: total, error: totalErr } = await supabase
            .from('registrations')
            .select('*', { count: 'exact', head: true });
          if (totalErr) throw totalErr;

          const { data: rows, error: rowsErr } = await supabase
            .from('registrations')
            .select('assessment_result');
          if (rowsErr) throw rowsErr;

          const counts = {};
          for (const row of rows || []) {
            const label = row.assessment_result || 'Not assessed';
            counts[label] = (counts[label] || 0) + 1;
          }
          const readiness = Object.entries(counts).map(([label, value]) => ({ label, value }));
          return json(res, 200, { total: total || 0, readiness });
        }

        const total = db.prepare('SELECT COUNT(*) AS value FROM registrations').get().value;
        const readiness = db.prepare("SELECT COALESCE(assessment_result, 'Not assessed') AS label, COUNT(*) AS value FROM registrations GROUP BY assessment_result").all();
        return json(res, 200, { total, readiness });
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/registrations') {
        const q = clean(url.searchParams.get('q') || '');
        const readiness = clean(url.searchParams.get('readiness') || '');

        if (supabase) {
          let query = supabase.from('registrations').select('*').order('created_at', { ascending: false });
          if (q) {
            query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,country.ilike.%${q}%,church_ministry_centre.ilike.%${q}%,zone_group_church.ilike.%${q}%`);
          }
          if (readiness) {
            if (readiness === 'Not assessed') {
              query = query.is('assessment_result', null);
            } else {
              query = query.eq('assessment_result', readiness);
            }
          }
          const { data: rows, error } = await query;
          if (error) throw error;
          return json(res, 200, { rows: rows || [] });
        }

        const where = [];
        const params = [];
        if (q) {
          where.push('(full_name LIKE ? OR email LIKE ? OR country LIKE ? OR church_ministry_centre LIKE ? OR zone_group_church LIKE ?)');
          params.push(...Array(5).fill(`%${q}%`));
        }
        if (readiness) {
          where.push(readiness === 'Not assessed' ? 'assessment_result IS NULL' : 'assessment_result = ?');
          if (readiness !== 'Not assessed') params.push(readiness);
        }
        const rows = db.prepare(`SELECT * FROM registrations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`).all(...params);
        return json(res, 200, { rows });
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
        let rows;
        if (supabase) {
          const { data, error } = await supabase.from('registrations').select('*').order('created_at', { ascending: false });
          if (error) throw error;
          rows = data || [];
        } else {
          rows = db.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all();
        }

        const headers = [
          'Registered at','Full name','KingsChat ID','Phone','Email','Country','State/Province',
          'City','Church/Ministry/Centre','Zone/Group Church','Business name','Industry category',
          'Products/services','Assessment score','Assessment result'
        ];
        const data = rows.map(r => [
          r.created_at, r.full_name, r.kingschat_id, r.phone_number, r.email, r.country,
          r.state_province, r.city, r.church_ministry_centre, r.zone_group_church,
          r.business_name, r.industry_category, r.products_services, r.assessment_score,
          r.assessment_result
        ]);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="lerp-registrations.csv"',
          'Cache-Control': 'no-store'
        });
        return res.end([headers, ...data].map(row => row.map(csvEscape).join(',')).join('\n'));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        ok: true,
        database: supabase ? 'supabase' : 'sqlite',
        supabaseConfigured: !!supabase
      });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(publicDir, requested));
    if (!filePath.startsWith(publicDir) || !existsSync(filePath) || !(await stat(filePath)).isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => {
  console.log(`LERP portal running at http://localhost:${port} [Database: ${supabase ? 'Supabase' : 'SQLite'}]`);
});
