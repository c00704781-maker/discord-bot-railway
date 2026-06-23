import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN?.trim();
const GUILD_ID = process.env.GUILD_ID?.trim() || null;
const COLOR = 0x7c3aed;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in Railway variables.');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const games = {
  ml: { label: 'Mobile Legends', id: 'ID', emoji: '📱' },
  cod: { label: 'COD Mobile', id: 'UID', emoji: '🎯' },
  roblox: { label: 'Roblox', id: 'Username', emoji: '🧱' }
};

const ticketTypes = {
  complaint: { label: 'شكوى', emoji: '🚨', desc: 'بلاغ أو مشكلة تحتاج تدخل الإدارة' },
  suggestion: { label: 'اقتراح', emoji: '💡', desc: 'اقتراح لتطوير السيرفر' },
  subscription: { label: 'نظام الاشتراكات', emoji: '💎', desc: 'استفسار أو طلب اشتراك' }
};

function emptyStore() {
  return { guilds: {}, tickets: {}, lobbies: {}, tempRooms: {} };
}

function load() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(emptyStore(), null, 2));
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (error) {
    console.error('Store load failed:', error);
    return emptyStore();
  }
}

let store = load();
const pending = new Map();

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.error('Store save failed:', error);
  }
}

function cfg(guildId) {
  if (!store.guilds[guildId]) {
    store.guilds[guildId] = { ticketPanel: null, lobbyPanel: null, tempJoin: null, tempCategory: null };
    save();
  }
  return store.guilds[guildId];
}

function clean(value) {
  return String(value || 'room')
    .replace(/[^a-zA-Z0-9\u0621-\u064a -]/g, '')
    .trim()
    .slice(0, 45) || 'room';
}

function canManage(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) || member?.permissions?.has(PermissionFlagsBits.ManageChannels);
}

function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) || member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

async function rep(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) return interaction.followUp({ ephemeral: true, ...payload });
    return interaction.reply(payload);
  } catch (error) {
    console.error('reply failed:', error?.message || error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('اختبار البوت'),
  new SlashCommandBuilder().setName('help').setDescription('شرح أنظمة البوت'),
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب')),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('السبب')),
  new SlashCommandBuilder().setName('timeout').setDescription('تايم آوت').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('الدقائق').setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o => o.setName('reason').setDescription('السبب')),
  new SlashCommandBuilder().setName('clear').setDescription('مسح رسائل').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('setup-ticket').setDescription('تنصيب نظام التكت').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption(o => o.setName('channel').setDescription('روم لوحة التكت').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('setup-lobby').setDescription('تنصيب نظام اللوبي').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption(o => o.setName('channel').setDescription('روم لوحة اللوبي').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('setup-tempvoice').setDescription('تنصيب الرومات الصوتية المؤقتة').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption(o => o.setName('join_channel').setDescription('Join To Create').setRequired(true).addChannelTypes(ChannelType.GuildVoice)).addChannelOption(o => o.setName('category').setDescription('كاتيجوري اختياري').addChannelTypes(ChannelType.GuildCategory))
].map(c => c.toJSON());

function inviteLink() {
  return `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
}

async function registerForGuild(guild) {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
  console.log(`Slash commands registered for guild: ${guild.name} (${guild.id})`);
}

async function registerCommands() {
  console.log(`Bot is in ${client.guilds.cache.size} guild(s): ${client.guilds.cache.map(g => `${g.name}=${g.id}`).join(', ') || 'none'}`);
  console.log(`Invite with commands scope: ${inviteLink()}`);

  let registered = false;
  if (GUILD_ID) {
    const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (guild) {
      try {
        await registerForGuild(guild);
        registered = true;
      } catch (error) {
        console.error(`Failed to register for GUILD_ID ${GUILD_ID}. Falling back to all joined guilds:`, error?.rawError || error);
      }
    } else {
      console.warn(`GUILD_ID ${GUILD_ID} was not found in bot guilds. Registering commands for all joined guilds instead.`);
    }
  }

  if (!registered) {
    for (const guild of client.guilds.cache.values()) {
      try {
        await registerForGuild(guild);
      } catch (error) {
        console.error(`Failed to register commands for ${guild?.name || guild?.id || 'unknown guild'}:`, error?.rawError || error);
      }
    }
  }

  if (!client.guilds.cache.size) console.warn('No guilds found. Invite the bot to your server first.');
}

function ticketPanel(guild) {
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎫 نظام التذاكر').setDescription('اختر نوع التذكرة من القائمة.').addFields({ name: '🚨 شكوى', value: 'للمشاكل والبلاغات', inline: true }, { name: '💡 اقتراح', value: 'لأفكار التطوير', inline: true }, { name: '💎 الاشتراكات', value: 'طلبات الاشتراك', inline: true }).setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('اختر نوع التذكرة').addOptions(Object.entries(ticketTypes).map(([value, t]) => ({ label: t.label, value, emoji: t.emoji, description: t.desc }))))]
  };
}

function lobbyPanel(guild) {
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎮 Game Lobby System').setDescription('Create Lobby لفتح لوبي خاص أو Find Lobby للبحث عن لوبي موجود.').addFields({ name: '➕ Create Lobby', value: 'اختار اللعبة واكتب الآيدي.', inline: true }, { name: '🔎 Find Lobby', value: 'يعرض اللوبيات والحالة والعدد.', inline: true }).setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lobby_create').setLabel('Create Lobby').setEmoji('➕').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('lobby_find').setLabel('Find Lobby').setEmoji('🔎').setStyle(ButtonStyle.Primary))]
  };
}

function gameMenu(id) { return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('اختر اللعبة').addOptions(Object.entries(games).map(([value, g]) => ({ label: g.label, value, emoji: g.emoji, description: 'سيطلب منك ' + g.id }))))]; }
function idModal(prefix, game) { const g = games[game]; return new ModalBuilder().setCustomId(prefix + ':' + game).setTitle(g.label + ' - ' + g.id).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_id').setLabel('اكتب ' + g.id).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }
function status(l) { if (!l.open) return ['🔒', 'مغلق']; if (l.members.length >= l.max) return ['🔴', 'ممتلئ']; return ['🟢', 'مفتوح']; }
function lobbyEmbed(l, guild) { const g = games[l.game]; const [e, s] = status(l); return new EmbedBuilder().setColor(l.open ? COLOR : 0xef4444).setTitle(g.emoji + ' ' + g.label + ' Lobby').setDescription('أزرار التحكم للمالك فقط. طلبات الدخول تصل هنا.').addFields({ name: '👑 المالك', value: '<@' + l.owner + '>', inline: true }, { name: '🆔 ' + g.id, value: '`' + l.ownerGameId + '`', inline: true }, { name: e + ' الحالة', value: s, inline: true }, { name: '👥 العدد', value: l.members.length + '/' + l.max, inline: true }, { name: '🔊 VC', value: l.voice ? '<#' + l.voice + '>' : 'غير موجود', inline: true }, { name: '🎮 اللعبة', value: g.label, inline: true }).setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined }).setTimestamp(); }
function lobbyButtons(id) { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lob_open:' + id).setLabel('Open Room').setEmoji('🔓').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('lob_close:' + id).setLabel('Close Room').setEmoji('🔒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('lob_leave:' + id).setLabel('Leave Room').setEmoji('🚪').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('lob_delete:' + id).setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lob_limit:' + id).setLabel('Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('lob_transfer:' + id).setLabel('Transfer Owner').setEmoji('👑').setStyle(ButtonStyle.Secondary))]; }
function tempButtons(id) { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tmp_open:' + id).setLabel('Open').setEmoji('🔓').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('tmp_close:' + id).setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tmp_limit:' + id).setLabel('Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tmp_name:' + id).setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tmp_delete:' + id).setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tmp_transfer:' + id).setLabel('Transfer Owner').setEmoji('👑').setStyle(ButtonStyle.Primary))]; }
function limitModal(prefix, id) { return new ModalBuilder().setCustomId(prefix + '_limit_modal:' + id).setTitle('تحديد عدد الأشخاص').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit').setLabel('اكتب رقم من 1 إلى 99').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2))); }
function nameModal(id) { return new ModalBuilder().setCustomId('tmp_name_modal:' + id).setTitle('تغيير اسم الروم').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80))); }

async function refreshLobby(guild, l) { const ch = await guild.channels.fetch(l.text).catch(() => null); if (!ch) return; const p = { embeds: [lobbyEmbed(l, guild)], components: lobbyButtons(l.id) }; const msg = l.message ? await ch.messages.fetch(l.message).catch(() => null) : null; if (msg) await msg.edit(p); else { const m = await ch.send(p); l.message = m.id; save(); } }
async function makeLobby(guild, member, game, gameId) { let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🎮 Game Lobbies'); if (!cat) cat = await guild.channels.create({ name: '🎮 Game Lobbies', type: ChannelType.GuildCategory }).catch(() => null); const ow = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }, { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] }]; const text = await guild.channels.create({ name: 'lobby-' + clean(games[game].label + '-' + member.user.username), type: ChannelType.GuildText, parent: cat?.id, permissionOverwrites: ow }); const voice = await guild.channels.create({ name: '🔊 ' + games[game].label + ' | ' + member.user.username, type: ChannelType.GuildVoice, parent: cat?.id, userLimit: 5, permissionOverwrites: ow }); const id = Date.now() + '' + Math.floor(Math.random() * 1000); const l = { id, guild: guild.id, owner: member.id, game, ownerGameId: gameId, text: text.id, voice: voice.id, open: true, max: 5, members: [member.id], message: null }; store.lobbies[id] = l; save(); const m = await text.send({ content: '<@' + member.id + '>', embeds: [lobbyEmbed(l, guild)], components: lobbyButtons(id) }); l.message = m.id; save(); if (member.voice.channel) await member.voice.setChannel(voice).catch(() => null); return l; }
async function deleteLobby(guild, l) { delete store.lobbies[l.id]; save(); const t = await guild.channels.fetch(l.text).catch(() => null); const v = await guild.channels.fetch(l.voice).catch(() => null); await t?.delete('Lobby deleted').catch(() => null); await v?.delete('Lobby deleted').catch(() => null); }

client.once(Events.ClientReady, async () => { console.log('Logged in as ' + client.user.tag); await registerCommands(); });
client.on(Events.GuildCreate, async guild => { console.log(`Joined guild: ${guild.name} (${guild.id})`); await registerForGuild(guild).catch(error => console.error('GuildCreate register failed:', error?.rawError || error)); });

client.on(Events.MessageCreate, async msg => {
  try {
    if (!msg.guild || msg.author.bot) return;
    const content = msg.content.trim();
    if (!content.startsWith('!')) return;
    const [cmd, ...args] = content.slice(1).split(/\s+/);
    const name = cmd.toLowerCase();
    if (name === 'ping') return msg.reply('🏓 Pong — البوت يستقبل رسائل عادي.');
    if (name === 'help') return msg.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🛠️ أوامر التجربة').setDescription('لو أوامر السلاش ما ظهرت، استخدم هذي مؤقتًا.').addFields({ name: 'اختبار', value: '`!ping` `!botstatus`' }, { name: 'Setup سريع', value: '`!setup-ticket` `!setup-lobby` `!setup-tempvoice #voice`' }, { name: 'Slash', value: '`/ping` `/help` `/setup-ticket` `/setup-lobby` `/setup-tempvoice`' })] });
    if (name === 'botstatus') { const me = msg.guild.members.me; return msg.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🤖 Bot Status').addFields({ name: 'Bot', value: client.user.tag, inline: true }, { name: 'Guild ID', value: msg.guild.id, inline: true }, { name: 'GUILD_ID env', value: GUILD_ID || 'غير محدد', inline: true }, { name: 'Admin Permission', value: me?.permissions.has(PermissionFlagsBits.Administrator) ? '✅ نعم' : '❌ لا', inline: true }, { name: 'Invite Link', value: inviteLink() })] }); }
    if (name === 'setup-ticket') { if (!canManage(msg.member)) return msg.reply('❌ تحتاج صلاحية Manage Channels.'); cfg(msg.guild.id).ticketPanel = msg.channel.id; save(); await msg.channel.send(ticketPanel(msg.guild)); return msg.reply('✅ تم تنصيب التكت في هذا الروم.'); }
    if (name === 'setup-lobby') { if (!canManage(msg.member)) return msg.reply('❌ تحتاج صلاحية Manage Channels.'); cfg(msg.guild.id).lobbyPanel = msg.channel.id; save(); await msg.channel.send(lobbyPanel(msg.guild)); return msg.reply('✅ تم تنصيب اللوبي في هذا الروم.'); }
    if (name === 'setup-tempvoice') { if (!isAdmin(msg.member)) return msg.reply('❌ تحتاج صلاحية Manage Server أو Administrator.'); const mentioned = msg.mentions.channels.first(); const channelId = mentioned?.id || msg.member?.voice?.channelId; if (!channelId) return msg.reply('اكتب `!setup-tempvoice #voice-channel` أو ادخل روم صوتي واكتب الأمر.'); const join = await msg.guild.channels.fetch(channelId).catch(() => null); if (!join || join.type !== ChannelType.GuildVoice) return msg.reply('❌ لازم تختار روم صوتي.'); const c = cfg(msg.guild.id); c.tempJoin = join.id; c.tempCategory = join.parentId || null; save(); return msg.reply(`✅ تم تنصيب الرومات المؤقتة على ${join.name}`); }
    if (name === 'clear') { if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) return msg.reply('❌ تحتاج صلاحية Manage Messages.'); const amount = Number(args[0]); if (!Number.isInteger(amount) || amount < 1 || amount > 100) return msg.reply('استخدم: `!clear 10`'); await msg.channel.bulkDelete(amount, true); return msg.channel.send(`✅ تم مسح ${amount} رسالة.`).then(m => setTimeout(() => m.delete().catch(() => null), 4000)); }
  } catch (error) { console.error('Message command failed:', error); return msg.reply('❌ صار خطأ: ' + error.message).catch(() => null); }
});

client.on(Events.InteractionCreate, async i => { try {
  if (!i.guild) return;
  console.log(`Interaction received by ${i.user.tag}`);
  if (i.isChatInputCommand()) {
    const n = i.commandName;
    if (n === 'ping') return rep(i, { content: '🏓 Pong', ephemeral: true });
    if (n === 'help') return rep(i, { ephemeral: true, embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🛠️ Help').setDescription('أوامر إدارة + تكت + لوبيات + رومات مؤقتة.').addFields({ name: 'Admin', value: '`/ban` `/kick` `/timeout` `/clear`' }, { name: 'Setup', value: '`/setup-ticket` `/setup-lobby` `/setup-tempvoice`' }, { name: 'Fallback', value: '`!ping` `!help` `!botstatus`' })] });
    if (n === 'ban') { const u = i.options.getUser('user', true); await i.guild.members.ban(u.id, { reason: i.options.getString('reason') || 'No reason' }); return rep(i, { content: '✅ تم حظر ' + u.tag, ephemeral: true }); }
    if (n === 'kick') { const m = i.options.getMember('user'); if (!m) return rep(i, { content: '❌ العضو غير موجود', ephemeral: true }); await m.kick(i.options.getString('reason') || 'No reason'); return rep(i, { content: '✅ تم طرد ' + m.user.tag, ephemeral: true }); }
    if (n === 'timeout') { const m = i.options.getMember('user'); if (!m) return rep(i, { content: '❌ العضو غير موجود', ephemeral: true }); const min = i.options.getInteger('minutes', true); await m.timeout(min * 60000, i.options.getString('reason') || 'No reason'); return rep(i, { content: '✅ تم إعطاء تايم آوت ' + min + ' دقيقة', ephemeral: true }); }
    if (n === 'clear') { const a = i.options.getInteger('amount', true); const d = await i.channel.bulkDelete(a, true); return rep(i, { content: '✅ تم مسح ' + d.size + ' رسالة', ephemeral: true }); }
    if (n === 'setup-ticket') { const ch = i.options.getChannel('channel', true); cfg(i.guild.id).ticketPanel = ch.id; save(); await ch.send(ticketPanel(i.guild)); return rep(i, { content: '✅ تم تنصيب التكت في ' + ch, ephemeral: true }); }
    if (n === 'setup-lobby') { const ch = i.options.getChannel('channel', true); cfg(i.guild.id).lobbyPanel = ch.id; save(); await ch.send(lobbyPanel(i.guild)); return rep(i, { content: '✅ تم تنصيب اللوبي في ' + ch, ephemeral: true }); }
    if (n === 'setup-tempvoice') { const join = i.options.getChannel('join_channel', true); const cat = i.options.getChannel('category'); const c = cfg(i.guild.id); c.tempJoin = join.id; c.tempCategory = cat?.id || join.parentId || null; save(); return rep(i, { content: '✅ تم تنصيب الرومات المؤقتة على ' + join, ephemeral: true }); }
  }
  if (i.isStringSelectMenu()) {
    if (i.customId === 'ticket_select') { const type = i.values[0], t = ticketTypes[type]; let cat = i.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '🎫 Tickets'); if (!cat) cat = await i.guild.channels.create({ name: '🎫 Tickets', type: ChannelType.GuildCategory }).catch(() => null); const ch = await i.guild.channels.create({ name: 'ticket-' + type + '-' + i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, ''), type: ChannelType.GuildText, parent: cat?.id, permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }] }); store.tickets[ch.id] = { owner: i.user.id, type, guild: i.guild.id }; save(); await ch.send({ content: '<@' + i.user.id + '>', embeds: [new EmbedBuilder().setColor(COLOR).setTitle(t.emoji + ' ' + t.label).setDescription(t.desc).addFields({ name: 'صاحب التذكرة', value: '<@' + i.user.id + '>' })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger))] }); return rep(i, { content: '✅ تم فتح التذكرة: ' + ch, ephemeral: true }); }
    if (i.customId === 'lobby_game_create') return i.showModal(idModal('lobby_create_modal', i.values[0]));
    if (i.customId === 'lobby_pick') { const l = store.lobbies[i.values[0]]; if (!l) return rep(i, { content: '❌ اللوبي غير موجود', ephemeral: true }); return i.showModal(idModal('lobby_request_modal:' + l.id, l.game)); }
  }
  if (i.isButton()) {
    if (i.customId === 'ticket_close') { const d = store.tickets[i.channelId]; if (!d) return rep(i, { content: '❌ ليست تذكرة', ephemeral: true }); if (i.user.id !== d.owner && !canManage(i.member)) return rep(i, { content: '❌ لا تملك صلاحية', ephemeral: true }); delete store.tickets[i.channelId]; save(); await i.reply({ content: '🔒 سيتم حذف التذكرة خلال 5 ثواني' }); return setTimeout(() => i.channel?.delete('Ticket closed').catch(() => null), 5000); }
    if (i.customId === 'lobby_create') return rep(i, { content: 'اختر اللعبة:', components: gameMenu('lobby_game_create'), ephemeral: true });
    if (i.customId === 'lobby_find') { const ls = Object.values(store.lobbies).filter(l => l.guild === i.guild.id); if (!ls.length) return rep(i, { content: 'لا يوجد لوبيات حالياً', ephemeral: true }); return rep(i, { content: 'اختر اللوبي:', ephemeral: true, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('lobby_pick').setPlaceholder('اختر لوبي').addOptions(ls.slice(0, 25).map(l => { const [e, s] = status(l); return { label: games[l.game].label + ' ' + l.members.length + '/' + l.max, value: l.id, emoji: e, description: s + ' | Owner ' + (i.guild.members.cache.get(l.owner)?.user.username || l.owner) }; })))] }); }
    const [a, id] = i.customId.split(':'); const l = store.lobbies[id], tr = store.tempRooms[id];
    if (a?.startsWith('lob_')) { if (!l) return rep(i, { content: '❌ اللوبي غير موجود', ephemeral: true }); if (a !== 'lob_leave' && i.user.id !== l.owner) return rep(i, { content: '❌ فقط المالك', ephemeral: true }); const text = await i.guild.channels.fetch(l.text).catch(() => null); const voice = await i.guild.channels.fetch(l.voice).catch(() => null); if (a === 'lob_open') { l.open = true; save(); await refreshLobby(i.guild, l); return rep(i, { content: '🔓 تم الفتح', ephemeral: true }); } if (a === 'lob_close') { l.open = false; save(); await refreshLobby(i.guild, l); return rep(i, { content: '🔒 تم القفل', ephemeral: true }); } if (a === 'lob_delete') { await rep(i, { content: '🗑️ تم الحذف', ephemeral: true }); return deleteLobby(i.guild, l); } if (a === 'lob_limit') return i.showModal(limitModal('lob', id)); if (a === 'lob_transfer') return rep(i, { content: 'اختر المالك الجديد:', ephemeral: true, components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('lob_transfer_select:' + id).setPlaceholder('اختر عضو').setMinValues(1).setMaxValues(1))] }); if (a === 'lob_leave') { l.members = l.members.filter(x => x !== i.user.id); await text?.permissionOverwrites.edit(i.user.id, { ViewChannel: false }).catch(() => null); await voice?.permissionOverwrites.edit(i.user.id, { Connect: false }).catch(() => null); if (i.user.id === l.owner && l.members.length) l.owner = l.members[0]; if (!l.members.length) { await rep(i, { content: 'تم الخروج وحذف اللوبي لأنه فارغ', ephemeral: true }); return deleteLobby(i.guild, l); } save(); await refreshLobby(i.guild, l); return rep(i, { content: '🚪 خرجت من اللوبي', ephemeral: true }); } }
    if (a?.startsWith('tmp_')) { if (!tr) return rep(i, { content: '❌ الروم غير موجود', ephemeral: true }); if (i.user.id !== tr.owner) return rep(i, { content: '❌ فقط المالك', ephemeral: true }); const ch = await i.guild.channels.fetch(tr.voice).catch(() => null); if (!ch) return rep(i, { content: '❌ الروم غير موجود', ephemeral: true }); if (a === 'tmp_open') { await ch.permissionOverwrites.edit(i.guild.roles.everyone.id, { Connect: true }).catch(() => null); return rep(i, { content: '🔓 تم فتح الروم', ephemeral: true }); } if (a === 'tmp_close') { await ch.permissionOverwrites.edit(i.guild.roles.everyone.id, { Connect: false }).catch(() => null); return rep(i, { content: '🔒 تم قفل الروم', ephemeral: true }); } if (a === 'tmp_limit') return i.showModal(limitModal('tmp', id)); if (a === 'tmp_name') return i.showModal(nameModal(id)); if (a === 'tmp_delete') { delete store.tempRooms[id]; save(); await rep(i, { content: '🗑️ تم حذف الروم', ephemeral: true }); return ch.delete('Temp deleted').catch(() => null); } if (a === 'tmp_transfer') return rep(i, { content: 'اختر المالك الجديد:', ephemeral: true, components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('tmp_transfer_select:' + id).setPlaceholder('اختر عضو').setMinValues(1).setMaxValues(1))] }); }
    if (a === 'join_accept' || a === 'join_reject') { const r = pending.get(id); if (!r) return rep(i, { content: 'انتهى الطلب', ephemeral: true }); const l = store.lobbies[r.lobby]; if (!l || i.user.id !== l.owner) return rep(i, { content: 'فقط مالك اللوبي', ephemeral: true }); pending.delete(id); if (a === 'join_reject') return i.update({ content: '❌ تم رفض <@' + r.user + '>', embeds: [], components: [] }); if (!l.open || l.members.length >= l.max) return i.update({ content: '❌ اللوبي مغلق أو ممتلئ', embeds: [], components: [] }); if (!l.members.includes(r.user)) l.members.push(r.user); save(); const text = await i.guild.channels.fetch(l.text).catch(() => null); const voice = await i.guild.channels.fetch(l.voice).catch(() => null); await text?.permissionOverwrites.edit(r.user, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null); await voice?.permissionOverwrites.edit(r.user, { ViewChannel: true, Connect: true, Speak: true }).catch(() => null); const m = await i.guild.members.fetch(r.user).catch(() => null); if (m?.voice?.channel && voice) await m.voice.setChannel(voice).catch(() => null); await refreshLobby(i.guild, l); return i.update({ content: '✅ تم قبول <@' + r.user + '>', embeds: [], components: [] }); }
  }
  if (i.isUserSelectMenu()) { const [k, id] = i.customId.split(':'); const u = i.values[0]; if (k === 'lob_transfer_select') { const l = store.lobbies[id]; if (!l || l.owner !== i.user.id) return rep(i, { content: '❌ لا تملك الصلاحية', ephemeral: true }); if (!l.members.includes(u)) l.members.push(u); l.owner = u; save(); await refreshLobby(i.guild, l); return i.update({ content: '👑 تم نقل الملكية إلى <@' + u + '>', components: [] }); } if (k === 'tmp_transfer_select') { const t = store.tempRooms[id]; if (!t || t.owner !== i.user.id) return rep(i, { content: '❌ لا تملك الصلاحية', ephemeral: true }); t.owner = u; save(); return i.update({ content: '👑 تم نقل الملكية إلى <@' + u + '>', components: [] }); } }
  if (i.isModalSubmit()) { const p = i.customId.split(':'); if (p[0] === 'lobby_create_modal') { await i.deferReply({ ephemeral: true }); const l = await makeLobby(i.guild, i.member, p[1], i.fields.getTextInputValue('game_id')); return i.editReply('✅ تم إنشاء اللوبي: <#' + l.text + '> | VC: <#' + l.voice + '>'); } if (p[0] === 'lobby_request_modal') { const l = store.lobbies[p[1]]; if (!l) return rep(i, { content: '❌ اللوبي غير موجود', ephemeral: true }); if (!l.open || l.members.length >= l.max) return rep(i, { content: '❌ اللوبي مغلق أو ممتلئ', ephemeral: true }); const req = Date.now() + '' + Math.floor(Math.random() * 1000); pending.set(req, { lobby: l.id, user: i.user.id, gameId: i.fields.getTextInputValue('game_id') }); const ch = await i.guild.channels.fetch(l.text).catch(() => null); await ch?.send({ content: '<@' + l.owner + '>', embeds: [new EmbedBuilder().setColor(COLOR).setTitle('📥 طلب دخول للّوبي').addFields({ name: 'العضو', value: '<@' + i.user.id + '>', inline: true }, { name: games[l.game].id, value: '`' + i.fields.getTextInputValue('game_id') + '`', inline: true }, { name: 'اللعبة', value: games[l.game].label, inline: true })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_accept:' + req).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('join_reject:' + req).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger))] }); return rep(i, { content: '✅ تم إرسال طلبك لمالك اللوبي', ephemeral: true }); } if (p[0] === 'lob_limit_modal') { const l = store.lobbies[p[1]], n = Number(i.fields.getTextInputValue('limit')); if (!l || l.owner !== i.user.id) return rep(i, { content: '❌ لا تملك الصلاحية', ephemeral: true }); if (!Number.isInteger(n) || n < 1 || n > 99) return rep(i, { content: 'اكتب رقم 1-99', ephemeral: true }); l.max = n; const v = await i.guild.channels.fetch(l.voice).catch(() => null); await v?.setUserLimit(n).catch(() => null); save(); await refreshLobby(i.guild, l); return rep(i, { content: '✅ تم تغيير الحد إلى ' + n, ephemeral: true }); } if (p[0] === 'tmp_limit_modal') { const t = store.tempRooms[p[1]], n = Number(i.fields.getTextInputValue('limit')); if (!t || t.owner !== i.user.id) return rep(i, { content: '❌ لا تملك الصلاحية', ephemeral: true }); if (!Number.isInteger(n) || n < 1 || n > 99) return rep(i, { content: 'اكتب رقم 1-99', ephemeral: true }); const ch = await i.guild.channels.fetch(t.voice).catch(() => null); await ch?.setUserLimit(n).catch(() => null); t.limit = n; save(); return rep(i, { content: '✅ تم تغيير الحد إلى ' + n, ephemeral: true }); } if (p[0] === 'tmp_name_modal') { const t = store.tempRooms[p[1]]; if (!t || t.owner !== i.user.id) return rep(i, { content: '❌ لا تملك الصلاحية', ephemeral: true }); const name = clean(i.fields.getTextInputValue('name')); const ch = await i.guild.channels.fetch(t.voice).catch(() => null); await ch?.setName(name).catch(() => null); return rep(i, { content: '✅ تم تغيير الاسم إلى ' + name, ephemeral: true }); } }
} catch (e) { console.error(e); return rep(i, { content: '❌ صار خطأ: ' + e.message, ephemeral: true }); } });

client.on(Events.VoiceStateUpdate, async (oldState, newState) => { try { const c = cfg(newState.guild.id); if (newState.channelId === c.tempJoin) { const m = newState.member; const id = Date.now() + '' + Math.floor(Math.random() * 1000); const v = await newState.guild.channels.create({ name: '🔊 ' + m.user.username, type: ChannelType.GuildVoice, parent: c.tempCategory || newState.channel?.parentId || null, userLimit: 5, permissionOverwrites: [{ id: newState.guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }, { id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream] }, { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] }] }); store.tempRooms[id] = { id, guild: newState.guild.id, owner: m.id, voice: v.id, limit: 5 }; save(); await m.voice.setChannel(v).catch(() => null); } const left = oldState.channelId; if (!left) return; const r = Object.values(store.tempRooms).find(x => x.voice === left); if (!r) return; const ch = await oldState.guild.channels.fetch(left).catch(() => null); if (ch && ch.members.size === 0) { delete store.tempRooms[r.id]; save(); await ch.delete('Empty temp room').catch(() => null); } } catch (e) { console.error('voice', e); } });

client.login(TOKEN);
