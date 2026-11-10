// 扫描 content/posts/*.md，生成 content/posts.json 索引。
// 用法：node dev/build-posts.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('content/posts');
const outFile = path.resolve('content/posts.json');

const parse = (raw) => {
  const text = raw.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const data = {};
  let body = text;
  if (m) {
    body = text.slice(m[0].length);
    m[1].split('\n').forEach((line) => {
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (!kv) return;
      let v = kv[2].trim();
      if (v.startsWith('[') && v.endsWith(']')) {
        v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        v = v.replace(/^["']|["']$/g, '');
      }
      data[kv[1]] = v;
    });
  }
  return { data, body };
};

const minutes = (md) => {
  const cjk = (md.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (md.match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 350 + words / 220));
};

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
const posts = files.map((file) => {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const { data, body } = parse(raw);
  const slug = file.replace(/\.md$/, '');
  return {
    slug,
    title: data.title || slug,
    date: data.date || '2026-01-01',
    summary: data.summary || '',
    tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
    featured: data.featured === 'true' || data.featured === true,
    minutes: minutes(body),
  };
}).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

fs.writeFileSync(outFile, JSON.stringify(posts, null, 2) + '\n', 'utf8');
console.log(`posts.json: ${posts.length} posts`);
posts.forEach((p) => console.log(`  ${p.date}  ${p.title}  (${p.minutes} min)`));
