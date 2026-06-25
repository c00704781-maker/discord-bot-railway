import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import PImage from 'pureimage';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  StringSelectMenuBuilder
} from 'discord.js';

const PREFIX = process.env.PREFIX || '-';
const BRAND = { short: 'RA', name: 'RISING ASHES', footer: 'RA Games • RISING ASHES' };
const DATA_DIR = './data';
const POINTS_FILE = path.join(DATA_DIR, 'points.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(POINTS_FILE)) fs.writeFileSync(POINTS_FILE, '{}');

for (const fp of [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
]) {
  try { if (fs.existsSync(fp)) { PImage.registerFont(fp, 'RAFont').loadSync(); break; } } catch {}
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});
const games = new Map();
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const gameKey = (g, c, n) => `${g}:${c}:${n}`;

const countries = [
  ['الكويت', 'KW'], ['السعودية', 'SA'], ['قطر', 'QA'], ['الإمارات', 'AE'], ['البحرين', 'BH'], ['عمان', 'OM'], ['مصر', 'EG'], ['العراق', 'IQ'],
  ['الأردن', 'JO'], ['المغرب', 'MA'], ['تركيا', 'TR'], ['اليابان', 'JP'], ['كوريا الجنوبية', 'KR'], ['الصين', 'CN'], ['الهند', 'IN'], ['البرازيل', 'BR'],
  ['الأرجنتين', 'AR'], ['فرنسا', 'FR'], ['إسبانيا', 'ES'], ['إيطاليا', 'IT'], ['ألمانيا', 'DE'], ['بريطانيا', 'GB'], ['أمريكا', 'US'], ['كندا', 'CA']
].map(([name, code]) => ({ name, code }));

function loadPoints() { try { return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8')); } catch { return {}; } }
function savePoints(d) { fs.writeFileSync(POINTS_FILE, JSON.stringify(d, null, 2)); }
function addPoint(guildId, userId, amount = 1) { const d = loadPoints(); d[guildId] ??= {}; d[guildId][userId] = (d[guildId][userId] || 0) + amount; savePoints(d); return d[guildId][userId]; }
function getPoint(guildId, userId) { return loadPoints()[guildId]?.[userId] || 0; }
function topPoints(guildId) { return Object.entries(loadPoints()[guildId] || {}).sort((a, b) => b[1] - a[1]).slice(0, 10); }
function safeName(x) { return x?.displayName || x?.username || 'Player'; }
function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }
function rows(buttons) { const out = []; for (let i = 0; i < buttons.length; i += 5) out.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5))); return out; }

function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function roundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill();
}
function text(ctx, value, x, y, size = 34, color = '#fff', align = 'center') { ctx.fillStyle = color; ctx.font = `${size}pt RAFont, Arial`; ctx.textAlign = align; ctx.fillText(value, x, y); }
function wrap(ctx, value, x, y, maxWidth, lineHeight, size = 30, color = '#fff') {
  ctx.fillStyle = color; ctx.font = `${size}pt RAFont, Arial`; ctx.textAlign = 'center';
  const words = String(value).split(' '); let line = '';
  for (const word of words) { const t = line + word + ' '; if (ctx.measureText(t).width > maxWidth && line) { ctx.fillText(line, x, y); line = word + ' '; y += lineHeight; } else line = t; }
  ctx.fillText(line, x, y);
}
function base(ctx, w, h, title, sub) {
  rect(ctx, 0, 0, w, h, '#09090f'); rect(ctx, 0, 0, w, 95, '#3a0d0d'); rect(ctx, 0, h - 70, w, 70, '#151521');
  for (let i = 0; i < 18; i++) { ctx.fillStyle = i % 2 ? 'rgba(220,38,38,.20)' : 'rgba(245,158,11,.16)'; ctx.beginPath(); ctx.arc((i * 137) % w, 120 + ((i * 83) % (h - 210)), 30 + (i % 5) * 16, 0, Math.PI * 2); ctx.fill(); }
  roundRect(ctx, 32, 26, w - 64, h - 52, 26, 'rgba(255,255,255,.07)');
  ctx.strokeStyle = 'rgba(255,255,255,.20)'; ctx.lineWidth = 3; ctx.stroke();
  text(ctx, title, w / 2, 70, 34, '#fff'); text(ctx, sub, w / 2, 122, 20, '#fbbf24');
  text(ctx, BRAND.short, w / 2, h / 2 + 65, 128, 'rgba(255,255,255,.08)'); text(ctx, BRAND.footer, w / 2, h - 30, 15, 'rgba(255,255,255,.72)');
}
async function image(name, draw, w = 1000, h = 560) {
  const img = PImage.make(w, h); const ctx = img.getContext('2d'); draw(ctx, w, h);
  const stream = new PassThrough(); const chunks = []; stream.on('data', c => chunks.push(c));
  await PImage.encodePNGToStream(img, stream); return new AttachmentBuilder(Buffer.concat(chunks), { name });
}
function flagImage(country) { return image('ra-flags.png', (ctx, w, h) => { base(ctx, w, h, 'ما اسم الدولة؟', 'أجب قبل انتهاء الوقت'); roundRect(ctx, 325, 165, 350, 190, 28, '#111827'); text(ctx, country.code, 500, 292, 82, '#fff'); text(ctx, '⏱ لديك 15 ثانية', 500, 420, 28, '#fff'); }); }
function lobbyImage(title, players, min, seconds) { return image('ra-lobby.png', (ctx, w, h) => { base(ctx, w, h, title, `الحد الأدنى ${min} لاعبين`); roundRect(ctx, 95, 155, 810, 250, 28, 'rgba(0,0,0,.42)'); text(ctx, `المشاركين: ${players.length}`, 500, 210, 30); wrap(ctx, players.length ? players.map((p, i) => `${i + 1}. ${p.name}`).join('  •  ') : 'اضغط دخول للمشاركة', 500, 270, 740, 36, 23); text(ctx, `⏱ يبدأ خلال ${seconds} ثانية أو اضغط ابدأ`, 500, 460, 25, '#fbbf24'); }); }
function resultImage(title, main, sub = '') { return image('ra-result.png', (ctx, w, h) => { base(ctx, w, h, title, BRAND.name); wrap(ctx, main, 500, 265, 790, 52, 35); if (sub) wrap(ctx, sub, 500, 390, 800, 38, 25, '#fbbf24'); }); }
function rouletteImage(players, winnerIndex = -1) { return image('ra-roulette.png', (ctx, w, h) => {
  base(ctx, w, h, 'روليت RA', 'العجلة تختار الفائز'); const cx = 500, cy = 355, r = 210, n = Math.max(players.length, 1); const start = winnerIndex >= 0 ? -Math.PI / 2 - ((winnerIndex + .5) * Math.PI * 2 / n) : -Math.PI / 2;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start + i * Math.PI * 2 / n, start + (i + 1) * Math.PI * 2 / n); ctx.closePath(); ctx.fillStyle = i % 2 ? '#dc2626' : '#f59e0b'; ctx.fill(); ctx.strokeStyle = '#111827'; ctx.lineWidth = 4; ctx.stroke(); ctx.save(); ctx.translate(cx, cy); ctx.rotate(start + (i + .5) * Math.PI * 2 / n); text(ctx, players[i]?.name?.slice(0, 12) || 'Player', r - 22, 7, 14, '#fff', 'right'); ctx.restore(); }
  ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill(); text(ctx, 'RA', cx, cy + 14, 30); ctx.beginPath(); ctx.moveTo(cx, cy - r - 32); ctx.lineTo(cx - 22, cy - r + 16); ctx.lineTo(cx + 22, cy - r + 16); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); if (winnerIndex >= 0) text(ctx, `الفائز: ${players[winnerIndex].name}`, 500, 520, 28, '#22c55e');
}, 1000, 640); }

client.once(Events.ClientReady, () => console.log(`RA Games online as ${client.user.tag}`));
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  const cmd = (msg.content.slice(PREFIX.length).trim().split(/\s+/)[0] || '').toLowerCase();
  if (['العاب', 'مساعدة', 'games', 'help'].includes(cmd)) return help(msg);
  if (['اعلام', 'علم', 'flags'].includes(cmd)) return flags(msg);
  if (['روليت', 'roulette'].includes(cmd)) return roulette(msg);
  if (['كراسي', 'chairs'].includes(cmd)) return chairs(msg);
  if (['مافيا', 'mafia'].includes(cmd)) return mafia(msg);
  if (['نقاط', 'points'].includes(cmd)) return msg.reply(`نقاطك: **${getPoint(msg.guild.id, msg.author.id)}**`);
  if (['توب', 'top'].includes(cmd)) return top(msg);
});
async function help(msg) { await msg.reply({ embeds: [new EmbedBuilder().setColor(0xdc2626).setTitle('🎮 RA Games — RISING ASHES').setDescription('أوامر البوت بالأزرار والصور:').addFields({ name: '-اعلام', value: 'علم دولة + 4 اختيارات + 15 ثانية + نقاط' }, { name: '-روليت', value: 'دخول لاعبين، حد أدنى 3، عجلة أسماء، الفائز يطرد لاعب من الجولة القادمة' }, { name: '-كراسي', value: 'كراسي موسيقية بالأزرار وجولات خروج' }, { name: '-مافيا', value: 'توزيع أدوار بالخاص وتصويت نهاري' }, { name: '-نقاط / -توب', value: 'نقاطك وترتيب السيرفر' }).setFooter({ text: BRAND.footer })] }); }
async function top(msg) { const list = topPoints(msg.guild.id); if (!list.length) return msg.reply('مافي نقاط للحين.'); await msg.reply(list.map(([id, p], i) => `**${i + 1}.** <@${id}> — ${p} نقطة`).join('\n')); }

async function flags(msg) {
  const answer = countries[Math.floor(Math.random() * countries.length)]; const choices = shuffle([answer, ...shuffle(countries.filter(c => c.name !== answer.name)).slice(0, 3)]);
  const buttons = choices.map((c, i) => new ButtonBuilder().setCustomId(`flag:${Date.now()}:${i}`).setLabel(c.name).setStyle(ButtonStyle.Secondary));
  const sent = await msg.channel.send({ content: `🏳️ ما اسم الدولة؟`, files: [await flagImage(answer)], components: rows(buttons) });
  const col = sent.createMessageComponentCollector({ time: 15000, max: 1 });
  col.on('collect', async i => { const pick = Number(i.customId.split(':').pop()); if (choices[pick].name === answer.name) { const total = addPoint(msg.guild.id, i.user.id, 1); await i.update({ content: `أحسنت <@${i.user.id}> حصلت على نقطة.`, files: [await resultImage('إجابة صحيحة', `أحسنت ${safeName(i.member)} حصلت على نقطة`, `مجموع نقاطك: ${total}`)], components: [] }); } else { await i.update({ content: `خطأ. الإجابة الصحيحة: **${answer.name}**`, files: [await resultImage('إجابة خاطئة', `${safeName(i.member)} اختار ${choices[pick].name}`, `الإجابة الصحيحة: ${answer.name}`)], components: [] }); } });
  col.on('end', async c => { if (!c.size) await sent.edit({ content: 'لم يقم أحد بالإجابة.', components: [] }).catch(() => {}); });
}

async function startLobby(msg, name, title, min, seconds, startFn) {
  const k = gameKey(msg.guild.id, msg.channel.id, name); if (games.has(k)) return msg.reply('في لعبة شغالة بنفس الروم.');
  const state = { hostId: msg.author.id, players: [] }; games.set(k, state);
  const makeRow = () => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${name}:join`).setLabel('دخول').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`${name}:leave`).setLabel('خروج').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`${name}:start`).setLabel('ابدأ').setStyle(ButtonStyle.Danger));
  const sent = await msg.channel.send({ files: [await lobbyImage(title, state.players, min, seconds)], components: [makeRow()] });
  const refresh = async () => sent.edit({ files: [await lobbyImage(title, state.players, min, seconds)], components: [makeRow()] }).catch(() => {});
  const col = sent.createMessageComponentCollector({ time: seconds * 1000 });
  col.on('collect', async i => { if (i.customId.endsWith(':join')) { if (!state.players.find(p => p.id === i.user.id)) state.players.push({ id: i.user.id, name: safeName(i.member) }); await i.deferUpdate(); await refresh(); } else if (i.customId.endsWith(':leave')) { state.players = state.players.filter(p => p.id !== i.user.id); await i.deferUpdate(); await refresh(); } else if (i.customId.endsWith(':start')) { if (i.user.id !== state.hostId) return i.reply({ content: 'صاحب اللعبة فقط يقدر يبدأ.', ephemeral: true }); if (state.players.length < min) return i.reply({ content: `الحد الأدنى ${min} لاعبين.`, ephemeral: true }); await i.deferUpdate(); col.stop('start'); } });
  col.on('end', async () => { if (state.players.length < min) { games.delete(k); return sent.edit({ files: [await resultImage(title, 'لم تبدأ اللعبة', `الحد الأدنى ${min} لاعبين`)], components: [] }).catch(() => {}); } await sent.edit({ components: [] }).catch(() => {}); await startFn(state, sent, k); });
}
async function roulette(msg) { return startLobby(msg, 'roulette', 'روليت RA', 3, 30, async (state, sent, k) => { const players = state.players; await sent.edit({ content: '🎡 الروليت تدور...', files: [await rouletteImage(players)], components: [] }); await wait(2000); const winIndex = Math.floor(Math.random() * players.length); const winner = players[winIndex]; addPoint(sent.guild.id, winner.id, 1); const targets = players.filter(p => p.id !== winner.id).slice(0, 25); const menu = new StringSelectMenuBuilder().setCustomId(`roulette:kick:${winner.id}`).setPlaceholder('اختر لاعب ينطرد من الجولة القادمة').addOptions(targets.map(p => ({ label: p.name.slice(0, 90), value: p.id }))); await sent.edit({ content: `🎉 الفائز <@${winner.id}> — اختر لاعب يطلع من الجولة القادمة.`, files: [await rouletteImage(players, winIndex)], components: [new ActionRowBuilder().addComponents(menu)] }); const col = sent.createMessageComponentCollector({ time: 30000, max: 1 }); col.on('collect', async i => { if (i.user.id !== winner.id) return i.reply({ content: 'الاختيار للفائز فقط.', ephemeral: true }); await i.update({ content: `✅ <@${winner.id}> طرد <@${i.values[0]}> من الجولة القادمة.`, components: [] }); games.delete(k); }); col.on('end', () => games.delete(k)); }); }
async function chairs(msg) { return startLobby(msg, 'chairs', 'كراسي RA', 3, 25, async (state, sent, k) => { let players = [...state.players]; while (players.length > 1) { const chairCount = players.length - 1; const round = await sent.channel.send({ files: [await resultImage('كراسي', `عدد الكراسي: ${chairCount}`, 'اضغط اجلس بسرعة خلال 8 ثواني')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`chairs:sit:${Date.now()}`).setLabel('اجلس بسرعة').setStyle(ButtonStyle.Success))] }); const seated = new Set(); const col = round.createMessageComponentCollector({ time: 8000 }); col.on('collect', async i => { if (!players.find(p => p.id === i.user.id)) return i.reply({ content: 'أنت مو داخل الجولة.', ephemeral: true }); if (seated.size >= chairCount) return i.reply({ content: 'خلصت الكراسي!', ephemeral: true }); if (!seated.has(i.user.id)) seated.add(i.user.id); await i.reply({ content: 'جلست على كرسي ✅', ephemeral: true }); }); await new Promise(res => col.on('end', res)); const not = players.filter(p => !seated.has(p.id)); const out = not.length ? not[Math.floor(Math.random() * not.length)] : players[Math.floor(Math.random() * players.length)]; players = players.filter(p => p.id !== out.id); await sent.channel.send({ files: [await resultImage('خرج من اللعبة', `${out.name} ما حصل كرسي`, `المتبقي: ${players.length}`)] }); await wait(1200); } addPoint(sent.guild.id, players[0].id, 2); await sent.channel.send({ files: [await resultImage('فائز الكراسي', `${players[0].name} هو آخر لاعب`, '+2 نقاط')] }); games.delete(k); }); }
async function mafia(msg) { return startLobby(msg, 'mafia', 'مافيا RA', 4, 30, async (state, sent, k) => { const players = shuffle(state.players); const mafiaCount = players.length >= 8 ? 2 : 1; const roles = new Map(); players.forEach((p, idx) => roles.set(p.id, idx < mafiaCount ? 'مافيا' : idx === mafiaCount ? 'طبيب' : idx === mafiaCount + 1 ? 'محقق' : 'مواطن')); for (const p of players) { const u = await client.users.fetch(p.id).catch(() => null); await u?.send(`🎭 لعبة مافيا RA\nدورك: **${roles.get(p.id)}**\nلا ترسل دورك لأحد.`).catch(() => {}); } await sent.channel.send({ files: [await resultImage('بدأت مافيا', 'تم إرسال الأدوار بالخاص', 'الآن تصويت نهاري')] }); const menu = new StringSelectMenuBuilder().setCustomId('mafia:vote').setPlaceholder('صوّت على لاعب').addOptions(players.slice(0, 25).map(p => ({ label: p.name.slice(0, 90), value: p.id }))); const voteMsg = await sent.channel.send({ content: '🗳️ التصويت مفتوح 45 ثانية.', components: [new ActionRowBuilder().addComponents(menu)] }); const votes = new Map(); const col = voteMsg.createMessageComponentCollector({ time: 45000 }); col.on('collect', async i => { if (!players.find(p => p.id === i.user.id)) return i.reply({ content: 'أنت مو داخل اللعبة.', ephemeral: true }); votes.set(i.user.id, i.values[0]); await i.reply({ content: 'تم تسجيل تصويتك.', ephemeral: true }); }); col.on('end', async () => { const count = new Map(); for (const v of votes.values()) count.set(v, (count.get(v) || 0) + 1); const loser = [...count.entries()].sort((a, b) => b[1] - a[1])[0]; await voteMsg.edit({ content: loser ? `تم طرد <@${loser[0]}> — كان دوره: **${roles.get(loser[0])}**` : 'لم يصوّت أحد. انتهت الجولة بدون طرد.', components: [] }); games.delete(k); }); }); }

client.on(Events.Error, console.error);
client.login(process.env.DISCORD_TOKEN);
