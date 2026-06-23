# Discord Bot Railway

بوت ديسكورد عربي جاهز للنشر على Railway.

## الميزات

- أوامر إدارة: `/ban`, `/kick`, `/timeout`, `/clear`, `/help`, `/ping`
- نظام تكت كامل: `/setup-ticket`
- نظام لوبيات ألعاب: `/setup-lobby`
- نظام رومات صوتية مؤقتة: `/setup-tempvoice`
- أزرار وتحكم بالملكية والقفل والحد الأقصى للأعضاء

## تشغيله على Railway من الآيفون

1. ادخل Railway.
2. New Project.
3. Deploy from GitHub repo.
4. اختر هذا المستودع.
5. أضف متغير البيئة:

```env
DISCORD_TOKEN=ضع_توكن_بوتك_هنا
```

اختياريًا، لتسجيل أوامر السلاش بسرعة داخل سيرفر واحد فقط:

```env
GUILD_ID=ايدي_السيرفر
```

## إعدادات Discord Developer Portal

لازم تفعل من صفحة البوت:

- SERVER MEMBERS INTENT
- MESSAGE CONTENT INTENT

وتأكد أن رابط دعوة البوت يحتوي الصلاحيات المناسبة:

- Administrator أو على الأقل:
  - Manage Channels
  - Manage Roles
  - Manage Messages
  - Ban Members
  - Kick Members
  - Moderate Members
  - Move Members
  - Send Messages
  - Embed Links
  - Use Slash Commands

## الأوامر بعد تشغيل البوت

### التكت

```text
/setup-ticket channel:#ticket-panel
```

يرسل لوحة فيها اختيار:

- شكوى
- اقتراح
- نظام الاشتراكات

### اللوبيات

```text
/setup-lobby channel:#lobby-panel
```

يرسل لوحة فيها:

- Create Lobby
- Find Lobby

الألعاب الموجودة:

- Mobile Legends: يطلب ID
- COD Mobile: يطلب UID
- Roblox: يطلب Username

### الرومات الصوتية المؤقتة

1. سو روم صوتي باسم مثل: `Join To Create`
2. نفذ:

```text
/setup-tempvoice join_channel:"Join To Create"
```

أي شخص يدخل هذا الروم، البوت ينشئ له روم صوتي خاص وينقله له، ثم يرسل أزرار التحكم داخل شات الروم الصوتي.

## ملاحظة مهمة عن التخزين

البوت يحفظ الإعدادات في ملف محلي داخل مجلد `data`. هذا مناسب كبداية. إذا صار عندك سيرفر كبير أو تبي حفظ دائم حتى بعد إعادة بناء Railway، نقدر نطوره لاحقًا ونربطه بقاعدة بيانات مثل Redis أو PostgreSQL.
