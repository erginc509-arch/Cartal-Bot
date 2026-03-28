const { 
    Client, GatewayIntentBits, Partials, EmbedBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelType, PermissionFlagsBits, Events, ActivityType,
    REST, Routes, SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const http = require('http');
const url = require('url');
const querystring = require('querystring');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💾 DATABASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DB_FILE = './cartel_data.json';
const CONFIG_FILE = './config.json';

function defaultGuild() {
    return {
        ayarlar: {
            prefix: "c!", modLog: "", hgKanal: "", otoRol: "",
            oneriKanal: "", sikayetKanal: "", ticketRoller: [],
            kufurEngel: false, reklamEngel: false, capsEngel: false,
            linkEngel: false, saAs: false, guardAktif: false,
            banLimit: 5, kickLimit: 5, kanalSilLimit: 3, rolSilLimit: 3,
            emojiRoller: {}, uyeSayac: "", botSayac: "", toplamSayac: ""
        },
        kayit: { kanal: "", erkekRol: "", kizRol: "", kayitsizRol: "" },
        ekonomi: {}, market: [],
        veriler: { uyari: {}, kayitSayi: {}, afk: {}, snipe: {}, tetikleyici: {} }
    };
}

let dbRoot = {};
if (fs.existsSync(DB_FILE)) {
    try { dbRoot = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch(e) { console.log("DB bozuk, sifirlanıyor..."); dbRoot = {}; }
}
const saveAll = () => fs.writeFileSync(DB_FILE, JSON.stringify(dbRoot, null, 2));

function getGuildDB(guildId) {
    if (!dbRoot[guildId]) { dbRoot[guildId] = defaultGuild(); saveAll(); }
    const g = dbRoot[guildId];
    if (!g.ayarlar.ticketRoller) g.ayarlar.ticketRoller = [];
    if (!g.ayarlar.emojiRoller)  g.ayarlar.emojiRoller = {};
    if (!g.veriler.snipe)         g.veriler.snipe = {};
    if (!g.veriler.afk)           g.veriler.afk = {};
    if (!g.veriler.tetikleyici)   g.veriler.tetikleyici = {};
    if (!g.market)                g.market = [];
    return g;
}
function saveGuild() { saveAll(); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔊 SES ODASI CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch { return {}; }
}
function saveConfig(data) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2)); }
let voiceConfig = loadConfig();
const userRooms = new Map(); // userId -> { voiceChannel, controlMessage }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🤖 CLIENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction]
});

const guardSayac = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔊 SES ODASI PANELİ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildVoicePanel(member, channel) {
    const embed = new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle(`🎧 ${member.user.username}'in Özel Odası`)
        .setDescription('Butonları kullanarak odanı yönet.')
        .addFields(
            { name: '📛 Oda Adı', value: channel.name, inline: true },
            { name: '👥 Limit', value: channel.userLimit === 0 ? 'Limitsiz' : `${channel.userLimit} kişi`, inline: true },
        )
        .setFooter({ text: 'CARTEL | Odadan çıkınca oda otomatik silinir.' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oda_kilitle').setLabel('🔒 Kilitle').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('oda_ac').setLabel('🔓 Kilidi Aç').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('oda_gizle').setLabel('👁️ Gizle').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('oda_goster').setLabel('👁️ Göster').setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oda_limit_2').setLabel('👤 2').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('oda_limit_5').setLabel('👥 5').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('oda_limit_10').setLabel('👥 10').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('oda_limit_0').setLabel('♾️ Limitsiz').setStyle(ButtonStyle.Primary),
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔊 SES ODASI OLAYLARI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const hubChannelId = voiceConfig.hubChannelId;
    const controlTextChannelId = voiceConfig.controlTextChannelId;

    // Hub kanalına girdi → özel oda aç
    if (newState.channelId && newState.channelId === hubChannelId) {
        const member = newState.member;
        const guild = newState.guild;
        const hubChannel = guild.channels.cache.get(hubChannelId);
        if (!hubChannel) return;

        try {
            const privateRoom = await guild.channels.create({
                name: `🎧 ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: hubChannel.parentId,
                userLimit: 0,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.MoveMembers,
                            PermissionFlagsBits.MuteMembers,
                            PermissionFlagsBits.DeafenMembers,
                        ],
                    },
                ],
            });

            await member.voice.setChannel(privateRoom);

            let controlMessage = null;
            if (controlTextChannelId) {
                const textChannel = guild.channels.cache.get(controlTextChannelId);
                if (textChannel) {
                    controlMessage = await textChannel.send({
                        content: `<@${member.id}> odanı buradan yönetebilirsin:`,
                        ...buildVoicePanel(member, privateRoom),
                    });
                }
            }

            userRooms.set(member.id, { voiceChannel: privateRoom, controlMessage });
            console.log(`✅ ${member.user.username} için oda oluşturuldu: ${privateRoom.name}`);
        } catch (err) {
            console.error('Oda oluşturma hatası:', err.message);
        }
        return;
    }

    // Kanaldan çıkış → oda sahibi kontrolü
    if (oldState.channelId && oldState.channelId !== hubChannelId) {
        const leftChannel = oldState.channel;
        if (!leftChannel) return;
        
        // Bu kanal birinin özel odası mı?
        let roomOwner = null;
        for (const [uid, data] of userRooms.entries()) {
            if (data.voiceChannel && data.voiceChannel.id === leftChannel.id) {
                roomOwner = uid;
                break;
            }
        }
        if (!roomOwner) return; // Özel oda değilse dokunma

        // Oda TAMAMEN boş mu?
        if (leftChannel.members.size === 0) {
            const data = userRooms.get(roomOwner);
            if (data?.controlMessage) {
                await data.controlMessage.delete().catch(() => {});
            }
            userRooms.delete(roomOwner);
            await leftChannel.delete().catch(() => {});
            console.log(`🗑️ Boş oda silindi: ${leftChannel.name}`);
        }
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 SLASH KOMUTLAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const slashKomutlar = [
    new SlashCommandBuilder().setName('sil').setDescription('Mesajları temizler').addIntegerOption(o => o.setName('miktar').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
    new SlashCommandBuilder().setName('ban').setDescription('Kullanıcıyı banlar').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('unban').setDescription('Banı kaldırır').addStringOption(o => o.setName('id').setDescription('Kullanıcı ID').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('Kullanıcıyı atar').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('timeout').setDescription('Kullanıcıyı susturur').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addIntegerOption(o => o.setName('sure').setDescription('Saniye').setRequired(true).setMinValue(1).setMaxValue(2419200)),
    new SlashCommandBuilder().setName('yavasmod').setDescription('Yavaş mod').addIntegerOption(o => o.setName('saniye').setDescription('0=kapat').setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder().setName('kilit').setDescription('Kanalı kilitler'),
    new SlashCommandBuilder().setName('kilit-ac').setDescription('Kanal kilidini açar'),
    new SlashCommandBuilder().setName('rol-ver').setDescription('Rol verir').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('rol-al').setDescription('Rol alır').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('uyar').setDescription('Uyarı verir').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('uyarilar').setDescription('Uyarıları listeler').addUserOption(o => o.setName('kullanici').setDescription('Kişi')),
    new SlashCommandBuilder().setName('sicil-temizle').setDescription('Uyarıları siler').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)),
    new SlashCommandBuilder().setName('kayit-kanal').setDescription('Kayıt kanalı').addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(true)),
    new SlashCommandBuilder().setName('kayit-rol').setDescription('Kayıt rolü').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('alinacak-rol').setDescription('Kayıtsız rol').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('erkek').setDescription('Erkek kayıt').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('isim').setDescription('İsim')).addStringOption(o => o.setName('yas').setDescription('Yaş')),
    new SlashCommandBuilder().setName('kadin').setDescription('Kadın kayıt').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('isim').setDescription('İsim')).addStringOption(o => o.setName('yas').setDescription('Yaş')),
    new SlashCommandBuilder().setName('kayit-sayi').setDescription('Kayıt sayısı'),
    new SlashCommandBuilder().setName('reklam-engel').setDescription('Reklam engel').addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({name:'Aç',value:'ac'},{name:'Kapat',value:'kapat'})),
    new SlashCommandBuilder().setName('kufur-engel').setDescription('Küfür engel').addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({name:'Aç',value:'ac'},{name:'Kapat',value:'kapat'})),
    new SlashCommandBuilder().setName('caps-engel').setDescription('Caps engel').addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({name:'Aç',value:'ac'},{name:'Kapat',value:'kapat'})),
    new SlashCommandBuilder().setName('link-engel').setDescription('Link engel').addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({name:'Aç',value:'ac'},{name:'Kapat',value:'kapat'})),
    new SlashCommandBuilder().setName('sa-as').setDescription('Sa-As sistemi').addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({name:'Aç',value:'ac'},{name:'Kapat',value:'kapat'})),
    new SlashCommandBuilder().setName('mod-log').setDescription('Mod log kanalı').addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(true)),
    new SlashCommandBuilder().setName('otorol').setDescription('Oto rol').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('giris-cikis').setDescription('Giriş-çıkış kanalı').addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(true)),
    new SlashCommandBuilder().setName('guard').setDescription('Sunucu koruma sistemi').addStringOption(o => o.setName('durum').setDescription('ac/kapat').setRequired(true).addChoices({name:'Aç',value:'ac'},{name:'Kapat',value:'kapat'})),
    new SlashCommandBuilder().setName('emoji-rol-kur').setDescription('Emoji rol mesajı oluşturur').addStringOption(o => o.setName('baslik').setDescription('Başlık').setRequired(true)),
    new SlashCommandBuilder().setName('emoji-rol-ekle').setDescription('Emoji-rol bağlantısı ekler').addStringOption(o => o.setName('mesaj-id').setDescription('Mesaj ID').setRequired(true)).addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true)).addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)),
    new SlashCommandBuilder().setName('sayac-kur').setDescription('Üye sayaç kanalı kurar').addStringOption(o => o.setName('tip').setDescription('Tip').setRequired(true).addChoices({name:'Üye',value:'uye'},{name:'Bot',value:'bot'},{name:'Toplam',value:'toplam'})),
    new SlashCommandBuilder().setName('ping').setDescription('Ping'),
    new SlashCommandBuilder().setName('istatistik').setDescription('Bot istatistikleri'),
    new SlashCommandBuilder().setName('sunucu-bilgi').setDescription('Sunucu bilgisi'),
    new SlashCommandBuilder().setName('profil').setDescription('Profil').addUserOption(o => o.setName('kullanici').setDescription('Kişi')),
    new SlashCommandBuilder().setName('avatar').setDescription('Avatar').addUserOption(o => o.setName('kullanici').setDescription('Kişi')),
    new SlashCommandBuilder().setName('roller').setDescription('Roller'),
    new SlashCommandBuilder().setName('afk').setDescription('AFK modu').addStringOption(o => o.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('cekilis').setDescription('Çekiliş').addIntegerOption(o => o.setName('sure').setDescription('Saniye').setRequired(true).setMinValue(5)).addIntegerOption(o => o.setName('kazanan').setDescription('Kazanan sayısı').setRequired(true).setMinValue(1)).addStringOption(o => o.setName('odul').setDescription('Ödül').setRequired(true)),
    new SlashCommandBuilder().setName('anket').setDescription('Anket').addStringOption(o => o.setName('baslik').setDescription('Soru').setRequired(true)),
    new SlashCommandBuilder().setName('snipe').setDescription('Son silinen mesaj'),
    new SlashCommandBuilder().setName('oneri').setDescription('Öneri gönder').addStringOption(o => o.setName('mesaj').setDescription('Öneri').setRequired(true)),
    new SlashCommandBuilder().setName('oneri-kanal').setDescription('Öneri kanalı').addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(true)),
    new SlashCommandBuilder().setName('sikayet').setDescription('Şikayet gönder').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(true)),
    new SlashCommandBuilder().setName('yazi-tura').setDescription('Yazı tura'),
    new SlashCommandBuilder().setName('duello').setDescription('Düello').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)),
    new SlashCommandBuilder().setName('espri').setDescription('Soğuk espri'),
    new SlashCommandBuilder().setName('sahte-mesaj').setDescription('Sahte mesaj').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addStringOption(o => o.setName('mesaj').setDescription('Mesaj').setRequired(true)),
    new SlashCommandBuilder().setName('ask-olcer').setDescription('Aşk ölçer').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)),
    new SlashCommandBuilder().setName('hiz-yazi').setDescription('Hız yazma oyunu').addStringOption(o => o.setName('kelime').setDescription('Yazılacak kelime').setRequired(true)).addIntegerOption(o => o.setName('sure').setDescription('Saniye').setMinValue(5).setMaxValue(60)),
    new SlashCommandBuilder().setName('gunluk').setDescription('Günlük para'),
    new SlashCommandBuilder().setName('para').setDescription('Bakiye').addUserOption(o => o.setName('kullanici').setDescription('Kişi')),
    new SlashCommandBuilder().setName('gonder').setDescription('Para gönder').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)).addIntegerOption(o => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('market').setDescription('Market'),
    new SlashCommandBuilder().setName('market-ekle').setDescription('Markete ürün ekle').addStringOption(o => o.setName('isim').setDescription('İsim').setRequired(true)).addIntegerOption(o => o.setName('fiyat').setDescription('Fiyat').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('ticket-kur').setDescription('Ticket sistemi'),
    new SlashCommandBuilder().setName('ticket-rol').setDescription('Ticket yetkili rolleri').addStringOption(o => o.setName('islem').setDescription('İşlem').setRequired(true).addChoices({name:'Ekle',value:'ekle'},{name:'Sil',value:'sil'},{name:'Listele',value:'liste'})).addRoleOption(o => o.setName('rol').setDescription('Rol')),
    new SlashCommandBuilder().setName('rol-kur').setDescription('Rolleri otomatik kurar'),
    new SlashCommandBuilder().setName('tetikleyici-ekle').setDescription('Otomatik yanıt ekler').addStringOption(o => o.setName('tetik').setDescription('Tetiklenecek kelime').setRequired(true)).addStringOption(o => o.setName('yanit').setDescription('Bot yanıtı').setRequired(true)),
    new SlashCommandBuilder().setName('tetikleyici-sil').setDescription('Tetikleyiciyi siler').addStringOption(o => o.setName('tetik').setDescription('Kelime').setRequired(true)),
    new SlashCommandBuilder().setName('tetikleyiciler').setDescription('Tüm tetikleyiciler'),
    new SlashCommandBuilder().setName('ses').setDescription('Özel oda sistemini kurar'),
    new SlashCommandBuilder().setName('oda-isim').setDescription('Odanın adını değiştirir').addStringOption(o => o.setName('isim').setDescription('Yeni isim').setRequired(true)),
    new SlashCommandBuilder().setName('oda-at').setDescription('Odadan birini atar').addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true)),
    new SlashCommandBuilder().setName('yardim').setDescription('Yardım menüsü'),
].map(c => c.toJSON());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ BOT HAZIR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on(Events.ClientReady, async () => {
    console.log(`✅ ${bot.user.tag} aktif!`);
    bot.user.setActivity('c!yardim | CARTEL', { type: ActivityType.Watching });
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(bot.user.id), { body: slashKomutlar });
        console.log(`✅ ${slashKomutlar.length} slash komut kaydedildi!`);
    } catch(e) { console.error('Slash kayıt hatası:', e.message); }
    setInterval(() => guncelSayac(), 10 * 60 * 1000);
    console.log(`📋 Ses hub kanalı: ${voiceConfig.hubChannelId || 'Ayarlanmamış - c!ses yaz'}`);
});

async function guncelSayac() {
    for (const [guildId, guild] of bot.guilds.cache) {
        const db = getGuildDB(guildId);
        await guild.members.fetch().catch(() => {});
        const uyeSayi = guild.members.cache.filter(m => !m.user.bot).size;
        const botSayi = guild.members.cache.filter(m => m.user.bot).size;
        if (db.ayarlar.uyeSayac) { const ch = guild.channels.cache.get(db.ayarlar.uyeSayac); if (ch) ch.setName(`👥 Üyeler: ${uyeSayi}`).catch(() => {}); }
        if (db.ayarlar.botSayac) { const ch = guild.channels.cache.get(db.ayarlar.botSayac); if (ch) ch.setName(`🤖 Botlar: ${botSayi}`).catch(() => {}); }
        if (db.ayarlar.toplamSayac) { const ch = guild.channels.cache.get(db.ayarlar.toplamSayac); if (ch) ch.setName(`📊 Toplam: ${guild.memberCount}`).catch(() => {}); }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 ANA KOMUT FONKSİYONU
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function handleKomut(cmd, args, ctx) {
    const { reply, author, guild, member, channel } = ctx;
    const db = getGuildDB(guild.id);
    const save = () => saveGuild();
    const log = (msg) => { const lk = guild.channels.cache.get(db.ayarlar.modLog); if (lk) lk.send(msg); };

    // ── SES ODASI KOMUTLARI ──
    if (cmd === 'ses') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const category = await guild.channels.create({ name: '🔊 Özel Odalar', type: ChannelType.GuildCategory });
        const hubChannel = await guild.channels.create({ name: '➕ Oda Oluştur', type: ChannelType.GuildVoice, parent: category.id });
        const textChannel = await guild.channels.create({ name: '🎛️oda-kontrol', type: ChannelType.GuildText, parent: category.id });
        voiceConfig.hubChannelId = hubChannel.id;
        voiceConfig.controlTextChannelId = textChannel.id;
        saveConfig(voiceConfig);
        console.log(`✅ Hub kanalı ayarlandı: ${hubChannel.id}`);
        return reply(`✅ Hazır! <#${hubChannel.id}> kanalına gir, otomatik özel oda açılacak. Kontrol paneli: <#${textChannel.id}>`);
    }

    if (cmd === 'oda-isim') {
        const data = userRooms.get(author.id);
        if (!data || !data.voiceChannel) return reply('❌ Aktif bir özel odanız yok.');
        const newName = args.isim || (Array.isArray(args) ? args.join(' ') : '');
        if (!newName) return reply('❌ İsim belirtin.');
        await data.voiceChannel.setName(newName);
        return reply(`✅ Oda adı **${newName}** olarak değiştirildi.`);
    }

    if (cmd === 'oda-at') {
        const data = userRooms.get(author.id);
        if (!data || !data.voiceChannel) return reply('❌ Aktif bir özel odanız yok.');
        const target = args.kullanici;
        if (!target) return reply('❌ Bir kullanıcı etiketleyin.');
        const targetMember = target.roles ? target : await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return reply('❌ Kullanıcı bulunamadı.');
        if (targetMember.voice.channelId === data.voiceChannel.id) {
            await targetMember.voice.disconnect();
            return reply(`✅ **${targetMember.user.username}** odadan atıldı.`);
        }
        return reply('❌ O kullanıcı odanızda değil.');
    }

    // ── MODERASYON ──
    if (cmd === 'sil') {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return reply("❌ Yetkin yok.");
        const n = parseInt(args.miktar || args[0]);
        if (!n) return reply("1-100 arası sayı gir.");
        await channel.bulkDelete(n + (ctx.isSlash ? 0 : 1), true).catch(() => {});
        const b = await channel.send(`🧹 **${n}** mesaj silindi.`);
        setTimeout(() => b.delete().catch(() => {}), 3000);
        if (ctx.isSlash) reply({ content: `🧹 **${n}** mesaj silindi.`, ephemeral: true });
    }
    else if (cmd === 'ban') {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return reply("❌ Yetkin yok.");
        const user = args.kullanici; if (!user) return reply("Kimi banlıyoruz?");
        const sebep = args.sebep || "Sebep belirtilmedi.";
        await user.ban({ reason: sebep }).catch(() => {});
        reply(`🔨 **${user.user?.tag || user.tag}** banlandı. Sebep: ${sebep}`);
        log(`🔨 **Ban:** ${user.user?.tag || user.tag} | Yetkili: ${author.tag} | Sebep: ${sebep}`);
    }
    else if (cmd === 'unban') {
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return reply("❌ Yetkin yok.");
        const id = args.id || args[0]; if (!id) return reply("ID gir.");
        await guild.members.unban(id).catch(() => {});
        reply(`✅ **${id}** banı kaldırıldı.`);
    }
    else if (cmd === 'kick') {
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return reply("❌ Yetkin yok.");
        const user = args.kullanici; if (!user) return reply("Kimi kickliyoruz?");
        const sebep = args.sebep || "Sebep belirtilmedi.";
        await user.kick(sebep).catch(() => {});
        reply(`👟 **${user.user?.tag || user.tag}** kicklendi.`);
        log(`👟 **Kick:** ${user.user?.tag || user.tag} | Yetkili: ${author.tag}`);
    }
    else if (cmd === 'timeout') {
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return reply("❌ Yetkin yok.");
        const user = args.kullanici; if (!user) return reply("Kimi susturuyoruz?");
        const sure = args.sure || parseInt(args[1]) || 60;
        await user.timeout(sure * 1000).catch(() => {});
        reply(`⏱️ **${user.user?.tag || user.tag}** ${sure} saniye susturuldu.`);
        log(`⏱️ **Timeout:** ${user.user?.tag || user.tag} | ${sure}s | Yetkili: ${author.tag}`);
    }
    else if (cmd === 'yavasmod') {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return reply("❌ Yetkin yok.");
        const s = args.saniye ?? parseInt(args[0]) ?? 0;
        await channel.setRateLimitPerUser(s).catch(() => {});
        reply(s === 0 ? "✅ Yavaş mod kapatıldı." : `✅ Yavaş mod: **${s}** saniye.`);
    }
    else if (cmd === 'kilit') {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return reply("❌ Yetkin yok.");
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
        reply("🔒 Kanal kilitlendi.");
    }
    else if (cmd === 'kilit-ac') {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return reply("❌ Yetkin yok.");
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: true }).catch(() => {});
        reply("🔓 Kanal açıldı.");
    }
    else if (cmd === 'rol-ver') {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return reply("❌ Yetkin yok.");
        const user = args.kullanici; const rol = args.rol;
        if (!user || !rol) return reply("Kullanım: `c!rol-ver @kişi @rol`");
        await user.roles.add(rol).catch(() => {});
        reply(`✅ **${user.user?.tag || user.tag}** → **${rol.name}** verildi.`);
    }
    else if (cmd === 'rol-al') {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return reply("❌ Yetkin yok.");
        const user = args.kullanici; const rol = args.rol;
        if (!user || !rol) return reply("Kullanım: `c!rol-al @kişi @rol`");
        await user.roles.remove(rol).catch(() => {});
        reply(`✅ **${user.user?.tag || user.tag}** → **${rol.name}** alındı.`);
    }
    else if (cmd === 'uyar') {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return reply("❌ Yetkin yok.");
        const user = args.kullanici?.user || args.kullanici; if (!user) return reply("Kimi uyarıyoruz?");
        const sebep = args.sebep || "Sebep belirtilmedi.";
        if (!db.veriler.uyari[user.id]) db.veriler.uyari[user.id] = [];
        db.veriler.uyari[user.id].push({ sebep, tarih: new Date().toLocaleString("tr-TR") }); save();
        reply(`⚠️ **${user.tag}** uyarıldı. (Toplam: **${db.veriler.uyari[user.id].length}**)`);
        log(`⚠️ **Uyarı:** ${user.tag} | Yetkili: ${author.tag} | Sebep: ${sebep}`);
    }
    else if (cmd === 'uyarilar') {
        const user = args.kullanici?.user || args.kullanici || author;
        const liste = db.veriler.uyari[user.id];
        if (!liste?.length) return reply(`✅ **${user.tag}** hiç uyarı almamış.`);
        const emb = new EmbedBuilder().setTitle(`⚠️ ${user.tag} Uyarıları`).setColor("Orange")
            .setDescription(liste.map((u,i) => `**${i+1}.** ${u.sebep} — *${u.tarih}*`).join("\n"));
        reply({ embeds: [emb] });
    }
    else if (cmd === 'sicil-temizle') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const user = args.kullanici?.user || args.kullanici; if (!user) return reply("Kimi temizliyoruz?");
        db.veriler.uyari[user.id] = []; save();
        reply(`✅ **${user.tag}** sicili temizlendi.`);
    }
    else if (cmd === 'kayit-kanal') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const k = args.kanal; if (!k) return reply("Kanal belirt.");
        db.kayit.kanal = k.id; save(); reply(`✅ Kayıt kanalı: ${k}`);
    }
    else if (cmd === 'kayit-rol') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const r = args.rol; if (!r) return reply("Rol belirt.");
        db.kayit.erkekRol = r.id; save(); reply(`✅ Kayıt rolü: ${r}`);
    }
    else if (cmd === 'alinacak-rol') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const r = args.rol; if (!r) return reply("Rol belirt.");
        db.kayit.kayitsizRol = r.id; save(); reply(`✅ Alınacak rol: ${r}`);
    }
    else if (cmd === 'erkek' || cmd === 'kadin') {
        if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return reply("❌ Yetkin yok.");
        const hedef = args.kullanici; if (!hedef) return reply("Kullanıcı belirt.");
        const isim = args.isim || hedef.user?.username || hedef.username;
        const yas = args.yas || "?";
        const rolId = cmd === 'erkek' ? db.kayit.erkekRol : db.kayit.kizRol;
        if (rolId) await hedef.roles.add(rolId).catch(() => {});
        if (db.kayit.kayitsizRol) await hedef.roles.remove(db.kayit.kayitsizRol).catch(() => {});
        await hedef.setNickname(`${isim} | ${yas}`).catch(() => {});
        if (!db.veriler.kayitSayi[author.id]) db.veriler.kayitSayi[author.id] = 0;
        db.veriler.kayitSayi[author.id]++; save();
        const emb = new EmbedBuilder().setTitle("✅ Kayıt Başarılı").setColor(cmd === 'erkek' ? "Blue" : "Pink")
            .addFields(
                { name: "👤 Üye", value: `${hedef}`, inline: true },
                { name: "📝 İsim", value: isim, inline: true },
                { name: "🎂 Yaş", value: String(yas), inline: true },
                { name: "🏷️ Cinsiyet", value: cmd === 'erkek' ? "Erkek" : "Kadın", inline: true },
                { name: "👮 Yetkili", value: `${author}`, inline: true }
            );
        reply({ embeds: [emb] });
        const kk = guild.channels.cache.get(db.kayit.kanal);
        if (kk) kk.send({ embeds: [emb] });
    }
    else if (cmd === 'kayit-sayi') {
        reply(`📊 **${author.tag}** toplamda **${db.veriler.kayitSayi[author.id] || 0}** kişi kayıt etti.`);
    }
    else if (cmd === 'reklam-engel') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        db.ayarlar.reklamEngel = (args.durum || args[0]) === 'ac'; save();
        reply(`🔗 Reklam engel: **${db.ayarlar.reklamEngel ? "AÇIK ✅" : "KAPALI ❌"}**`);
    }
    else if (cmd === 'kufur-engel') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        db.ayarlar.kufurEngel = (args.durum || args[0]) === 'ac'; save();
        reply(`🤬 Küfür engel: **${db.ayarlar.kufurEngel ? "AÇIK ✅" : "KAPALI ❌"}**`);
    }
    else if (cmd === 'caps-engel') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        db.ayarlar.capsEngel = (args.durum || args[0]) === 'ac'; save();
        reply(`🔠 Caps engel: **${db.ayarlar.capsEngel ? "AÇIK ✅" : "KAPALI ❌"}**`);
    }
    else if (cmd === 'link-engel') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        db.ayarlar.linkEngel = (args.durum || args[0]) === 'ac'; save();
        reply(`🔗 Link engel: **${db.ayarlar.linkEngel ? "AÇIK ✅" : "KAPALI ❌"}**`);
    }
    else if (cmd === 'sa-as') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        db.ayarlar.saAs = (args.durum || args[0]) === 'ac'; save();
        reply(`👋 Sa-As: **${db.ayarlar.saAs ? "AÇIK ✅" : "KAPALI ❌"}**`);
    }
    else if (cmd === 'mod-log') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const k = args.kanal; if (!k) return reply("Kanal belirt.");
        db.ayarlar.modLog = k.id; save(); reply(`✅ Mod log: ${k}`);
    }
    else if (cmd === 'otorol') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const r = args.rol; if (!r) return reply("Rol belirt.");
        db.ayarlar.otoRol = r.id; save(); reply(`✅ Oto rol: ${r}`);
    }
    else if (cmd === 'giris-cikis') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const k = args.kanal; if (!k) return reply("Kanal belirt.");
        db.ayarlar.hgKanal = k.id; save(); reply(`✅ Giriş-Çıkış: ${k}`);
    }
    else if (cmd === 'guard') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        db.ayarlar.guardAktif = (args.durum || args[0]) === 'ac'; save();
        reply(`🛡️ Guard: **${db.ayarlar.guardAktif ? "AÇIK ✅" : "KAPALI ❌"}**`);
    }
    else if (cmd === 'emoji-rol-kur') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const baslik = args.baslik || (Array.isArray(args) ? args.join(" ") : "Emoji Rol");
        const emb = new EmbedBuilder().setTitle("🎭 " + baslik).setDescription("Aşağıdaki emojilere tıklayarak rol alabilirsin!").setColor("Purple");
        if (ctx.isSlash) await reply({ content: "✅ Emoji rol mesajı gönderildi!", ephemeral: true });
        const m = await channel.send({ embeds: [emb] });
        if (!db.ayarlar.emojiRoller[m.id]) db.ayarlar.emojiRoller[m.id] = {};
        save();
        if (!ctx.isSlash) reply(`✅ ID: \`${m.id}\``);
    }
    else if (cmd === 'emoji-rol-ekle') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const mesajId = args['mesaj-id'] || args[0];
        const emoji = args.emoji || args[1];
        const rol = args.rol;
        if (!mesajId || !emoji || !rol) return reply("Kullanım: `c!emoji-rol-ekle [mesajID] [emoji] @rol`");
        if (!db.ayarlar.emojiRoller[mesajId]) db.ayarlar.emojiRoller[mesajId] = {};
        db.ayarlar.emojiRoller[mesajId][emoji] = rol.id; save();
        const hm = await channel.messages.fetch(mesajId).catch(() => null);
        if (hm) await hm.react(emoji).catch(() => {});
        reply(`✅ **${emoji}** → **${rol.name}** eklendi.`);
    }
    else if (cmd === 'sayac-kur') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const tip = args.tip || args[0];
        await guild.members.fetch().catch(() => {});
        const uyeSayi = guild.members.cache.filter(m => !m.user.bot).size;
        const botSayi = guild.members.cache.filter(m => m.user.bot).size;
        let isim = "", veriAlan = "";
        if (tip === 'uye') { isim = `👥 Üyeler: ${uyeSayi}`; veriAlan = 'uyeSayac'; }
        else if (tip === 'bot') { isim = `🤖 Botlar: ${botSayi}`; veriAlan = 'botSayac'; }
        else { isim = `📊 Toplam: ${guild.memberCount}`; veriAlan = 'toplamSayac'; }
        const ch = await guild.channels.create({ name: isim, type: ChannelType.GuildVoice, permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }] }).catch(() => null);
        if (!ch) return reply("❌ Kanal oluşturulamadı.");
        db.ayarlar[veriAlan] = ch.id; save();
        reply(`✅ **${tip}** sayaç kanalı oluşturuldu.`);
    }
    else if (cmd === 'ping') { reply(`🏓 Pong! **${bot.ws.ping}ms**`); }
    else if (cmd === 'istatistik') {
        const emb = new EmbedBuilder().setTitle("📊 CARTEL İstatistikleri").setColor(0xdc2626)
            .addFields(
                { name: "🏓 Ping", value: `${bot.ws.ping}ms`, inline: true },
                { name: "💾 RAM", value: `${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB`, inline: true },
                { name: "🖥️ Sunucu", value: `${bot.guilds.cache.size}`, inline: true },
                { name: "👥 Kullanıcı", value: `${bot.users.cache.size}`, inline: true },
                { name: "⏱️ Uptime", value: `${Math.floor(process.uptime()/60)} dk`, inline: true },
                { name: "📦 Node.js", value: process.version, inline: true }
            ).setThumbnail(bot.user.displayAvatarURL());
        reply({ embeds: [emb] });
    }
    else if (cmd === 'sunucu-bilgi') {
        const g = guild;
        const emb = new EmbedBuilder().setTitle(`📋 ${g.name}`).setColor("Green").setThumbnail(g.iconURL())
            .addFields(
                { name: "👑 Sahip", value: `<@${g.ownerId}>`, inline: true },
                { name: "👥 Üye", value: `${g.memberCount}`, inline: true },
                { name: "📅 Kuruluş", value: g.createdAt.toLocaleDateString("tr-TR"), inline: true },
                { name: "💬 Kanal", value: `${g.channels.cache.size}`, inline: true },
                { name: "🎭 Rol", value: `${g.roles.cache.size}`, inline: true },
                { name: "🆔 ID", value: g.id, inline: true }
            );
        reply({ embeds: [emb] });
    }
    else if (cmd === 'profil') {
        const hedef = args.kullanici || member;
        const u = hedef.user || hedef;
        const m = hedef.roles ? hedef : guild.members.cache.get(u.id);
        const emb = new EmbedBuilder().setTitle(`👤 ${u.tag}`).setColor("Blurple").setThumbnail(u.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: "🆔 ID", value: u.id, inline: true },
                { name: "📅 Hesap", value: u.createdAt.toLocaleDateString("tr-TR"), inline: true },
                { name: "📥 Katılım", value: m?.joinedAt?.toLocaleDateString("tr-TR") || "?", inline: true },
                { name: "🎭 Roller", value: m?.roles.cache.filter(r => r.id !== guild.id).map(r => `${r}`).join(", ") || "Yok" }
            );
        reply({ embeds: [emb] });
    }
    else if (cmd === 'avatar') {
        const u = args.kullanici?.user || args.kullanici || author;
        const emb = new EmbedBuilder().setTitle(`🖼️ ${u.tag}`).setImage(u.displayAvatarURL({ size: 1024 })).setColor("Blurple");
        reply({ embeds: [emb] });
    }
    else if (cmd === 'roller') {
        const roller = guild.roles.cache.filter(r => r.id !== guild.id).sort((a,b) => b.position - a.position);
        const emb = new EmbedBuilder().setTitle(`🎭 ${guild.name} Rolleri (${roller.size})`).setColor("Purple")
            .setDescription(roller.map(r => `${r}`).join(", ") || "Yok.");
        reply({ embeds: [emb] });
    }
    else if (cmd === 'afk') {
        const sebep = args.sebep || (Array.isArray(args) ? args.join(" ") : "") || "Sebep belirtilmedi.";
        db.veriler.afk[author.id] = { sebep, tarih: new Date().toLocaleString("tr-TR") };
        save(); reply(`💤 AFK moduna girdin. Sebep: **${sebep}**`);
    }
    else if (cmd === 'cekilis') {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return reply("❌ Yetkin yok.");
        const sure = args.sure || parseInt(args[0]) || 60;
        const kazSayi = args.kazanan || parseInt(args[1]) || 1;
        const odul = args.odul || (Array.isArray(args) ? args.slice(2).join(" ") : "") || "Belirtilmedi";
        const emb = new EmbedBuilder().setTitle("🎉 ÇEKİLİŞ!").setColor("Gold")
            .setDescription(`**Ödül:** ${odul}\n**Kazanan:** ${kazSayi} kişi\n**Süre:** ${sure}s\n\n🎉 Butona bas katıl!`)
            .setTimestamp(Date.now() + sure * 1000);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cekilis_katil').setLabel('🎉 Katıl').setStyle(ButtonStyle.Success));
        if (ctx.isSlash) await reply({ content: "✅ Çekiliş başlatıldı!", ephemeral: true });
        const cm = await channel.send({ embeds: [emb], components: [row] });
        const katilimcilar = new Set();
        const col = cm.createMessageComponentCollector({ time: sure * 1000 });
        col.on('collect', i => { katilimcilar.add(i.user.id); i.reply({ content: `✅ Katıldın! (${katilimcilar.size})`, ephemeral: true }); });
        col.on('end', () => {
            const liste = [...katilimcilar];
            if (!liste.length) return cm.edit({ embeds: [new EmbedBuilder().setTitle("🎉 Çekiliş Bitti").setDescription("Kimse katılmadı!").setColor("Red")], components: [] });
            const kopya = [...liste]; const kazananlar = [];
            for (let i = 0; i < Math.min(kazSayi, kopya.length); i++) kazananlar.push(`<@${kopya.splice(Math.floor(Math.random()*kopya.length),1)[0]}>`);
            cm.edit({ embeds: [new EmbedBuilder().setTitle("🎉 Çekiliş Bitti!").setColor("Gold").setDescription(`**Ödül:** ${odul}\n**Kazanan(lar):** ${kazananlar.join(", ")}`)], components: [] });
            channel.send(`🎊 Tebrikler ${kazananlar.join(", ")}! **${odul}** kazandınız!`);
        });
    }
    else if (cmd === 'anket') {
        const baslik = args.baslik || (Array.isArray(args) ? args.join(" ") : "");
        if (!baslik) return reply("Başlık gir.");
        const emb = new EmbedBuilder().setTitle("📊 ANKET").setDescription(baslik).setColor("Blue").setFooter({ text: `Soruyu soran: ${author.tag}` });
        const am = await channel.send({ embeds: [emb] });
        await am.react("✅"); await am.react("❌");
        if (ctx.isSlash) reply({ content: "✅ Anket oluşturuldu!", ephemeral: true });
    }
    else if (cmd === 'snipe') {
        const v = db.veriler.snipe[channel.id];
        if (!v) return reply("Bu kanalda yakalanmış mesaj yok.");
        const emb = new EmbedBuilder().setTitle("👻 Son Silinen Mesaj").setDescription(v.content).setColor("Red").setFooter({ text: `${v.author} | ${v.tarih}` });
        if (v.avatar) emb.setThumbnail(v.avatar);
        reply({ embeds: [emb] });
    }
    else if (cmd === 'oneri') {
        const mesaj = args.mesaj || (Array.isArray(args) ? args.join(" ") : "");
        if (!mesaj) return reply("Öneri yaz.");
        const oneriKanal = guild.channels.cache.get(db.ayarlar.oneriKanal);
        if (!oneriKanal) return reply("Öneri kanalı ayarlanmamış! `c!oneri-kanal #kanal`");
        const emb = new EmbedBuilder().setTitle("💡 Yeni Öneri").setDescription(mesaj).setColor("Yellow").setFooter({ text: `Öneri sahibi: ${author.tag}` }).setTimestamp();
        const m = await oneriKanal.send({ embeds: [emb] });
        await m.react("✅"); await m.react("❌");
        reply(ctx.isSlash ? { content: "✅ Önerin iletildi!", ephemeral: true } : "✅ Önerin iletildi!");
    }
    else if (cmd === 'oneri-kanal') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const k = args.kanal; if (!k) return reply("Kanal belirt.");
        db.ayarlar.oneriKanal = k.id; save(); reply(`✅ Öneri kanalı: ${k}`);
    }
    else if (cmd === 'sikayet') {
        const user = args.kullanici?.user || args.kullanici;
        const sebep = args.sebep || (Array.isArray(args) ? args.slice(1).join(" ") : "");
        if (!user || !sebep) return reply("Kullanım: `c!sikayet @kişi [sebep]`");
        const sikKanal = guild.channels.cache.get(db.ayarlar.sikayetKanal || db.ayarlar.modLog);
        if (!sikKanal) return reply("Şikayet kanalı ayarlanmamış!");
        const emb = new EmbedBuilder().setTitle("🚨 Yeni Şikayet").setColor("Red")
            .addFields({ name: "🎯 Şikayet Edilen", value: `${user.tag} (${user.id})`, inline: true }, { name: "📝 Sebep", value: sebep }, { name: "👤 Şikayetçi", value: author.tag, inline: true }).setTimestamp();
        await sikKanal.send({ embeds: [emb] });
        reply(ctx.isSlash ? { content: "✅ Şikayetin iletildi.", ephemeral: true } : "✅ Şikayetin iletildi.");
    }
    else if (cmd === 'yazi-tura') { reply(`Attım... **${Math.random() < 0.5 ? "🪙 YAZI" : "👑 TURA"}!**`); }
    else if (cmd === 'duello') {
        const hedef = args.kullanici; if (!hedef) return reply("Kimi düelloya çağırıyorsun?");
        const hedefUser = hedef.user || hedef;
        const kazanan = Math.random() < 0.5 ? author : hedefUser;
        const kaybeden = kazanan.id === author.id ? hedefUser : author;
        const emb = new EmbedBuilder().setTitle("⚔️ DÜELLO").setColor("Red").setDescription(`${author} **VS** ${hedef}\n\n🏆 **Kazanan:** <@${kazanan.id}>\n💀 **Kaybeden:** <@${kaybeden.id}>`).setTimestamp();
        ctx.isSlash ? reply({ embeds: [emb] }) : channel.send({ embeds: [emb] });
    }
    else if (cmd === 'espri') {
        const espriler = ["Neden balıklar internete girmez? Ağdan korktukları için! 🐟","Matematik kitabı neden üzgündü? Çok fazla problemi vardı! 📚","Duvar neden güldü? Çünkü kapı açıkken gördü! 🚪","Biyolog neden kötü arkadaş? Her şeyi hücreye alıyor! 🔬","Pasta neden okula gitmedi? Hamur işi olduğu için! 🍰"];
        reply(espriler[Math.floor(Math.random() * espriler.length)]);
    }
    else if (cmd === 'sahte-mesaj') {
        const hedefUser = args.kullanici?.user || args.kullanici;
        const mesaj = args.mesaj || (Array.isArray(args) ? args.slice(1).join(" ") : "");
        if (!hedefUser || !mesaj) return reply("Kullanım: `c!sahte-mesaj @kişi [mesaj]`");
        const emb = new EmbedBuilder().setAuthor({ name: hedefUser.tag || hedefUser.username, iconURL: hedefUser.displayAvatarURL() }).setDescription(mesaj).setColor("Dark").setFooter({ text: "Bu mesaj sahtedir!" }).setTimestamp();
        if (ctx.isSlash) reply({ content: "✅", ephemeral: true });
        channel.send({ embeds: [emb] });
    }
    else if (cmd === 'ask-olcer') {
        const hedef = args.kullanici?.user || args.kullanici; if (!hedef) return reply("Kişi belirt.");
        const yuzde = Math.floor(Math.random() * 101);
        const bar = "█".repeat(Math.floor(yuzde / 10)) + "░".repeat(10 - Math.floor(yuzde / 10));
        const emb = new EmbedBuilder().setTitle("💕 Aşk Ölçer").setColor(yuzde > 70 ? "Red" : yuzde > 40 ? "Orange" : "Grey")
            .setDescription(`**${author.tag}** ile **${hedef.tag || hedef.username}** arasındaki aşk:\n\n\`${bar}\` **%${yuzde}**\n\n${yuzde > 80 ? "💖 Mükemmel uyum!" : yuzde > 60 ? "💛 İyi gidiyorsunuz!" : yuzde > 40 ? "🤔 Ortalama..." : "💔 Pek uyumlu değiller!"}`).setFooter({ text: "Tamamen rastgele! 🎲" });
        reply({ embeds: [emb] });
    }
    else if (cmd === 'hiz-yazi') {
        const kelime = args.kelime || args[0]; const sure = args.sure || parseInt(args[1]) || 15;
        if (!kelime) return reply("Kelime gir.");
        const emb = new EmbedBuilder().setTitle("⌨️ HIZ YAZMA!").setDescription(`Aşağıdaki kelimeyi **${sure} saniye** içinde yaz:\n\n> **${kelime}**`).setColor("Blue").setFooter({ text: `Süre: ${sure} saniye` });
        if (ctx.isSlash) await reply({ content: "✅ Oyun başladı!", ephemeral: true });
        await channel.send({ embeds: [emb] });
        const col = channel.createMessageCollector({ filter: m => m.content.toLowerCase() === kelime.toLowerCase(), max: 1, time: sure * 1000 });
        col.on('collect', m => { channel.send({ embeds: [new EmbedBuilder().setTitle("🏆 KAZANDI!").setColor("Green").setDescription(`**${m.author.tag}** kazandı! Kelime: **${kelime}**`)] }); });
        col.on('end', c => { if (!c.size) channel.send(`⏰ Süre doldu! Kimse **${kelime}** yazamadı.`); });
    }
    else if (cmd === 'gunluk') {
        const simdi = Date.now();
        if (!db.ekonomi[author.id] || typeof db.ekonomi[author.id] === 'number')
            db.ekonomi[author.id] = { bakiye: typeof db.ekonomi[author.id] === 'number' ? db.ekonomi[author.id] : 0, sonGunluk: 0 };
        const kalan = db.ekonomi[author.id].sonGunluk + 86400000 - simdi;
        if (kalan > 0) { const s = Math.floor(kalan/3600000); const d = Math.floor((kalan%3600000)/60000); return reply(`⏰ Günlüğünü aldın! **${s}s ${d}dk** sonra tekrar al.`); }
        const para = Math.floor(Math.random() * 500) + 100;
        db.ekonomi[author.id].bakiye += para; db.ekonomi[author.id].sonGunluk = simdi; save();
        reply(`💵 **${para}₺** günlük aldın! Toplam: **${db.ekonomi[author.id].bakiye}₺**`);
    }
    else if (cmd === 'para') {
        const u = args.kullanici?.user || args.kullanici || author;
        const v = db.ekonomi[u.id];
        reply(`💳 **${u.tag}** bakiyesi: **${typeof v === 'object' ? (v?.bakiye||0) : (v||0)}₺**`);
    }
    else if (cmd === 'gonder') {
        const hedef = args.kullanici?.user || args.kullanici; const miktar = args.miktar || parseInt(args[1]);
        if (!hedef || !miktar) return reply("Kullanım: `c!gonder @kişi [miktar]`");
        if (!db.ekonomi[author.id] || typeof db.ekonomi[author.id]==='number') db.ekonomi[author.id]={bakiye:typeof db.ekonomi[author.id]==='number'?db.ekonomi[author.id]:0,sonGunluk:0};
        if (!db.ekonomi[hedef.id] || typeof db.ekonomi[hedef.id]==='number') db.ekonomi[hedef.id]={bakiye:typeof db.ekonomi[hedef.id]==='number'?db.ekonomi[hedef.id]:0,sonGunluk:0};
        if (db.ekonomi[author.id].bakiye < miktar) return reply(`❌ Yetersiz bakiye! Sende: **${db.ekonomi[author.id].bakiye}₺**`);
        db.ekonomi[author.id].bakiye -= miktar; db.ekonomi[hedef.id].bakiye += miktar; save();
        reply(`✅ **${hedef.tag}** kullanıcısına **${miktar}₺** gönderildi!`);
    }
    else if (cmd === 'market') {
        if (!db.market.length) return reply("🏪 Market boş.");
        const emb = new EmbedBuilder().setTitle("🏪 MARKET").setColor("Green").setDescription(db.market.map((u,i)=>`**${i+1}.** ${u.isim} — **${u.fiyat}₺**`).join("\n"));
        reply({ embeds: [emb] });
    }
    else if (cmd === 'market-ekle') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const isim = args.isim || args[0]; const fiyat = args.fiyat || parseInt(args[1]);
        if (!isim || !fiyat) return reply("Kullanım: `c!market-ekle [isim] [fiyat]`");
        db.market.push({ isim, fiyat }); save(); reply(`✅ **${isim}** markete eklendi. Fiyat: **${fiyat}₺**`);
    }
    else if (cmd === 'tetikleyici-ekle') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const tetik = args.tetik || args[0]; const yanit = args.yanit || (Array.isArray(args) ? args.slice(1).join(" ") : "");
        if (!tetik || !yanit) return reply("Kullanım: `c!tetikleyici-ekle [kelime] [yanıt]`");
        db.veriler.tetikleyici[tetik.toLowerCase()] = yanit; save();
        reply(`✅ Tetikleyici eklendi: \`${tetik}\` → ${yanit}`);
    }
    else if (cmd === 'tetikleyici-sil') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const tetik = args.tetik || args[0];
        if (!tetik || !db.veriler.tetikleyici[tetik.toLowerCase()]) return reply("Bu tetikleyici bulunamadı.");
        delete db.veriler.tetikleyici[tetik.toLowerCase()]; save(); reply(`✅ **${tetik}** tetikleyicisi silindi.`);
    }
    else if (cmd === 'tetikleyiciler') {
        const liste = Object.entries(db.veriler.tetikleyici);
        if (!liste.length) return reply("📋 Hiç tetikleyici yok.");
        const emb = new EmbedBuilder().setTitle("🔁 Tetikleyiciler").setColor("Blue").setDescription(liste.map(([t,y])=>`\`${t}\` → ${y}`).join("\n"));
        reply({ embeds: [emb] });
    }
    else if (cmd === 'ticket-rol') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const islem = args.islem || args[0]; const rol = args.rol;
        if (!islem || islem === 'liste') {
            if (!db.ayarlar.ticketRoller.length) return reply("📋 Henüz ticket yetkili rolü yok.");
            const emb = new EmbedBuilder().setTitle("🎫 Ticket Yetkili Rolleri").setColor("Blue").setDescription(db.ayarlar.ticketRoller.map(id=>`<@&${id}>`).join("\n"));
            return reply({ embeds: [emb] });
        }
        if (!rol) return reply("Rolü belirt.");
        if (islem === 'ekle') { if (db.ayarlar.ticketRoller.includes(rol.id)) return reply(`⚠️ Zaten ekli.`); db.ayarlar.ticketRoller.push(rol.id); save(); reply(`✅ **${rol.name}** eklendi.`); }
        else if (islem === 'sil') { const idx = db.ayarlar.ticketRoller.indexOf(rol.id); if (idx===-1) return reply(`⚠️ Listede yok.`); db.ayarlar.ticketRoller.splice(idx,1); save(); reply(`✅ **${rol.name}** silindi.`); }
    }
    else if (cmd === 'ticket-kur') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        const emb = new EmbedBuilder().setTitle("🎫 Destek Sistemi").setDescription("Aşağıdaki butona bas, sana özel destek kanalı açalım.").setColor("Blue");
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_ac').setLabel('🎫 Ticket Aç').setStyle(ButtonStyle.Primary));
        await channel.send({ embeds: [emb], components: [row] });
        reply(ctx.isSlash ? { content: "✅ Ticket sistemi kuruldu.", ephemeral: true } : "✅ Ticket sistemi kuruldu.");
    }
    else if (cmd === 'rol-kur') {
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) return reply("❌ Yetkin yok.");
        await reply(ctx.isSlash ? { content: "⏳ Roller kuruluyor...", ephemeral: false } : "⏳ Roller kuruluyor...");
        const rolTanimlari = [
            { isim: "Owner", renk: "#FF0000", hoist: true, izinler: [PermissionFlagsBits.Administrator] },
            { isim: "Co-Owner", renk: "#FF6000", hoist: true, izinler: [PermissionFlagsBits.Administrator] },
            { isim: "Admin", renk: "#FF4500", hoist: true, izinler: [PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.BanMembers,PermissionFlagsBits.KickMembers,PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ViewAuditLog,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks] },
            { isim: "Moderator", renk: "#E67E22", hoist: true, izinler: [PermissionFlagsBits.BanMembers,PermissionFlagsBits.KickMembers,PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.ViewAuditLog,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks] },
            { isim: "Helper", renk: "#F1C40F", hoist: false, izinler: [PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks] },
            { isim: "Member", renk: "#95A5A6", hoist: false, izinler: [PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.AddReactions] },
            { isim: "Unverified", renk: "#7F8C8D", hoist: false, izinler: [] },
        ];
        const olusturulan = [], guncellenen = [];
        for (const tanim of rolTanimlari) {
            const mevcutRol = guild.roles.cache.find(r => r.name === tanim.isim);
            if (mevcutRol) { await mevcutRol.edit({ color: tanim.renk, permissions: tanim.izinler, hoist: tanim.hoist }).catch(() => {}); guncellenen.push(tanim.isim); }
            else { await guild.roles.create({ name: tanim.isim, color: tanim.renk, permissions: tanim.izinler, hoist: tanim.hoist, reason: "rol-kur" }).catch(() => {}); olusturulan.push(tanim.isim); }
        }
        const emb = new EmbedBuilder().setTitle("✅ Rol Kurulumu Tamamlandı!").setColor("Green")
            .addFields({ name: "✨ Oluşturulan", value: `${olusturulan.length} rol`, inline: true }, { name: "🔄 Güncellenen", value: `${guncellenen.length} rol`, inline: true });
        channel.send({ embeds: [emb] });
    }
    else if (cmd === 'yardim' || cmd === 'yardım') {
        const emb = new EmbedBuilder().setTitle("⚡ CARTEL — KOMUTLAR").setColor(0xdc2626).setThumbnail(bot.user.displayAvatarURL())
            .addFields(
                { name: "🔊 Ses Odası", value: "`ses` `oda-isim` `oda-at`" },
                { name: "🔨 Moderasyon", value: "`sil` `ban` `unban` `kick` `timeout` `yavasmod` `kilit` `kilit-ac` `rol-ver` `rol-al` `uyar` `uyarilar` `sicil-temizle`" },
                { name: "📋 Kayıt", value: "`kayit-kanal` `kayit-rol` `alinacak-rol` `erkek` `kadin` `kayit-sayi`" },
                { name: "🛡️ Guard & Filtre", value: "`reklam-engel` `kufur-engel` `caps-engel` `link-engel` `sa-as` `mod-log` `otorol` `giris-cikis` `guard`" },
                { name: "🎭 Sistem", value: "`emoji-rol-kur` `emoji-rol-ekle` `sayac-kur` `tetikleyici-ekle` `tetikleyici-sil` `tetikleyiciler`" },
                { name: "ℹ️ Bilgi", value: "`ping` `istatistik` `sunucu-bilgi` `profil` `avatar` `roller` `afk`" },
                { name: "🎉 Eğlence", value: "`cekilis` `anket` `snipe` `oneri` `sikayet` `yazi-tura` `duello` `espri` `sahte-mesaj` `ask-olcer` `hiz-yazi`" },
                { name: "💰 Ekonomi", value: "`gunluk` `para` `gonder` `market` `market-ekle`" },
                { name: "⚙️ Kurulum", value: "`ticket-kur` `ticket-rol` `rol-kur`" },
                { name: "💡 Not", value: "Tüm komutlar hem `c!komut` hem `/komut` şeklinde çalışır." }
            ).setFooter({ text: "CARTEL | Prefix: c! | Slash: /" });
        reply({ embeds: [emb] });
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📨 PREFIX HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on(Events.MessageCreate, async msg => {
    if (msg.author.bot || !msg.guild) return;
    const db = getGuildDB(msg.guild.id);
    const save = () => saveGuild();

    // AFK kontrol
    if (msg.mentions.users.size > 0) {
        msg.mentions.users.forEach(user => {
            const afk = db.veriler.afk[user.id];
            if (afk) msg.reply(`💤 **${user.tag}** şu an AFK: *${afk.sebep}* (${afk.tarih})`).catch(() => {});
        });
    }
    if (db.veriler.afk[msg.author.id]) {
        delete db.veriler.afk[msg.author.id]; save();
        msg.reply("✅ AFK modundan çıktın!").then(m => setTimeout(() => m.delete().catch(() => {}), 3000)).catch(() => {});
    }

    // Tetikleyici
    const icerik = msg.content.toLowerCase();
    for (const [tetik, yanit] of Object.entries(db.veriler.tetikleyici)) {
        if (icerik.includes(tetik)) { msg.reply(yanit).catch(() => {}); break; }
    }

    if (db.ayarlar.saAs && icerik === "sa") return msg.reply("Aleykümselam! Hoş geldin 👋").catch(() => {});

    const yetkili = msg.member.permissions.has(PermissionFlagsBits.Administrator);

    // Filtreler
    if ((db.ayarlar.reklamEngel || db.ayarlar.linkEngel) && !yetkili) {
        if (/(discord\.gg|http|https|www\.)/gi.test(msg.content)) {
            msg.delete().catch(() => {});
            const w = await msg.channel.send(`⚠️ ${msg.author} Link/Reklam yasak!`);
            setTimeout(() => w.delete().catch(() => {}), 2000); return;
        }
    }
    if (db.ayarlar.kufurEngel && !yetkili) {
        if (/(amk|pic|sik|oc|yarrak|orospu|kahpe|yavsak)/gi.test(msg.content)) {
            msg.delete().catch(() => {});
            const w = await msg.channel.send(`⚠️ ${msg.author} Küfür yasak!`);
            setTimeout(() => w.delete().catch(() => {}), 2000); return;
        }
    }
    if (db.ayarlar.capsEngel && !yetkili) {
        const t = msg.content.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '');
        if (t.length > 10 && (t.split('').filter(c => c === c.toUpperCase()).length / t.length) > 0.7) {
            msg.delete().catch(() => {});
            const w = await msg.channel.send(`⚠️ ${msg.author} Caps lock yasak!`);
            setTimeout(() => w.delete().catch(() => {}), 2000); return;
        }
    }

    if (!msg.content.startsWith("c!")) return;
    const rawArgs = msg.content.slice(2).trim().split(/ +/);
    const cmd = rawArgs.shift().toLowerCase();

    const mentions = msg.mentions;
    const args = {
        kullanici: mentions.members?.first() || mentions.users?.first(),
        rol: mentions.roles?.first(), kanal: mentions.channels?.first(),
        sebep: rawArgs.slice(1).join(" ") || null,
        miktar: parseInt(rawArgs[0]) || null, sure: parseInt(rawArgs[1]) || null,
        saniye: parseInt(rawArgs[0]) || 0, durum: rawArgs[0] || null,
        id: rawArgs[0] || null, isim: rawArgs.join(" ") || null, yas: rawArgs[2] || null,
        baslik: rawArgs.join(" ") || null, mesaj: rawArgs.join(" ") || null,
        odul: rawArgs.slice(2).join(" ") || null, kazanan: parseInt(rawArgs[1]) || 1,
        tip: rawArgs[0] || null, tetik: rawArgs[0] || null,
        yanit: rawArgs.slice(1).join(" ") || null, islem: rawArgs[0] || null,
        'mesaj-id': rawArgs[0] || null, emoji: rawArgs[1] || null,
        kelime: rawArgs[0] || null, fiyat: parseInt(rawArgs[1]) || null,
        ...rawArgs
    };

    const ctx = { reply: (c) => msg.reply(c).catch(() => {}), author: msg.author, guild: msg.guild, member: msg.member, channel: msg.channel, isSlash: false };
    await handleKomut(cmd, args, ctx).catch(e => { console.error(`[${cmd}] Hata:`, e.message); msg.reply("❌ Bir hata oluştu.").catch(() => {}); });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚡ SLASH + BUTON HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on(Events.InteractionCreate, async interaction => {

    // ── SLASH ──
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;
        const opts = interaction.options;
        const args = {
            kullanici: opts.getMember?.('kullanici') || opts.getUser?.('kullanici'),
            rol: opts.getRole?.('rol'), kanal: opts.getChannel?.('kanal'),
            sebep: opts.getString?.('sebep'), miktar: opts.getInteger?.('miktar'),
            sure: opts.getInteger?.('sure'), saniye: opts.getInteger?.('saniye') ?? 0,
            durum: opts.getString?.('durum'), id: opts.getString?.('id'),
            isim: opts.getString?.('isim'), yas: opts.getString?.('yas'),
            baslik: opts.getString?.('baslik'), mesaj: opts.getString?.('mesaj'),
            odul: opts.getString?.('odul'), kazanan: opts.getInteger?.('kazanan') || 1,
            tip: opts.getString?.('tip'), tetik: opts.getString?.('tetik'),
            yanit: opts.getString?.('yanit'), islem: opts.getString?.('islem'),
            'mesaj-id': opts.getString?.('mesaj-id'), emoji: opts.getString?.('emoji'),
            kelime: opts.getString?.('kelime'), fiyat: opts.getInteger?.('fiyat'),
        };
        const ctx = {
            reply: (c) => { if (interaction.replied || interaction.deferred) return interaction.followUp(c).catch(() => {}); return interaction.reply(c).catch(() => {}); },
            author: interaction.user, guild: interaction.guild, member: interaction.member, channel: interaction.channel, isSlash: true
        };
        await handleKomut(cmd, args, ctx).catch(async e => {
            console.error(`[slash:${cmd}] Hata:`, e.message);
            try { if (interaction.replied || interaction.deferred) await interaction.followUp({ content: "❌ Bir hata oluştu.", ephemeral: true }); else await interaction.reply({ content: "❌ Bir hata oluştu.", ephemeral: true }); } catch {}
        });
        return;
    }

    if (!interaction.isButton()) return;

    // ── SES ODASI BUTONLARI ──
    const odaButonlari = ['oda_kilitle','oda_ac','oda_gizle','oda_goster','oda_limit_2','oda_limit_5','oda_limit_10','oda_limit_0'];
    if (odaButonlari.includes(interaction.customId)) {
        const data = userRooms.get(interaction.user.id);
        if (!data || !data.voiceChannel) return interaction.reply({ content: '❌ Aktif bir özel odanız yok.', ephemeral: true });
        const ch = data.voiceChannel;
        switch (interaction.customId) {
            case 'oda_kilitle':
                await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
                return interaction.reply({ content: '🔒 Oda kilitlendi.', ephemeral: true });
            case 'oda_ac':
                await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
                return interaction.reply({ content: '🔓 Kilit açıldı.', ephemeral: true });
            case 'oda_gizle':
                await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
                return interaction.reply({ content: '👁️ Oda gizlendi.', ephemeral: true });
            case 'oda_goster':
                await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
                return interaction.reply({ content: '👁️ Oda görünür yapıldı.', ephemeral: true });
            case 'oda_limit_2':
                await ch.setUserLimit(2);
                return interaction.reply({ content: '✅ Limit 2 yapıldı.', ephemeral: true });
            case 'oda_limit_5':
                await ch.setUserLimit(5);
                return interaction.reply({ content: '✅ Limit 5 yapıldı.', ephemeral: true });
            case 'oda_limit_10':
                await ch.setUserLimit(10);
                return interaction.reply({ content: '✅ Limit 10 yapıldı.', ephemeral: true });
            case 'oda_limit_0':
                await ch.setUserLimit(0);
                return interaction.reply({ content: '✅ Limit kaldırıldı.', ephemeral: true });
        }
    }

    // ── TİCKET BUTONLARI ──
    if (interaction.customId === 'ticket_ac') {
        const db = getGuildDB(interaction.guild.id);
        const existing = interaction.guild.channels.cache.find(ch => ch.name === `ticket-${interaction.user.username.toLowerCase()}`);
        if (existing) return interaction.reply({ content: `⚠️ Açık ticketin var: ${existing}`, ephemeral: true });
        const permOverwrites = [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ];
        for (const rolId of (db.ayarlar.ticketRoller || [])) {
            permOverwrites.push({ id: rolId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
        }
        const ch = await interaction.guild.channels.create({ name: `ticket-${interaction.user.username.toLowerCase()}`, type: ChannelType.GuildText, permissionOverwrites });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_kapat').setLabel('🔒 Kapat').setStyle(ButtonStyle.Danger));
        await ch.send({ content: `👋 Merhaba ${interaction.user}! Destek ekibi seninle ilgilenecek.`, components: [row] });
        return interaction.reply({ content: `✅ Ticketin açıldı: ${ch}`, ephemeral: true });
    }
    if (interaction.customId === 'ticket_kapat') {
        await interaction.reply({ content: "🔒 Kanal 5 saniye içinde siliniyor..." });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎭 EMOJİ ROL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const db = getGuildDB(reaction.message.guild?.id);
    const rolId = db.ayarlar.emojiRoller[reaction.message.id]?.[reaction.emoji.toString()];
    if (!rolId) return;
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.add(rolId).catch(() => {});
});

bot.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const db = getGuildDB(reaction.message.guild?.id);
    const rolId = db.ayarlar.emojiRoller[reaction.message.id]?.[reaction.emoji.toString()];
    if (!rolId) return;
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.remove(rolId).catch(() => {});
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛡️ GUARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function guardKaydet(userId, tip) {
    if (!guardSayac[userId]) guardSayac[userId] = {};
    if (!guardSayac[userId][tip]) guardSayac[userId][tip] = [];
    const simdi = Date.now();
    guardSayac[userId][tip] = guardSayac[userId][tip].filter(t => simdi - t < 10000);
    guardSayac[userId][tip].push(simdi);
    return guardSayac[userId][tip].length;
}

bot.on(Events.GuildAuditLogEntryCreate, async entry => {
    const guild = bot.guilds.cache.find(g => g.members.cache.has(entry.executorId));
    if (!guild) return;
    const db = getGuildDB(guild.id);
    if (!db.ayarlar.guardAktif) return;
    const { action, executorId } = entry;
    if (!executorId || executorId === bot.user.id) return;
    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (!executor || executor.permissions.has(PermissionFlagsBits.Administrator)) return;
    let tip = null, limit = 0;
    if (action === 22) { tip = 'ban'; limit = db.ayarlar.banLimit; }
    else if (action === 20) { tip = 'kick'; limit = db.ayarlar.kickLimit; }
    else if (action === 12) { tip = 'kanalSil'; limit = db.ayarlar.kanalSilLimit; }
    else if (action === 32) { tip = 'rolSil'; limit = db.ayarlar.rolSilLimit; }
    if (!tip) return;
    const sayi = guardKaydet(executorId, tip);
    if (sayi >= limit) {
        await executor.timeout(10 * 60 * 1000, `Guard: ${tip} limiti aşıldı`).catch(() => {});
        const logKanal = guild.channels.cache.get(db.ayarlar.modLog);
        if (logKanal) logKanal.send({ embeds: [new EmbedBuilder().setTitle("🛡️ GUARD UYARISI").setColor("Red").setDescription(`**${executor.user.tag}** \`${tip}\` limitini aştı!\n**İşlem:** 10 dakika timeout`).setTimestamp()] });
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚪 GİRİŞ-ÇIKIŞ & OTO ROL & SNİPE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on(Events.GuildMemberAdd, async member => {
    const db = getGuildDB(member.guild.id);
    if (db.ayarlar.otoRol) { const rol = member.guild.roles.cache.get(db.ayarlar.otoRol); if (rol) member.roles.add(rol).catch(() => {}); }
    if (db.ayarlar.hgKanal) {
        const kanal = member.guild.channels.cache.get(db.ayarlar.hgKanal);
        if (kanal) {
            const emb = new EmbedBuilder().setTitle("👋 Yeni Üye!").setColor("Green")
                .setDescription(`**${member.user.tag}** sunucumuza katıldı! Hoş geldin 🎉`)
                .setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Üye: ${member.guild.memberCount}` });
            kanal.send({ embeds: [emb] });
        }
    }
    setTimeout(() => guncelSayac(), 2000);
});

bot.on(Events.GuildMemberRemove, member => {
    const db = getGuildDB(member.guild.id);
    if (db.ayarlar.hgKanal) { const kanal = member.guild.channels.cache.get(db.ayarlar.hgKanal); if (kanal) kanal.send(`👋 **${member.user.tag}** sunucudan ayrıldı.`); }
    setTimeout(() => guncelSayac(), 2000);
});

bot.on(Events.MessageDelete, msg => {
    if (msg.author?.bot || !msg.guild) return;
    const db = getGuildDB(msg.guild.id);
    db.veriler.snipe[msg.channel.id] = { content: msg.content || "(boş/resim)", author: msg.author?.tag || "Bilinmeyen", avatar: msg.author?.displayAvatarURL() || "", tarih: new Date().toLocaleString("tr-TR") };
    saveGuild();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌐 WEB SUNUCUSU
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CARTEL BOT</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0505;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem}
    h1{font-size:3rem;color:#ef4444;letter-spacing:4px}p{color:#94a3b8}</style></head>
    <body><h1>⚡ CARTEL</h1><p>Bot aktif ve çalışıyor!</p><p>Prefix: c! | Slash: /</p></body></html>`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Web sunucusu: ${PORT}`));

bot.on('error', err => console.error('Bot hatası:', err.message));
process.on('unhandledRejection', err => console.error('Hata:', err?.message || err));

bot.login(process.env.TOKEN);
