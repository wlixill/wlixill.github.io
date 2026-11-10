// 从 GitHub 同步：头像 / 昵称 / 仓库列表。
//   - content/profile.json：login、name（GitHub 没填名字时回退 login）、bio、avatar
//   - assets/img/avatar.jpg：GitHub 头像
//   - content/repos.json：仓库列表（保留你手写的中文 desc）
// 用法：node dev/fetch-github.mjs
import fs from 'node:fs';

const USER = 'wlixill';
const OUT = 'content/repos.json';
const PROFILE_OUT = 'content/profile.json';
const AVATAR_OUT = 'assets/img/avatar.jpg';

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

const HEADERS = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36' };

/* ---------- profile + avatar ---------- */
async function syncProfile() {
  const res = await fetch(`https://github.com/${USER}`, { headers: HEADERS });
  if (!res.ok) {
    console.warn(`profile: GitHub 返回 ${res.status}，跳过`);
    return;
  }
  const html = await res.text();
  const login = new RegExp(`<span class="p-nickname[^"]*"[^>]*>([\\s\\S]*?)</span>`).exec(html)?.[1];
  const name = new RegExp(`<span class="p-name[^"]*"[^>]*>([\\s\\S]*?)</span>`).exec(html)?.[1];
  const bio = new RegExp(`<div class="p-note[^"]*"[^>]*>([\\s\\S]*?)</div>`).exec(html)?.[1];
  const avatarSrc = new RegExp(`<meta property="og:image" content="([^"]+)"`).exec(html)?.[1];

  const cleanLogin = login ? stripTags(decode(login)) : USER;
  let cleanName = name ? stripTags(decode(name)) : '';
  if (!cleanName || cleanName === cleanLogin) cleanName = cleanLogin;

  let cleanBio = bio ? stripTags(decode(bio)) : '';
  if (cleanBio === `${cleanLogin}.` || cleanBio === cleanLogin) cleanBio = '';

  const profile = {
    login: cleanLogin,
    name: cleanName,
    avatar: AVATAR_OUT,
    html_url: `https://github.com/${cleanLogin}`,
    bio: cleanBio,
  };

  if (avatarSrc) {
    try {
      const img = await fetch(`${avatarSrc}&s=400`, { headers: HEADERS });
      if (img.ok) {
        const buf = Buffer.from(await img.arrayBuffer());
        fs.writeFileSync(AVATAR_OUT, buf);
        console.log(`avatar: ${(buf.length / 1024).toFixed(0)} KB → ${AVATAR_OUT}`);
      }
    } catch (err) {
      console.warn(`avatar: 下载失败（${err.message}），保留旧图`);
    }
  }

  fs.writeFileSync(PROFILE_OUT, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  console.log(`profile: ${profile.name} (@${profile.login})`);
}

await syncProfile();

const res = await fetch(`https://github.com/${USER}?tab=repositories`, {
  headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36' },
});
if (!res.ok) {
  console.error(`GitHub 返回 ${res.status}，未修改 ${OUT}`);
  process.exit(1);
}
const html = await res.text();

const items = [...html.matchAll(/<li[^>]*itemprop="owns"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
if (!items.length) {
  console.error('没有解析到仓库（GitHub 页面结构可能变了），未修改。');
  process.exit(1);
}

let previous = [];
try {
  previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
} catch { /* 首次运行 */ }
const descOf = Object.fromEntries(previous.map((r) => [r.name, r.desc || '']));

const repos = items.map((it) => {
  const name = /itemprop="name codeRepository"[^>]*>\s*([^<]+?)\s*</.exec(it)?.[1]?.trim() || '';
  const lang = /itemprop="programmingLanguage">([^<]+)</.exec(it)?.[1] || '';
  const rawDesc = /itemprop="description"[^>]*>([\s\S]*?)<\/p>/.exec(it)?.[1] || '';
  const desc = decode(rawDesc.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return {
    name,
    url: `https://github.com/${USER}/${name}`,
    lang,
    desc: descOf[name] || desc,
    fork: /<span[^>]*>\s*Forked from/.test(it) || /aria-label="Forked from/.test(it) || /\bforked\b/i.test(it),
  };
}).filter((r) => r.name);

// 自己写的排在前面，fork 放最后
repos.sort((a, b) => Number(a.fork) - Number(b.fork) || a.name.localeCompare(b.name));

fs.writeFileSync(OUT, JSON.stringify(repos, null, 2) + '\n', 'utf8');
console.log(`repos.json: ${repos.length} 个仓库`);
repos.forEach((r) => console.log(`  ${r.name}  ${r.lang}${r.fork ? '  (fork)' : ''}`));
