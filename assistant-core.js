(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LaunchAssistantCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Live demo catalog (source of truth: index.html flagship section + demos/*) */
  var DEMOS = Object.freeze([
    Object.freeze({ id: 1500, tier: 1500, package: 'lite', name: ['Luma Studio', 'استوديو لوما'], concept: ['One-page studio', 'استوديو بصفحة واحدة'],
      description: ['A one-page studio website with services, opening hours, location and an enquiry example.', 'موقع دافئ لخدمة محلية، يشمل الخدمات وساعات العمل والموقع ومسار استفسار بسيط.'],
      url: 'demos/aed-1500/index.html' }),
    Object.freeze({ id: 3000, tier: 3000, package: 'plus', name: ['Noura Wellness', 'نورا للعافية'], concept: ['Appointment-led', 'موقع للحجوزات'],
      description: ['A service website with appointment options and a booking preview. No appointment is submitted.', 'تجربة خدمات أوسع مع عدة واجهات ومحتوى ثقة ونموذج حجز تجريبي لا يرسل بيانات.'],
      url: 'demos/aed-3000/index.html' }),
    Object.freeze({ id: 5000, tier: 5000, package: 'premium', name: ['Aurum Collection', 'مجموعة أوروم'], concept: ['Premium catalogue', 'كتالوج فاخر'],
      description: ['A premium catalogue with product filters and an example concierge conversation. No live orders or AI.', 'تجربة سينمائية للعلامة والكتالوج مع حركة راقية وفلاتر ومساعد تجريبي مبرمج.'],
      url: 'demos/aed-5000/index.html' })
  ]);

  /* Chip lists shared with the UI so labels and matching never drift */
  var GOALS = Object.freeze([
    ['Learn about my services', 'التعرف على خدماتي'], ['Request appointments', 'طلب حجوزات'], ['Browse products and order', 'تصفح المنتجات وطلبها'], ['Luxury brand showcase', 'عرض فاخر لعلامتي'], ['Intelligent customer service', 'استخدام خدمة عملاء ذكية']
  ]);
  var SECTORS = Object.freeze([
    ['Salon, clinic or spa', 'صالون أو عيادة أو سبا'],
    ['Café, restaurant or roastery', 'مقهى أو مطعم أو محمصة'],
    ['Shop, boutique or products', 'متجر أو بوتيك أو منتجات'],
    ['Luxury or premium brand', 'علامة فاخرة أو راقية'],
    ['Freelancer, consultant or startup', 'مستقل أو مستشار أو شركة ناشئة'],
    ['Something else', 'نشاط آخر', 'other']
  ]);

  /* wa.me URLs above this length have been seen truncated by WhatsApp clients / in-app browsers */
  var WA_URL_LIMIT = 8000;
  /* ~600 Arabic characters once percent-encoded (each Arabic letter → 6 chars, e.g. %D8%B7) */
  var LONG_TEXT_ENCODED = 3600;

  function text(value) { return value == null ? '' : String(value); }

  /* Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII; thousands separators removed */
  function digits(value) {
    return text(value)
      .replace(/[٠-٩]/g, function (n) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(n); })
      .replace(/[۰-۹]/g, function (n) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(n); })
      .replace(/[,٬’]/g, '');
  }

  /* Lower-case, strip Latin accents (Café → cafe), unify alef forms and drop tashkeel for stem matching */
  function normalize(value) {
    return text(value).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
      .replace(/[أإآ]/g, 'ا').replace(/[ً-ْـ]/g, '');
  }

  /* '1,500' / '٣٬٠٠٠' / '1.5k' → number; null when there are no digits or the value is below 100 */
  function parseAmount(value) {
    var cleaned = digits(value).toLowerCase().replace(/[\s'’]/g, '');
    var match = /(\d+(?:\.\d+)?)(k)?/.exec(cleaned);
    if (!match) return null;
    var amount = Number(match[1]) * (match[2] ? 1000 : 1);
    return amount >= 100 ? amount : null;
  }

  function parsePages(value) {
    var match = /\d+/.exec(digits(value));
    return match ? Number(match[0]) : null;
  }

  /* Returns { skip: true, value: '' } for skip words, { skip: false, value: '+9715…' } for a valid number, null otherwise */
  function parsePhone(value) {
    var raw = text(value).trim();
    if (!raw || /^(skip|no|none|-|تخطي|لا|لا شكرا|لا شكراً)$/i.test(raw)) return { skip: true, value: '' };
    var number = digits(raw).replace(/[\s\-().]/g, '');
    if (/^00\d/.test(number)) number = '+' + number.slice(2);
    if (!/^\+?\d{7,15}$/.test(number)) return null;
    return { skip: false, value: number };
  }

  /* strict: only an explicit question mark counts (matcher / details steps, where names like "Can Do Fitness" or "ما شاء الله" are answers) */
  function isQuestion(value, strict) {
    var raw = text(value).trim();
    if (/[?؟]/.test(raw)) return true;
    if (strict) return false;
    return /^(what|how|can|do|does|is|will|when|where|which|tell|recommend)\b/i.test(raw) || /^(هل|كيف|كم|متى|ماذا|ما|أي|انصحني)(\s|$)/.test(raw);
  }

  function encodedLength(value) { return encodeURIComponent(text(value)).length; }

  function demoById(id) {
    var key = text(id).trim();
    for (var i = 0; i < DEMOS.length; i++) if (String(DEMOS[i].id) === key) return DEMOS[i];
    return undefined;
  }

  /* Bilingual reasons shown on the demo cards */
  var R = {
    studio1500: ['A focused one-page site suits a studio, freelancer or small service', 'صفحة واحدة مركزة تناسب الاستوديو أو المستقل أو الخدمة الصغيرة'],
    studio3000: ['Room to grow into more pages later', 'مساحة للتوسع إلى صفحات أكثر لاحقاً'],
    care3000: ['Built for salons, clinics and appointment-led services', 'مصمم للصالونات والعيادات والخدمات القائمة على المواعيد'],
    care1500: ['A simple services page with an enquiry path', 'صفحة خدمات بسيطة مع مسار استفسار'],
    retail5000: ['A premium catalogue fits retail, products and luxury brands', 'كتالوج فاخر يناسب المتاجر والمنتجات والعلامات الراقية'],
    retail3000: ['Service pages with a booking preview as a lighter option', 'صفحات خدمات مع نموذج حجز كخيار أخف'],
    cafe3000: ['Menus, location and bookings work well for cafés and restaurants', 'القوائم والموقع والحجوزات تناسب المقاهي والمطاعم'],
    cafe1500: ['A one-page menu and location site is the fastest start', 'موقع بصفحة واحدة للقائمة والموقع هو أسرع بداية'],
    cafe5000: ['A visual catalogue suits a premium food brand', 'كتالوج بصري يناسب علامة غذائية راقية'],
    goalAppointments: ['Built around appointments, which matches your goal', 'مصمم حول الحجوزات، وهو ما يناسب هدفك'],
    goalProducts: ['Product browsing and ordering match your goal', 'تصفح المنتجات وطلبها يناسب هدفك'],
    goalLuxury: ['A cinematic premium showcase matches your goal', 'عرض فاخر سينمائي يناسب هدفك'],
    goalAi5000: ['Includes an example concierge conversation', 'يتضمن مثالاً لمحادثة كونسيرج ذكي'],
    goalAi3000: ['Service pages with a clear enquiry path', 'صفحات خدمات مع مسار استفسار واضح'],
    goalServices1500: ['Tells your story and services on one page', 'يعرض قصتك وخدماتك في صفحة واحدة'],
    goalServices3000: ['Several service pages with a booking preview', 'عدة صفحات خدمات مع نموذج حجز تجريبي'],
    pages1500: ['Matches a one-page scope', 'يناسب نطاق الصفحة الواحدة'],
    pages3000: ['Supports up to 6 pages', 'يدعم حتى 6 صفحات'],
    pages5000: ['Supports up to 10 pages', 'يدعم حتى 10 صفحات'],
    budget: ['Within your stated budget', 'ضمن ميزانيتك المحددة'],
    featBooking: ['Has a booking preview for appointment requests', 'يتضمن نموذج حجز تجريبي لطلبات المواعيد'],
    featGallery1500: ['Room for a gallery of your work', 'مساحة لمعرض أعمالك'],
    featGallery5000: ['Visual catalogue for a gallery-led brand', 'كتالوج بصري لعلامة تعتمد على الصور'],
    featCatalog: ['Product filters and an example concierge', 'فلاتر منتجات ومثال لمساعد كونسيرج'],
    generic1500: ['Fastest, most affordable starting point', 'أسرع نقطة بداية وأقلها تكلفة'],
    generic3000: ['Balanced scope for a growing service business', 'نطاق متوازن لنشاط خدمي متنامٍ'],
    generic5000: ['Most complete experience for a premium brand', 'التجربة الأكثر اكتمالاً لعلامة راقية']
  };

  /* Sector groups: EN uses word boundaries; Arabic matches stems by substring (\b does not work with Arabic letters) */
  var SECTOR_GROUPS = [
    { primary: 1500,
      test: /\b(studios?|freelanc\w*|consult\w*|coach\w*|photograph\w*|start-?ups?|founders?|small (local )?(service|business)|home services?|trades?|handyman|maintenance|cleaning|movers?|plumb\w*|electrician|technician|agency|designers?|architects?|lawyers?|accountants?|tutors?|trainers?)\b|استوديو|مصور|تصوير|مستشار|استشار|مستقل|ناشئ|مدرب|كوتش|خدمات منزلية|صيانة|تنظيف|سباك|كهرباء|محامي|محاسب/,
      points: [[1500, 3, R.studio1500], [3000, 1, R.studio3000]] },
    { primary: 3000,
      test: /\b(salons?|clinics?|spas?|dentists?|dental|wellness|gyms?|fitness|yoga|pilates|physio\w*|tuition|tutoring|education|training|nursery|academy|school|appointments?|bookings?|barbers?|beauty|massage|therap\w*|medical|doctors?)\b|صالون|مشغل|عياد|سبا|منتجع|اسنان|عافية|نادي|جيم|لياقة|يوغا|علاج طبيعي|تدريس|دروس|معهد|حضانة|حجز|حجوزات|موعد|مواعيد|تجميل|حلاق|مساج/,
      points: [[3000, 3, R.care3000], [1500, 1, R.care1500]] },
    { primary: 5000,
      test: /\b(retail|products?|boutiques?|shops?|stores?|perfumes?|fragrances?|jewel\w*|fashion|catalog\w*|luxury|premium|hotels?|real estate|propert(y|ies)|brokers?|abayas?|watches|gold|e-?commerce)\b|متجر|محل|دكان|بوتيك|منتج(?!ع)|عطر|عطور|(^|\s)(ال)?عود|بخور|مجوهرات|ذهب|ازياء|كتالوج|فاخر|راقي|فخم|فندق|عقار|تجزئة/,
      points: [[5000, 3, R.retail5000], [3000, 1, R.retail3000]] },
    { primary: 3000,
      test: /\b(cafes?|coffee|restaurants?|roaster\w*|baker(y|ies)|eater(y|ies)|bistro|catering|food|kitchen)\b|مطعم|مقهى|كافيه|كافي|قهوة|محمصة|مخبز|مطبخ/,
      points: [[3000, 2, R.cafe3000], [1500, 1, R.cafe1500], [5000, 1, R.cafe5000]] }
  ];

  /* Goal signals in priority order (first match wins, so "Intelligent customer service" is not read as "services") */
  var GOAL_SIGNALS = [
    { test: /appointment|booking|reserv|حجز|حجوز|موعد|مواعيد/, points: [[3000, 3, R.goalAppointments]] },
    { test: /customer service|concierge|chatbot|\bai\b|assistant|خدمة عملاء|ذكي|ذكاء|مساعد|روبوت/, points: [[5000, 2, R.goalAi5000], [3000, 1, R.goalAi3000]] },
    { test: /luxury|premium|showcase|فاخر|راق|فخم/, points: [[5000, 3, R.goalLuxury]] },
    { test: /products?|order|catalog|shop|منتج|طلب|كتالوج|تسوق/, points: [[5000, 3, R.goalProducts]] },
    { test: /services?|about|learn|خدمات|تعرف/, points: [[1500, 2, R.goalServices1500], [3000, 1, R.goalServices3000]] }
  ];

  var FEATURE_SIGNALS = [
    { test: /booking|appointment|حجز|موعد|مواعيد/, points: [[3000, 2, R.featBooking]] },
    { test: /gallery|portfolio|معرض|بورتفوليو|اعمالي/, points: [[1500, 1, R.featGallery1500], [5000, 1, R.featGallery5000]] },
    { test: /catalog|products?|orders?|\bai\b|concierge|chatbot|كتالوج|منتج|طلبات|ذكاء|ذكي|مساعد|روبوت/, points: [[5000, 2, R.featCatalog]] }
  ];

  function matchDemos(brief) {
    brief = brief || {};
    var scores = {}, reasons = {}, fired = false;
    DEMOS.forEach(function (demo) { scores[demo.id] = 0; reasons[demo.id] = []; });
    function field(key) { return normalize(brief[key]); }
    /* Canonicalise compound phrases so the generic word ("shop", "studio", "محل") does not outrank the real sector:
       "coffee shop" → cafe, "yoga studio" → yoga, "محل قهوة" → مقهى */
    function sectorText(key) {
      return field(key)
        .replace(/\b(coffee|tea|bakery|cake|juice)\s*shops?\b/g, 'cafe')
        .replace(/\b(yoga|pilates|fitness|dance|barber|beauty|nail)\s+studios?\b/g, '$1')
        .replace(/محل (قهوة|حلويات)/g, 'مقهى');
    }
    function add(id, points, reason) {
      scores[id] += points;
      fired = true;
      if (reason && points > 0 && reasons[id].indexOf(reason) === -1) reasons[id].push(reason);
    }
    function apply(signal) { signal.points.forEach(function (entry) { add(entry[0], entry[1], entry[2]); }); }

    var sector = sectorText('sector');
    SECTOR_GROUPS.forEach(function (group) { if (sector && group.test.test(sector)) apply(group); });
    var business = sectorText('business');
    SECTOR_GROUPS.forEach(function (group) {
      if (business && group.test.test(business)) add(group.primary, 1, group.points[0][2]);
    });

    var goal = field('goal');
    for (var g = 0; goal && g < GOAL_SIGNALS.length; g++) {
      if (GOAL_SIGNALS[g].test.test(goal)) { apply(GOAL_SIGNALS[g]); break; }
    }

    var pages = parsePages(brief.pages);
    if (pages !== null) {
      if (pages <= 1) add(1500, 2, R.pages1500);
      else if (pages <= 6) add(3000, 2, R.pages3000);
      else add(5000, 2, R.pages5000);
    }

    var budget = parseAmount(brief.budget);
    if (budget !== null) {
      if (budget <= 2000) add(1500, 2, R.budget);
      else if (budget < 4000) add(3000, 2, R.budget);
      else add(5000, 2, R.budget);
      DEMOS.forEach(function (demo) { if (budget < demo.tier) add(demo.id, -1); });
    }

    var free = [field('features'), field('notes'), field('customRequest')].filter(Boolean).join(' ');
    FEATURE_SIGNALS.forEach(function (signal) { if (free && signal.test.test(free)) apply(signal); });

    var results = DEMOS.map(function (demo) {
      var list = fired ? reasons[demo.id].slice(0, 2) : [];
      if (!list.length) list.push(R['generic' + demo.id]);
      return { id: demo.id, score: scores[demo.id], reasons: list.map(function (r) { return [r[0], r[1]]; }), tier: demo.tier };
    });
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (budget !== null) {
        var da = Math.abs(a.tier - budget), db = Math.abs(b.tier - budget);
        if (da !== db) return da - db;
      }
      return a.tier - b.tier;
    });
    return results.map(function (entry) { return { id: entry.id, score: entry.score, reasons: entry.reasons }; });
  }

  function recommend(brief) {
    var needs = [brief.goal, brief.features, brief.notes].filter(Boolean).join(' ').toLowerCase();
    var pages = parsePages(brief.pages) || 0;
    if (/\b(luxury|cinematic|showcase|portfolio|premium|bespoke|ai|chatbot|assistant)\b|فاخر|بريميوم|عرض|موسع|ذكاء|روبوت|مساعد/.test(needs) || pages > 6) return 'premium';
    if (/\b(shop|store|sell|catalog|catalogue|products|orders)\b|متجر|منتجات|بيع|طلبات/.test(needs)) return 'store';
    if (/\b(book|booking|appointments|clinic|salon)\b|حجز|حجوزات|عياد|صالون/.test(needs) || pages > 4) return 'plus';
    if (pages > 1 || /\b(gallery|multi|restaurant)\b|مطعم|معرض/.test(needs)) return 'basic';
    return 'lite';
  }
  function quote(brief, catalog) {
    var key = brief.package;
    if (!Object.hasOwn(catalog.packages, key)) throw new Error('Choose a valid package.');
    var included = catalog.included[key] || [];
    var extras = Array.from(new Set(brief.addons || [])).filter(function (id) {
      return Object.hasOwn(catalog.addons, id) && included.indexOf(id) === -1;
    });
    var pack = catalog.packages[key];
    var total = pack.price + extras.reduce(function (sum, id) { return sum + catalog.addons[id].price; }, 0);
    var deposit = Math.round(total * .3);
    return { key: key, name: pack.name, extras: extras, total: total, deposit: deposit, balance: total - deposit,
      monthly: brief.care ? 300 : 0, status: 'PROVISIONAL_LOCAL', payment: 'NOT_COLLECTED' };
  }
  function topic(text) {
    var value = text.toLowerCase().trim();
    if (/privacy|private|data|store my|security|خصوصية|بيانات|تخزين|أمان/.test(value)) return 'privacy';
    if (/payment|deposit|refund|pay |how to pay|credit card|advance|دفع|عربون|مقدم|استرداد|طريقة الدفع/.test(value)) return 'payment';
    if (/hosting|domain|server|dns|استضافة|دومين|نطاق|سيرفر/.test(value)) return 'hosting';
    if (/how long|timeline|delivery|when|schedule|duration|مدة|متى|تسليم|وقت|كم يوم/.test(value)) return 'timing';
    if (/price|cost|package|budget|how much|fee|تكلفة|سعر|أسعار|باقات|كم يكلف/.test(value)) return 'pricing';
    if (/\bai\b|chatbot|intelligent|ollama|openclaw|automation|bot|ذكاء|ذكي|روبوت|بوت|أتمتة/.test(value)) return 'ai';
    if (/demo|example|preview|sample|portfolio|show me|نموذج|نماذج|معاينة|أمثلة/.test(value)) return 'demos';
    if (/human|person|founder|owner|team|speak to|contact|call|phone|موظف|بشري|مؤسس|المالك|تواصل|اتصال|هاتف/.test(value)) return 'human';
    if (/recommend|which package|best package|salon|clinic|spa|restaurant|cafe|store|shop|اي باقة|أي باقة|افضل باقة|أنصحني|صالون|عيادة|مطعم|كافيه|متجر/.test(value)) return 'recommendation';
    if (/arabic|bilingual|rtl|language|عربي|عربية|لغات|ثنائي|لغة/.test(value)) return 'arabic';
    if (/revision|change|credit|update|edit|تعديل|تغيير|نقاط|رصيد|تحديث/.test(value)) return 'revisions';
    if (/agency|compare|comparison|why us|25000|invoice|وكالة|مقارنة|لماذا|تكلفة الوكالات|وكالات/.test(value)) return 'comparison';
    if (/qr|scan|mobile preview|link|url|surge|رمز|كود|امسح|رابط|موقع/.test(value)) return 'qr';
    if (/^(hi|hello|hey|good morning|good evening|welcome|مرحبا|أهلا|اهلا|السلام عليكم|صباح الخير|مساء الخير)/.test(value)) return 'greeting';
    return null;
  }

  /* Live-AI context: only these brief fields may leave the page (never name, phone, notes, customRequest or the WhatsApp draft) */
  var AI_CONTEXT_KEYS = ['business', 'sector', 'goal', 'package'];
  var AI_CONTEXT_MAX = 120;
  function buildAiContext(brief) {
    var out = {};
    brief = brief || {};
    AI_CONTEXT_KEYS.forEach(function (key) {
      var value = text(brief[key]).replace(/\s+/g, ' ').trim().slice(0, AI_CONTEXT_MAX).trim();
      if (value) out[key] = value;
    });
    return out;
  }

  /* Model replies are rendered via textContent only; this strips C0 control characters (except newline/tab) and caps the length */
  function sanitizeReply(value) {
    return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 1500);
  }

  return Object.freeze({
    recommend: recommend, quote: quote, topic: topic,
    DEMOS: DEMOS, GOALS: GOALS, SECTORS: SECTORS, demoById: demoById, matchDemos: matchDemos,
    digits: digits, normalize: normalize, parseAmount: parseAmount, parsePages: parsePages, parsePhone: parsePhone,
    isQuestion: isQuestion, encodedLength: encodedLength, WA_URL_LIMIT: WA_URL_LIMIT, LONG_TEXT_ENCODED: LONG_TEXT_ENCODED,
    buildAiContext: buildAiContext, sanitizeReply: sanitizeReply
  });
});
