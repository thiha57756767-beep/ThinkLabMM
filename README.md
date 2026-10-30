# ThinkLab Story Studio — ဇာတ်လမ်းစတူဒီယို

စိတ်ကူး → ဇာတ်လမ်းအကျဉ်း → ဇာတ်လမ်းအပြည့် → ခေါင်းစဉ် → Scene Prompt → ပုံ အထိ ထုတ်ပေးသော AI ဇာတ်လမ်းဖန်တီးရာ ဝဘ်ဆိုက်။
**Credit စနစ် မရှိပါ** — အကန့်အသတ်မရှိ သုံးနိုင်သည်။ AVT Studio နှင့် ဒီဇိုင်း မတူညီသော ကိုယ်ပိုင် version ဖြစ်သည်။

## လုပ်ဆောင်ချက်များ
- အကောင့်စနစ်: Username/Password၊ တစ်ဖုန်း-တစ်အကောင့် (device binding)၊ ပထမဆုံး အကောင့်သည် Owner
- Owner အတွက် စီမံခန့်ခွဲမှု: အကောင့် ပိတ်/ဖွင့်၊ စက် ပြန်သတ်မှတ်၊ အကောင့် ဖျက်
- စတူဒီယို: အမျိုးအစား ၁၅၊ Art style ၁၆၊ အဝတ်အစား ၁၁၊ နောက်ခံ ၁၁၊ ကြာချိန် ၁/၃/၅/၇ မိနစ်
- ကိုယ်ပိုင် ဇာတ်ကောင် စတူဒီယို: ဇာတ်ကောင် တစ်ယောက်လျှင် ရည်ညွှန်းပုံ ၁–၅ ပုံ၊ AI လက္ခဏာ အလိုအလျောက် ဖြည့်ပေးခြင်း
- ပုံဖန်တီးရန်: Scene အလိုက် ဇာတ်ကောင် reference ပုံများနှင့် ပုံထုတ်ခြင်း၊ Thumbnail၊ ကိုယ်တိုင် Prompt၊ media စာကြည့်တိုက်
- မှတ်တမ်းများ: စတူဒီယို အလုပ်များကို သိမ်းပြီး ပြန်ဖွင့်နိုင်ခြင်း

## Replit မှာ တင်နည်း (အဆင့်ဆင့်)
1. Replit မှာ **Create Repl → Import from ZIP** (သို့မဟုတ် GitHub) ဖြင့် ဤ project ကို တင်ပါ။ (ZIP ဖိုင်ကို ဖြေပြီး ဖိုင်အားလုံး တင်ရန်လည်း ရသည်)
2. ဘယ်ဘက် menu မှ **Tools → Secrets** ကိုဖွင့်ပြီး key အသစ်ထည့်ပါ:
   - KEY: `GEMINI_API_KEY`
   - VALUE: သင့် Google AI Studio API Key (ဥပမာ `AQ....`)
   - (Secret မသုံးချင်ပါက — ဆိုဒ်ထဲဝင်၊ Owner အကောင့်ဖြင့် ဆက်တင် စာမျက်နှာမှာ key ထည့်လို့လည်း ရသည်)
3. **Run** ခလုတ်ကို နှိပ်ပါ။ ဆိုဒ် လည်ပတ်ပါပြီ။
4. ဆိုဒ်ကိုဖွင့်ပြီး **ပထမဆုံး အကောင့်ဖွင့်သူ** သည် Owner ဖြစ်သောကြောင့် အရင်ဆုံး ကိုယ့်အကောင့်ကို ဖွင့်ပါ။
5. အမြဲတမ်း ဖွင့်ထားရန် Replit ရဲ့ **Deploy** ကို သုံးနိုင်သည်။

## သတိပြုရန်
- Data (အကောင့်များ၊ မှတ်တမ်းများ၊ ပုံများ) ကို project အတွင်း `data/` folder ထဲမှာ သိမ်းသည်။ Replit မှာ ဖိုင်များ persist ဖြစ်အောင် Reserved VM/Autoscale deployment သုံးတဲ့အခါ storage အခြေအနေကို စစ်ပါ — အရေးကြီး data များကို အခါအားလျော်စွာ download သိမ်းထားပါ။
- Gemini key ကို code ထဲမှာ လုံးဝ မရေးပါနှင့်။ Secrets (သို့မဟုတ် Settings ထဲက server-side သိမ်းခြင်း) ကိုသာ သုံးပါ — ဆိုဒ်ကို သူများ မြင်ရင်တောင် key မပေါ်ပါ။
- Image generation က Gemini ရဲ့ image model quota ပေါ် မူတည်သည် — key ရဲ့ quota ပြည့်ပါက "quota ပြည့်သွားပါသည်" ဟု ပြပါမည်။

## နည်းပညာ
- Node.js (dependency လုံးဝ မရှိပါ — `npm install` မလိုပါ)၊ `node server.js` ဖြင့် လည်ပတ်သည်
- AI: Google Gemini — text: gemini-3.5-flash → gemini-3.8-flash → gemini-3.5-flash-lite (fallback chain — 3.5 ကို အရင်သုံးထားသည်၊ 3.8 က overload ဖြစ်တတ်လို့), image: gemini-3.1-flash-image → gemini-2.5-flash-image → gemini-3-pro-image
- Password များကို scrypt hash ဖြင့် သိမ်းသည်၊ session cookie (HttpOnly) သုံးသည်
