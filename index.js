const {
  Client, GatewayIntentBits, ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const fs = require('fs');
 
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});
 
const PREFIX = 'b!';
const CONFIG_FILE = './config.json';
 
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}
 
function saveConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}
 
let config = loadConfig();
const userRooms = new Map();
 
function buildPanel(member, channel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎧 ${member.user.username}'in Özel Odası`)
    .setDescription('Aşağıdaki butonları kullanarak odanı yönet.')
    .addFields(
      { name: '📛 Oda Adı', value: channel.name, inline: true },
      { name: '👥 Limit', value: channel.userLimit === 0 ? 'Limitsiz' : `${channel.userLimit} kişi`, inline: true },
    )
    .setFooter({ text: 'Odadan çıkınca oda silinir.' })
    .setTimestamp();
 
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('kilitle').setLabel('🔒 Kilitle').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ac').setLabel('🔓 Kilidi Aç').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('gizle').setLabel('👁️ Gizle').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('goster').setLabel('👁️ Göster').setStyle(ButtonStyle.Secondary),
  );
 
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('limit_2').setLabel('👤 2').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('limit_5').setLabel('👥 5').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('limit_10').setLabel('👥 10').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('limit_0').setLabel('♾️ Limitsiz').setStyle(ButtonStyle.Primary),
  );
 
  return { embeds: [embed], components: [row1, row2] };
}
 
client.on('voiceStateUpdate', async (oldState, newState) => {
  const hubChannelId = config.hubChannelId;
  const controlTextChannelId = config.controlTextChannelId;
 
  if (newState.channelId && newState.channelId === hubChannelId) {
    const member = newState.member;
    const guild = newState.guild;
    const hubChannel = guild.channels.cache.get(hubChannelId);
 
    if (!hubChannel) return;
 
    try {
      const privateRoom = await guild.channels.create({
        name: `🎧 ${member.user.username}'in Odası`,
        type: ChannelType.GuildVoice,
        parent: hubChannel.parentId,
        userLimit: 0,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.MoveMembers,
              PermissionsBitField.Flags.MuteMembers,
              PermissionsBitField.Flags.DeafenMembers,
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
            ...buildPanel(member, privateRoom),
          });
        }
      }
 
      userRooms.set(member.id, { voiceChannel: privateRoom, controlMessage });
      console.log(`✅ ${member.user.username} için oda oluşturuldu.`);
    } catch (err) {
      console.error('Oda oluşturma hatası:', err);
    }
  }
 
  if (oldState.channel && oldState.channel.id !== hubChannelId) {
    const channel = oldState.channel;
    if (channel.members.size === 0) {
      for (const [uid, data] of userRooms.entries()) {
        if (data.voiceChannel.id === channel.id) {
          if (data.controlMessage) await data.controlMessage.delete().catch(() => {});
          userRooms.delete(uid);
        }
      }
      await channel.delete().catch(() => {});
      console.log(`🗑️ Boş oda silindi.`);
    }
  }
});
 
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
 
  const userId = interaction.user.id;
  const data = userRooms.get(userId);
 
  if (!data) return interaction.reply({ content: '❌ Aktif bir özel odanız yok.', ephemeral: true });
 
  const channel = data.voiceChannel;
 
  switch (interaction.customId) {
    case 'kilitle':
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
      return interaction.reply({ content: '🔒 Oda kilitlendi.', ephemeral: true });
    case 'ac':
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
      return interaction.reply({ content: '🔓 Kilit açıldı.', ephemeral: true });
    case 'gizle':
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
      return interaction.reply({ content: '👁️ Oda gizlendi.', ephemeral: true });
    case 'goster':
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
      return interaction.reply({ content: '👁️ Oda görünür yapıldı.', ephemeral: true });
    case 'limit_2':
      await channel.setUserLimit(2);
      return interaction.reply({ content: '✅ Limit 2 yapıldı.', ephemeral: true });
    case 'limit_5':
      await channel.setUserLimit(5);
      return interaction.reply({ content: '✅ Limit 5 yapıldı.', ephemeral: true });
    case 'limit_10':
      await channel.setUserLimit(10);
      return interaction.reply({ content: '✅ Limit 10 yapıldı.', ephemeral: true });
    case 'limit_0':
      await channel.setUserLimit(0);
      return interaction.reply({ content: '✅ Limit kaldırıldı.', ephemeral: true });
  }
});
 
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
 
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args[0].toLowerCase();
 
  if (command === 'ses') {
    const category = await message.guild.channels.create({
      name: '🔊 Özel Odalar',
      type: ChannelType.GuildCategory,
    });
    const hubChannel = await message.guild.channels.create({
      name: '➕ Oda Oluştur',
      type: ChannelType.GuildVoice,
      parent: category.id,
    });
    const textChannel = await message.guild.channels.create({
      name: '🎛️oda-kontrol',
      type: ChannelType.GuildText,
      parent: category.id,
    });
 
    config.hubChannelId = hubChannel.id;
    config.controlTextChannelId = textChannel.id;
    saveConfig(config);
 
    console.log(`✅ Hub kanalı ayarlandı: ${hubChannel.id}`);
    return message.reply(`✅ Hazır! <#${hubChannel.id}> kanalına gir, özel odanı otomatik açacağım.`);
  }
 
  if (command === 'durum') {
    const hubId = config.hubChannelId;
    const ctrlId = config.controlTextChannelId;
    return message.reply(
      `📊 **Mevcut Ayarlar:**\n` +
      `Hub Kanalı: ${hubId ? `<#${hubId}>` : '❌ Ayarlanmamış'}\n` +
      `Kontrol Kanalı: ${ctrlId ? `<#${ctrlId}>` : '❌ Ayarlanmamış'}`
    );
  }
 
  if (command === 'isim') {
    const data = userRooms.get(message.author.id);
    if (!data) return message.reply('❌ Aktif bir özel odanız yok.');
    const newName = args.slice(1).join(' ');
    if (!newName) return message.reply('❌ Örn: `b!isim Oyun Odası`');
    await data.voiceChannel.setName(newName);
    return message.reply(`✅ Oda adı **${newName}** olarak değiştirildi.`);
  }
 
  if (command === 'at') {
    const data = userRooms.get(message.author.id);
    if (!data) return message.reply('❌ Aktif bir özel odanız yok.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Bir kullanıcı etiketleyin.');
    if (target.voice.channelId === data.voiceChannel.id) {
      await target.voice.disconnect();
      return message.reply(`✅ **${target.user.username}** atıldı.`);
    } else {
      return message.reply('❌ O kullanıcı odanızda değil.');
    }
  }
});
 
client.once('ready', () => {
  console.log(`✅ Bot açık: ${client.user.tag}`);
  console.log(`📋 Hub Kanalı: ${config.hubChannelId || 'Ayarlanmamış - b!ses yaz'}`);
});
 
client.login(TOKEN);
