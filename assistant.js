(function () {
  'use strict';
  var base = new URL('.', document.currentScript.src);
  /* Public address of whichever host is serving this copy of the site (surge, Netlify, a custom domain) */
  var siteUrl = base.href.replace(/\/$/, '');
  var core = window.LaunchAssistantCore;
  if (!core || !window.PACKAGES || !window.ADDONS) return;
  var catalog = { packages: window.PACKAGES, addons: window.ADDONS, included: window.INCLUDED };
  var brief = { addons: [], care: false };
  var step = -1;
  var editOnly = false;
  var flow = null; /* 'brief' | 'match' | 'details' | 'custom' */
  var view = 'home'; /* 'home' | 'question' | 'picks' | 'custom' | 'review' | 'handoff' */
  var picksNode = null;
  var picksState = null; /* { results: [...], thirdShown: false } */
  var packageFromDemo = false;
  var detailsOffset = 0; /* 1 when the business name was already known on entering the details steps */
  var started = false;
  var lastFocus;
  var lastQuestion = '';

  /* Optional live mode: free-text questions go to a small Cloudflare Worker (see worker/README.md).
     Everything else stays local, and guided mode is the fallback whenever the backend is missing or fails. */
  var AI_ENDPOINT = (window.LAUNCH_AI_ENDPOINT || 'https://launch1500-concierge.launch1500-concierge-worker.workers.dev').replace(/\/$/, '');
  var liveAi = false;
  var liveFailures = 0;
  var liveGeneration = 0; /* bumped by resetAll() so a reply for a cleared conversation is dropped */
  var liveHistory = []; /* [{ role: 'user' | 'assistant', content }] — question text and replies only, capped at 16 */
  var LIVE_PROBE_TIMEOUT = 4000;
  var LIVE_CHAT_TIMEOUT = 8000;

  var steps = [
    { key: 'business', en: 'What is your business or project called?', ar: 'ما اسم مشروعك أو نشاطك؟' },
    { key: 'goal', en: 'What should the website help customers do?', ar: 'ماذا تريد أن يفعل العملاء على موقعك؟', choices: core.GOALS },
    { key: 'pages', en: 'How many pages do you need? A starting estimate is fine.', ar: 'كم صفحة تحتاج؟ يكفي عدد مبدئي.', choices: [['1', '1'], ['4', '4'], ['6', '6'], ['10', '10'], ['Not sure yet', 'لست متأكداً']] },
    { key: 'features', en: 'What features or design style matter most? Mention examples, forms, a gallery or any integrations.', ar: 'ما الميزات أو أسلوب التصميم الذي تفضله؟ اذكر النماذج أو معرض الصور أو أي ربط تحتاجه.', choices: [['Clean and simple', 'بسيط وواضح'], ['Premium and visual', 'فاخر ويركز على الصور'], ['Needs scoping', 'يحتاج إلى مناقشة']] },
    { key: 'languages', en: 'Which languages should your website support?', ar: 'ما اللغات المطلوبة للموقع؟', choices: [['English only', 'الإنجليزية فقط'], ['Arabic and English', 'العربية والإنجليزية'], ['Discuss another language', 'مناقشة لغة أخرى']] },
    { key: 'budget', en: 'What is your approximate budget in AED? This helps flag a package that may be too expensive.', ar: 'ما ميزانيتك التقريبية بالدرهم؟ يساعد ذلك في تحديد ما إذا كانت الباقة أعلى من ميزانيتك.', choices: [['1,500', '1,500'], ['3,000', '3,000'], ['5,000', '5,000'], ['Flexible', 'مرنة']] },
    { key: 'deadline', en: 'When would you like to launch? This is a preference, not a confirmed delivery date.', ar: 'متى تود إطلاق الموقع؟ هذا موعد مفضل وليس موعد تسليم مؤكداً.', choices: [['As soon as possible', 'في أقرب وقت'], ['Within a month', 'خلال شهر'], ['Flexible', 'مرن']] },
    { key: 'assets', en: 'Do you already have a logo, website text, photos and a domain?', ar: 'هل لديك شعار ونصوص وصور واسم نطاق؟', choices: [['Everything is ready', 'كل شيء جاهز'], ['Some items are ready', 'بعض العناصر جاهزة'], ['I need help preparing them', 'أحتاج مساعدة في إعدادها']] },
    { key: 'name', en: 'What name should we use in your enquiry?', ar: 'ما الاسم الذي نستخدمه في استفسارك؟' }
  ];

  function findStep(key) {
    return steps.filter(function (item) { return item.key === key; })[0];
  }

  /* Matcher: three short questions (business is skipped when already known), then the two best-fitting demos */
  var matchSteps = [
    findStep('business'),
    { key: 'sector', en: 'What kind of business is it?', ar: 'ما نوع نشاطك؟', choices: core.SECTORS },
    findStep('goal')
  ];

  /* Chip answers for these keys are stored as the canonical EN label and translated at render time */
  var CHOICE_TABLES = { sector: core.SECTORS, goal: core.GOALS };
  function localizeChoice(key, value) {
    var table = CHOICE_TABLES[key] || [];
    for (var i = 0; i < table.length; i++) if (table[i][0] === value) return tr(table[i][0], table[i][1]);
    return value;
  }

  /* Details: collected before the WhatsApp handoff (business is skipped when already known) */
  var detailSteps = [
    findStep('business'),
    findStep('name'),
    { key: 'phone', en: 'Your WhatsApp number (optional), so the team can reply if the chat drops.', ar: 'رقم واتساب الخاص بك (اختياري) ليتمكن الفريق من الرد إذا انقطعت المحادثة.', choices: [['Skip', 'تخطي']] }
  ];
  var detailLabels = {
    business: ['Business name', 'اسم المشروع'],
    name: ['Contact name', 'الاسم'],
    phone: ['WhatsApp number', 'رقم واتساب']
  };

  /* Per-field caps keep the wa.me URL short; single-line fields cannot carry forged label lines */
  var LIMITS = { name: 80, business: 120, sector: 120, phone: 32, goal: 200 };
  var SINGLE_LINE = ['business', 'sector', 'goal', 'name', 'phone'];

  var facts = {
    greeting: [
      'Welcome to Launch1500. I am your Intelligent Client Concierge. I can answer questions about our packages, pricing, timelines, safe 30% deposit, bilingual Arabic support, custom AI integrations upon request, help you structure a tailored project brief, or match you with the best-fitting live demo. How may I assist your business today?',
      'أهلاً بك في Launch1500. أنا مساعد الكونسيرج الذكي لخدمة العملاء. يمكنني الإجابة عن استفساراتك حول الباقات، الأسعار، المواعيد، دفعة الـ 30% الآمنة، الدعم العربي ثنائي اللغة، حلول الذكاء الاصطناعي المخصصة بالطلب، تنظيم متطلبات موقعك، أو مطابقتك مع النموذج الحي الأنسب. كيف أستطيع مساعدتك اليوم؟'
    ],
    pricing: [
      'We offer five transparent packages tailored for UAE businesses:\n• Launch Lite — AED 1,500 (Clean single-page showcase)\n• Launch Basic — AED 2,000 (Multi-page business foundation)\n• Launch Plus — AED 3,000 (Booking forms, galleries & maps)\n• Launch Store — AED 4,000 (E-commerce catalog & WhatsApp orders)\n• Launch Premium — AED 5,000 (Bespoke luxury brand experience)\n\nEvery package includes 3 free credits (AED 300 value) for post-launch updates. No monthly software fees to us.',
      'لدينا خمس باقات واضحة ومحددة السعر للشركات:\n• Launch Lite — 1,500 درهم (موقع صفحة واحدة أنيق وسريع)\n• Launch Basic — 2,000 درهم (موقع متكامل متعدد الصفحات)\n• Launch Plus — 3,000 درهم (نماذج حجز ومعارض صور وخرائط)\n• Launch Store — 4,000 درهم (متجر وكتالوج وطلبات عبر واتساب)\n• Launch Premium — 5,000 درهم (تجربة فاخرة متكاملة للعلامات الراقية)\n\nتشمل كل باقة 3 نقاط مجانية (بقيمة 300 درهم) للتحديثات بعد الإطلاق دون أي رسوم شهرية إلزامية.'
    ],
    recommendation: [
      'Here is our curated package recommendation guide:\n• Salons, Clinics & Spas: Launch Plus (AED 3,000) for integrated booking and visual showcase.\n• Cafes, Restaurants & Roasteries: Launch Basic (AED 2,000) or Plus (AED 3,000) for menus, maps, and WhatsApp orders.\n• Luxury Retail, Perfumes & Boutiques: Launch Store (AED 4,000) or Premium (AED 5,000) for high-end catalogs.\n• Startups, Freelancers & Consultancies: Launch Lite (AED 1,500) for an immediate high-credibility web presence.',
      'إليك دليل التوصية للباقة الأنسب لمشروعك:\n• الصالونات والعيادات والسبا: باقة Plus (3,000 درهم) لنماذج الحجز وعرض الخدمات.\n• المطاعم والمقاهي والمحامص: باقة Basic (2,000 درهم) أو Plus (3,000 درهم) للقوائم والخرائط.\n• المتاجر والعطور والمنتجات الفاخرة: باقة Store (4,000 درهم) أو Premium (5,000 درهم) للكتالوج والطلبات.\n• الشركات الناشئة والاستشارات: باقة Lite (1,500 درهم) لظهور رقمي سريع واحترافي.'
    ],
    payment: [
      'Our payment policy is strictly client-first and transparent: You pay a 30% deposit only after reviewing and approving a written project specification on WhatsApp. The remaining 70% balance is payable only upon completion and approval prior to public launch or file handover. There are never any surprise charges.',
      'الدفعة الأولى 30% من الإجمالي المتفق عليه بعد التأكيد الكتابي، والمتبقي 70% قبل الإطلاق أو التسليم. لا أستقبل دفعات ولا أؤكد دفعاً أو موافقة أو استرداداً. يؤكد الفريق هذه التفاصيل عبر واتساب.'
    ],
    hosting: [
      'We launch your website on reliable, ultra-fast hosting architectures where basic hosting costs AED 0 to start. Domain registration, paid third-party platforms, or dedicated cloud subscriptions remain under your direct ownership. The team assists with connecting your custom .ae or .com domain.',
      'اسم النطاق والاستضافة المدفوعة واشتراكات الأطراف الأخرى ورسومها غير مشمولة. قد تناسب الاستضافة المجانية موقعاً بسيطاً ضمن حدود المزود. يجب تأكيد الإعداد والتكاليف المتكررة كتابياً.'
    ],
    timing: [
      'Estimated turnaround times upon receiving the 30% deposit and your content:\n• Launch Lite: ~5 working days\n• Launch Basic: ~7 working days\n• Launch Plus: ~10 working days\n• Launch Store: ~14 working days\n• Launch Premium: ~21 working days\n\nCustom add-ons or bilingual translations may adjust delivery dates, which our team confirms in writing.',
      'المدد المذكورة تقريبية: 5 أيام عمل لـLite و7 لـBasic و10 لـPlus و14 لـStore و21 لـPremium، بعد استلام الدفعة والمحتوى. قد تزيد الإضافات المدة. يؤكد الفريق الجدول الفعلي.'
    ],
    privacy: [
      'This guided conversation stays in this tab and is not saved after a reload. No cloud AI is connected. Only the editable brief you approve is opened in WhatsApp. Do not enter passwords, card details, patient data or other sensitive information.',
      'تبقى هذه المحادثة الموجهة في التبويب وتختفي عند إعادة التحميل. لا يوجد اتصال بذكاء اصطناعي سحابي. يُفتح في واتساب فقط الملخص الذي تراجعه وتوافق عليه. لا تدخل كلمات مرور أو بيانات بطاقات أو بيانات مرضى أو معلومات حساسة.'
    ],
    ai: [
      '✦ Bespoke AI Architecture & Automations — Available Upon Request\n\nWe design and deploy custom AI solutions tailored to your business, including:\n• Intelligent website customer service concierges\n• Automated WhatsApp booking and lead assistants\n• Custom workflow integrations with internal CRMs\n\nBecause production AI requires tailored data privacy, security, and hosting models, our engineers scope and quote bespoke AI deployments upon request following a technical discovery consultation. I can include custom AI scoping in your project notes.',
      '✦ حلول الذكاء الاصطناعي والأتمتة المخصصة — متاحة عند الطلب\n\nنبتكر حلول ذكاء اصطناعي متقدمة مخصصة لنشاطك، ومنها:\n• كونسيرج خدمة عملاء ذكي على الموقع الإلكتروني\n• أتمتة الردود وحجز المواعيد عبر واتساب\n• ربط سير العمل بالأنظمة الإدارية الخاصة\n\nنظراً لأن أنظمة الذكاء الاصطناعي تتطلب دراسة متأنية لخصوصية البيانات والبنية السحابية، يقدم فريقنا عروض حلول الذكاء الاصطناعي عند الطلب بعد جلسة استشارة فنية متخصصة. يسعدني إضافة متطلبات الذكاء الاصطناعي إلى ملخصك.'
    ],
    demos: [
      'Explore our three live interactive example websites to experience real speed, design aesthetics, and user flows:\n• AED 1,500 — Luma Studio (one-page studio)\n• AED 3,000 — Noura Wellness (appointment-led)\n• AED 5,000 — Aurum Collection (premium catalogue)\n\nBookings, orders and assistant replies inside the demos are examples, not live services.',
      'ثلاثة نماذج حية تفاعلية لتجربة السرعة والتصميم ومسارات الاستخدام:\n• 1,500 درهم — استوديو لوما (استوديو بصفحة واحدة)\n• 3,000 درهم — نورا للعافية (موقع للحجوزات)\n• 5,000 درهم — مجموعة أوروم (كتالوج فاخر)\n\nالحجوزات والطلبات وردود المساعد فيها تجريبية وليست خدمات فعلية.'
    ],
    arabic: [
      'Every Launch1500 website can be delivered with full Arabic and bilingual English/Arabic capabilities. We craft genuine right-to-left (RTL) typography, native Arabic font pairings (such as Cairo & Amiri), and seamless language toggling. You can add the Arabic version to any package.',
      'جميع مواقعنا تدعم اللغة العربية بالكامل والتصميم ثنائي اللغة (عربي وإنجليزي) باتجاه صحيح من اليمين إلى اليسار (RTL)، مع خطوط عربية فاخرة وتجربة تصفح متقنة. يمكن إضافة النسخة العربية لأي باقة.'
    ],
    revisions: [
      'Every package comes with 3 free credits (worth AED 300) included for text changes, image updates, or tweaks after launch. Subsequent updates start at just 1 credit (AED 100) on demand, or you can opt for our monthly care plan (3 credits / AED 300 per month) with zero lock-in.',
      'تشمل كل باقة 3 نقاط مجانية (بقيمة 300 درهم) لتحديث وتعديل الموقع بعد الإطلاق. التحديثات الإضافية تبدأ من 100 درهم (نقطة واحدة) حسب الحاجة، كما تتوفر خطة عناية شهرية اختيارية (300 درهم/شهر) دون أي التزام.'
    ],
    human: [
      'I can prepare your brief for human review. Nothing has been sent or approved yet. Unusual requirements, final delivery dates, payments and external integrations must be confirmed by our team.',
      'أجهز الملخص للمراجعة البشرية. لم يُرسل شيء ولم يُعتمد أي طلب بعد. يؤكد الفريق المتطلبات الخاصة والمواعيد النهائية والدفعات والربط الخارجي.'
    ],
    comparison: [
      '✦ Agency Quality Without Agency Invoice\nTraditional agencies charge AED 25,000+ with complex consulting cycles and opaque fees. Launch1500 delivers agency-grade digital architecture starting from AED 1,500, with a 30% written milestone deposit (AED 450), 5–10 day turnaround, and direct WhatsApp partnership.',
      '✦ جودة الوكالات الكبرى بدون تكلفة الوكالات\nتطلب الوكالات التقليدية عادة أكثر من 25,000 درهم مع دورات استشارية معقدة ورسوم صيانة غامضة. في Launch1500 نقدم لك نفس الجودة الرفيعة ابتداءً من 1,500 درهم فقط، بدفعة أولى 30% (450 درهم)، وتسليم سريع خلال 5–10 أيام، وشراكة مباشرة عبر واتساب.'
    ],
    qr: [
      'Experience our live website on your smartphone right now at ' + siteUrl + ' or scan our high-definition luxury QR code on this page. Direct WhatsApp line: +971 50 392 3733.',
      'يمكنك تجربة الموقع مباشرة على هاتفك الذكي عبر الرابط: ⁦' + siteUrl + '⁩ أو مسح رمز الاستجابة الفاخر (QR Code) الموجود في الصفحة. للتواصل المباشر عبر واتساب: ⁦+971 50 392 3733⁩.'
    ]
  };

  /* Shown instead of facts.privacy while live mode is connected (answer() picks the variant at call time) */
  var PRIVACY_LIVE = [
    'Questions are answered by an AI model through our server. Your brief stays in this tab; only your question text, your business name and general business type/goal/package are sent. Avoid entering passwords or cards. The guided brief, estimate and WhatsApp handoff work exactly the same.',
    'تُجاب الأسئلة بواسطة نموذج ذكاء اصطناعي عبر خادمنا. تبقى متطلبات مشروعك في هذا التبويب؛ يُرسل نص سؤالك واسم نشاطك ونوع النشاط والهدف والباقة فقط. تجنب إدخال كلمات المرور أو أرقام البطاقات. تعمل المتطلبات الموجهة والتقدير والتحويل إلى واتساب بالطريقة نفسها تماماً.'
  ];

  function ar() { return document.documentElement.lang === 'ar'; }
  function tr(en, arabic) { return ar() ? arabic : en; }

  function element(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function money(value) {
    return ar() ? value.toLocaleString('en-US') + ' درهم' : 'AED ' + value.toLocaleString('en-US');
  }

  function oneLine(text) { return String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); }
  /* Continuation lines are indented so multi-line user text can never masquerade as a label line */
  function multiLine(text) { return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').join('\n  '); }
  function truncate(text, max) {
    var value = oneLine(text);
    return value.length > max ? value.slice(0, max).trim() + '…' : value;
  }

  /* Keeps a phone number (with its leading +) in reading order inside Arabic text */
  function ltr(text) { return ar() ? '⁦' + text + '⁩' : text; }

  function demoName(demo) { return tr(demo.name[0], demo.name[1]); }
  function demoConcept(demo) { return tr(demo.concept[0], demo.concept[1]); }
  function demoLabel(demo) { return demoName(demo) + ' · ' + money(demo.tier); }
  function demoUrl(demo) { return new URL(demo.url, base).href; }

  function iconButton(icon, en, arabic, action) {
    var button = element('button', 'la-icon');
    button.type = 'button';
    button.title = tr(en, arabic);
    button.setAttribute('aria-label', button.title);
    var image = element('img');
    image.src = new URL('assets/icons/' + icon + '.svg', base).href;
    image.alt = '';
    button.append(image);
    button.addEventListener('click', action);
    return button;
  }

  /* Construct Luxury Concierge Floating Trigger */
  var trigger = element('button', 'launch-assistant-trigger');
  trigger.id = 'launchAssistantTrigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'launchAssistant');

  var triggerIconWrap = element('div', 'la-trigger-icon');
  var triggerImg = element('img');
  triggerImg.src = new URL('assets/icons/concierge-luxury.svg', base).href;
  triggerImg.alt = '';
  var triggerPulse = element('span', 'la-trigger-pulse');
  triggerIconWrap.append(triggerImg, triggerPulse);

  var triggerLabel = element('div', 'la-trigger-label');
  var triggerTitle = element('span', 'la-trigger-title');
  var triggerSub = element('span', 'la-trigger-sub');
  triggerLabel.append(triggerTitle, triggerSub);

  trigger.append(triggerIconWrap, triggerLabel);

  /* Construct Assistant Dialog Window */
  var dialog = element('dialog', 'launch-assistant');
  dialog.id = 'launchAssistant';
  dialog.setAttribute('aria-labelledby', 'laTitle');

  var header = element('div', 'la-header');
  var branding = element('div', 'la-header-branding');
  var avatarFrame = element('div', 'la-avatar-frame');
  var avatarImg = element('img');
  avatarImg.src = new URL('assets/icons/concierge-luxury.svg', base).href;
  avatarImg.alt = '';
  avatarFrame.append(avatarImg);

  var headingMeta = element('div', 'la-header-meta');
  var title = element('h2');
  title.id = 'laTitle';
  var status = element('p', 'la-status');
  headingMeta.append(title, status);
  branding.append(avatarFrame, headingMeta);

  var toolbar = element('div', 'la-tools');
  toolbar.append(
    iconButton('minus', 'Minimize conversation', 'تصغير المحادثة', close),
    iconButton('x', 'Close conversation', 'إغلاق المحادثة', close)
  );
  header.append(branding, toolbar);

  var progress = element('p', 'la-progress');
  var body = element('div', 'la-body');
  var log = element('div', 'la-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  var options = element('div', 'la-options');
  var review = element('div', 'la-review');
  body.append(log, options, review);

  var form = element('form', 'la-form');
  var input = element('textarea');
  input.maxLength = 1200;
  input.rows = 2;

  var send = element('button', 'la-icon');
  send.type = 'button';
  send.title = tr('Send message', 'إرسال الرسالة');
  send.setAttribute('aria-label', send.title);
  var sendImg = element('img');
  sendImg.src = new URL('assets/icons/send.svg', base).href;
  sendImg.alt = '';
  send.append(sendImg);
  send.addEventListener('click', function () { form.requestSubmit(); });

  form.append(input, send);
  var privacy = element('p', 'la-fineprint');
  dialog.append(header, progress, body, form, privacy);
  document.body.append(trigger, dialog);

  function activeSteps() {
    if (flow === 'match') return matchSteps;
    if (flow === 'details') return detailSteps;
    return steps;
  }

  function stepLabel(current, total) {
    return current + ' / ' + total;
  }

  function ribbon() {
    if (flow === 'custom') return tr('Custom request', 'طلب مخصص');
    if (flow === 'match' && step >= 0) return tr('Best-fit demo · ', 'النموذج الأنسب · ') + stepLabel(step + 1, matchSteps.length);
    if (flow === 'details' && step >= 0) {
      var skip = step >= detailsOffset ? detailsOffset : 0;
      return tr('Your details · ', 'بياناتك · ') + stepLabel(step + 1 - skip, detailSteps.length - skip);
    }
    if (flow === 'brief' && step >= 0) return tr('Project brief · ', 'متطلبات المشروع · ') + stepLabel(step + 1, steps.length);
    if (view === 'picks') return tr('Best-fit demo · choose a direction', 'النموذج الأنسب · اختر اتجاهاً');
    if (view === 'handoff') return tr('Your enquiry summary', 'ملخص استفسارك');
    return tr('Customer Service Concierge · Ready to Assist', 'كونسيرج خدمة العملاء · متصل لمساعدتك');
  }

  function chrome() {
    title.textContent = tr('Launch Concierge', 'كونسيرج Launch1500');
    triggerTitle.textContent = tr('✦ Concierge', '✦ كونسيرج الذكي');
    triggerSub.textContent = tr('Live Assistance & Scoping', 'خدمة العملاء والتخطيط');
    if (liveAi) {
      status.textContent = tr('Intelligent Service · Live AI · 24/7', 'خدمة عملاء ذكية · ذكاء اصطناعي مباشر · 24/7');
      privacy.textContent = tr(
        'Questions are answered by an AI model through our server. Your brief stays in this tab; only your question text, your business name and general business type/goal/package are sent. Avoid entering passwords or cards.',
        'تُجاب الأسئلة بواسطة نموذج ذكاء اصطناعي عبر خادمنا. تبقى متطلبات مشروعك في هذا التبويب؛ يُرسل نص سؤالك واسم نشاطك ونوع النشاط والهدف والباقة فقط. تجنب إدخال كلمات المرور أو أرقام البطاقات.'
      );
    } else {
      status.textContent = tr('Intelligent Service · Guided Mode', 'خدمة عملاء ذكية · وضع موجه');
      privacy.textContent = tr(
        'Confidential in-tab session. No unapproved data is shared. Avoid entering sensitive passwords or cards.',
        'جلسة خاصة في هذا التبويب فقط. لا تُشارك أي بيانات تلقائياً. تجنب إدخال كلمات المرور أو أرقام البطاقات.'
      );
    }
    if (flow === 'custom') input.placeholder = tr('Describe the pages, features or style you need…', 'اكتب الصفحات أو الميزات أو الأسلوب الذي تحتاجه…');
    else input.placeholder = flow && step >= 0 ? tr('Your answer or any customer question…', 'إجابتك أو أي استفسار…') : tr('Ask anything about packages, AI or prices…', 'اسأل عن الباقات أو الأسعار أو الذكاء الاصطناعي…');
    input.setAttribute('aria-label', tr('Message to customer service concierge', 'رسالة إلى كونسيرج خدمة العملاء'));
    /* A pending live reply keeps its typing bubble across a language switch; keep its announcement in sync */
    Array.prototype.forEach.call(log.querySelectorAll('.la-typing'), function (bubble) {
      bubble.setAttribute('aria-label', tr('Assistant is typing', 'المساعد يكتب'));
      var sr = bubble.querySelector('.la-sr-only');
      if (sr) sr.textContent = tr('Assistant is typing', 'المساعد يكتب');
    });
    progress.textContent = ribbon();
    toolbar.children[0].title = toolbar.children[0].ariaLabel = tr('Minimize conversation', 'تصغير المحادثة');
    toolbar.children[1].title = toolbar.children[1].ariaLabel = tr('Close conversation', 'إغلاق المحادثة');
    send.title = send.ariaLabel = tr('Send message', 'إرسال الرسالة');
  }

  function scroll() { body.scrollTop = body.scrollHeight; }

  function say(text, user) {
    log.append(element('p', 'la-message' + (user ? ' user' : ''), text));
    while (log.childElementCount > 80) {
      var first = log.firstElementChild;
      if (first === picksNode) first = first.nextElementSibling;
      if (!first) break;
      first.remove();
    }
    scroll();
  }

  function option(en, arabic, action) {
    var button = element('button', '', tr(en, arabic));
    button.type = 'button';
    button.addEventListener('click', action);
    options.append(button);
    return button;
  }

  /* Kept short on purpose: anything else is answered from the message box */
  function quickTopics() {
    option('Packages & prices', 'الباقات والأسعار', function () { answer('pricing'); });
    option('Which package suits me?', 'ما الباقة المناسبة لي؟', function () { answer('recommendation'); });
    option('View live examples', 'شاهد النماذج الحية', function () { answer('demos'); });
  }

  function home() {
    flow = null;
    step = -1;
    editOnly = false;
    view = 'home';
    lockPicks(picksNode);
    picksNode = null;
    picksState = null;
    chrome();
    options.replaceChildren();
    option('Find my best-fit demo', 'اختر النموذج الأنسب لي', function () { startMatcher(); });
    option('Build my project brief', 'جهز متطلبات مشروعي', function () { askNext(); });
    if (brief.package) option('Review my estimate', 'راجع تقديري', showReview);
    if (brief.demo || brief.customRequest) option('Review my enquiry', 'راجع استفساري', function () { askDetails(); });
    quickTopics();
  }

  function answer(topic) {
    var fact = topic === 'privacy' && liveAi ? PRIVACY_LIVE : facts[topic];
    if (fact) {
      say(tr(fact[0], fact[1]));
    } else if (liveAi) {
      /* Live mode is connected (the question may just have been sent to the server), so the guided
         "I run locally" sentence would be untrue here; the guided string below stays byte-identical. */
      say(tr('I do not have a guided answer for that yet. You can add it to your project notes for the team to review, or continue to WhatsApp.', 'ليس لدي إجابة موجهة لهذا السؤال بعد. يمكنك إضافته إلى ملاحظات مشروعك ليراجعه الفريق، أو المتابعة إلى واتساب.'));
    } else {
      say(tr('I have added your inquiry to your project notes for our team review. I run locally in guided concierge mode without third-party web tracking.', 'أضفت استفسارك إلى ملاحظات مشروعك لمراجعة الفريق. أعمل محلياً بوضع كونسيرج موجه لحفظ خصوصيتك دون تتبع خارجي.'));
    }
    followUps(topic, lastQuestion);
  }

  /* Follow-up links and chips shared by the local answer() and the live askLive() paths */
  function followUps(topic, question) {
    if (topic === 'demos') {
      var links = element('div', 'la-demo-links');
      core.DEMOS.forEach(function (demo) {
        var link = element('a', '', tr('Open ', 'افتح نموذج ') + money(demo.tier) + tr(' live demo', ' الحي') + ' · ' + demoName(demo));
        link.href = demoUrl(demo);
        link.target = '_blank';
        link.rel = 'noopener';
        links.append(link);
      });
      log.append(links);
      option('Help me choose between them', 'ساعدني في الاختيار بينها', function () { startMatcher(); });
    }

    if (!topic || topic === 'ai' || topic === 'recommendation') {
      option('Add to project notes for consultation', 'أضف للاستشارة في متطلبات المشروع', function () {
        brief.notes = [brief.notes, question || topic].filter(Boolean).join('\n').slice(0, 2400);
        say(tr('Added to your unsent brief for team review.', 'أضيف إلى ملخص مشروعك للمراجعة مع الفريق.'));
        if (view === 'review') showReview();
        else if (view === 'handoff') showHandoff();
      });
    }
    scroll();
  }

  /* ---------- Live AI (optional; guided mode is the fallback) ---------- */

  /* One-time GET /health after the welcome. Never runs on file:// pages; any failure leaves guided mode untouched. */
  function probeLive() {
    if (location.protocol === 'file:' || !window.fetch || !window.AbortController) return;
    if (/REPLACE_ME/.test(AI_ENDPOINT)) return;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, LIVE_PROBE_TIMEOUT);
    fetch(AI_ENDPOINT + '/health', { method: 'GET', mode: 'cors', signal: controller.signal })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (data && data.ok && data.live === true) {
          liveAi = true;
          chrome();
        }
      })
      .catch(function () { /* stay guided, silently */ })
      .then(function () { clearTimeout(timer); });
  }

  function typingBubble() {
    var bubble = element('p', 'la-message la-typing');
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-label', tr('Assistant is typing', 'المساعد يكتب'));
    for (var i = 0; i < 3; i++) bubble.append(element('span'));
    /* Live regions announce text content, not aria-label */
    bubble.append(element('span', 'la-sr-only', tr('Assistant is typing', 'المساعد يكتب')));
    return bubble;
  }

  /* Server limits: user-first history, each turn ≤ 1200 chars, ≤ 8000 chars in total */
  var LIVE_TURN_CHARS = 1200;
  var LIVE_HISTORY_CHARS = 8000;
  function historyChars(list) {
    return list.reduce(function (sum, turn) { return sum + turn.content.length; }, 0);
  }

  /* Sends only the question text, the recent question/reply turns, the business name and the general
     business type / goal / package. Name, phone, notes, custom requests and the WhatsApp draft never leave the page. */
  function askLive(text) {
    var gen = liveGeneration;
    say(text, true);
    var typing = typingBubble();
    log.append(typing);
    scroll();
    var topic = core.topic(text);
    var history = liveHistory.concat([{ role: 'user', content: text }]).slice(-8);
    while (history.length > 1 && (history[0].role !== 'user' || historyChars(history) > LIVE_HISTORY_CHARS)) history.shift();
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, LIVE_CHAT_TIMEOUT);
    var httpStatus = 0;
    fetch(AI_ENDPOINT + '/chat', {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: ar() ? 'ar' : 'en', messages: history, context: core.buildAiContext(brief) }),
      signal: controller.signal
    })
      .then(function (response) {
        httpStatus = response.status;
        if (!response.ok) throw new Error('http ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var reply = core.sanitizeReply(data && data.reply);
        if (!reply) throw new Error('empty');
        typing.remove();
        if (gen !== liveGeneration) return; /* conversation was reset while pending: drop silently */
        say(reply);
        /* Append to the live array (not the send-time snapshot) so two in-flight questions both survive */
        liveHistory = liveHistory.concat([{ role: 'user', content: text }, { role: 'assistant', content: reply.slice(0, LIVE_TURN_CHARS) }]).slice(-16);
        liveFailures = 0;
        followUps(topic, text);
      })
      .catch(function () {
        typing.remove();
        if (gen !== liveGeneration) return; /* conversation was reset while pending: no fallback answer either */
        if (httpStatus === 429) {
          say(facts[topic]
            ? tr('The live assistant is busy right now — here is the guided answer instead.', 'المساعد المباشر مشغول حالياً — إليك الإجابة الموجهة بدلاً من ذلك.')
            : tr('The live assistant is busy right now. Please try again in a moment, or use the options below.', 'المساعد المباشر مشغول حالياً. حاول مرة أخرى بعد قليل أو استخدم الخيارات أدناه.'));
          answer(topic);
          return;
        }
        liveFailures++;
        if (liveFailures >= 2) {
          liveAi = false;
          chrome();
        }
        answer(topic);
      })
      .then(function () { clearTimeout(timer); });
  }

  function askNext() {
    review.replaceChildren();
    flow = 'brief';
    step = steps.findIndex(function (item) { return !brief[item.key]; });
    if (step === -1) {
      if (brief.package && brief.demo) showReview();
      else choosePackage();
      return;
    }
    askCurrent();
  }

  function startMatcher() {
    review.replaceChildren();
    lockPicks(picksNode);
    picksNode = null;
    picksState = null;
    editOnly = false;
    nextMatchStep();
  }

  function nextMatchStep() {
    flow = 'match';
    step = matchSteps.findIndex(function (item) { return !brief[item.key]; });
    if (step === -1) { showDemoMatch(); return; }
    askCurrent();
  }

  function askDetails() {
    review.replaceChildren();
    if (flow !== 'details') detailsOffset = brief.business ? 1 : 0;
    flow = 'details';
    editOnly = false;
    step = detailSteps.findIndex(function (item) {
      return item.key === 'phone' ? brief.phone === undefined : !brief[item.key];
    });
    if (step === -1) { showHandoff(); return; }
    askCurrent();
  }

  function changeDemo() {
    if (!picksState) { startMatcher(); return; }
    /* Move the existing cards below the latest messages instead of appending a duplicate block */
    if (picksNode) picksNode.remove();
    picksNode = null;
    say(tr('Here are your demo options again.', 'إليك خيارات النماذج مرة أخرى.'));
    showDemoMatch({ rerender: true });
  }

  function changeAnswers() {
    var keep = brief.business;
    ['sector', 'goal', 'demo', 'customRequest', 'considered'].forEach(function (key) { delete brief[key]; });
    if (packageFromDemo) { delete brief.package; packageFromDemo = false; }
    if (keep) brief.business = keep;
    startMatcher();
  }

  function askCurrent() {
    view = 'question';
    chrome();
    options.replaceChildren();
    var list = activeSteps();
    var item = list[step];
    if (!item) { home(); return; }
    say(tr(item.en, item.ar));
    (item.choices || []).forEach(function (choice) {
      option(choice[0], choice[1], function () {
        if (choice[2] === 'other') {
          say(tr('Type it in a few words.', 'اكتبه في كلمات قليلة.'));
          input.focus();
          return;
        }
        /* sector / goal chips are stored as the EN label (translated on render); other chips keep the shown label */
        if (CHOICE_TABLES[item.key]) accept(choice[0], tr(choice[0], choice[1]));
        else accept(tr(choice[0], choice[1]));
      });
    });
    option('Ask a question', 'اطرح سؤالاً', function () { answer('recommendation'); quickTopics(); input.focus(); });
    if (flow === 'details') {
      if (brief.demo || brief.customRequest) option('Change demo', 'غيّر النموذج', changeDemo);
    } else if (step > 0) {
      option('Previous answer', 'الإجابة السابقة', function () { step--; editOnly = true; askCurrent(); });
    }
    input.focus();
    scroll();
  }

  function accept(text, shown) {
    var list = activeSteps();
    var item = list[step];
    if (!item) return;
    if (SINGLE_LINE.indexOf(item.key) !== -1) text = oneLine(text);
    text = text.trim().slice(0, LIMITS[item.key] || 1200);
    if (!text) return;
    if ((item.key === 'business' || item.key === 'name') && text.length < 2) {
      say(tr('Please enter at least two characters.', 'يرجى إدخال حرفين على الأقل.'));
      return;
    }
    if (item.key === 'phone') {
      var phone = core.parsePhone(text);
      if (!phone) {
        say(tr('Please enter a number with at least 7 digits, e.g. 0501234567, or choose Skip.', 'أدخل رقماً من 7 أرقام على الأقل، مثل 0501234567، أو اختر تخطي.'));
        return;
      }
      brief.phone = phone.skip ? null : phone.value;
      say(phone.skip ? tr('Skip', 'تخطي') : phone.value, true);
      input.value = '';
      editOnly = false;
      askDetails();
      return;
    }
    brief[item.key] = text;
    if (item.key === 'languages') {
      brief.addons = brief.addons.filter(function (id) { return id !== 'arabic'; });
      if (/arabic|عربي/i.test(text)) brief.addons.push('arabic');
    }
    say(shown || text, true);
    input.value = '';
    editOnly = false;
    if (flow === 'match') nextMatchStep();
    else if (flow === 'details') askDetails();
    else askNext();
  }

  /* ---------- Demo matcher screens ---------- */

  /* Decorative arrow, hidden from screen readers so link names stay clean */
  function arrowGlyph() {
    var arrow = element('span', '', tr('↗', '↖'));
    arrow.setAttribute('aria-hidden', 'true');
    return arrow;
  }

  function demoCard(result, best) {
    var demo = core.demoById(result.id);
    var card = element('article', 'la-demo-pick' + (best ? ' is-best' : ''));
    card.setAttribute('aria-label', demoName(demo));
    var top = element('div', 'la-pick-top');
    if (best) top.append(element('span', 'la-pick-badge', tr('Best match', 'الأنسب')));
    top.append(element('span', 'la-pick-concept', demoConcept(demo)), element('span', 'la-pick-tier', money(demo.tier)));
    card.append(top, element('h4', '', demoName(demo)), element('p', 'la-pick-desc', tr(demo.description[0], demo.description[1])));
    var reasons = element('ul', 'la-pick-reasons');
    result.reasons.slice(0, 2).forEach(function (reason) { reasons.append(element('li', '', tr(reason[0], reason[1]))); });
    card.append(reasons);
    var actions = element('div', 'la-pick-actions');
    var preview = element('a', 'la-pick-preview', tr('Preview ', 'معاينة '));
    preview.append(arrowGlyph());
    preview.setAttribute('aria-label', tr('Preview ', 'معاينة ') + demoName(demo) + tr(' (opens in a new tab)', ' (يفتح في تبويب جديد)'));
    preview.href = demoUrl(demo);
    preview.target = '_blank';
    preview.rel = 'noopener';
    var choose = element('button', 'la-pick-choose', tr('Choose this one', 'اختر هذا النموذج'));
    choose.type = 'button';
    choose.setAttribute('aria-label', tr('Choose ', 'اختر ') + demoLabel(demo));
    choose.addEventListener('click', function () {
      if (choose.disabled) return;
      lockPicks(card.parentNode);
      chooseDemo(demo.id);
    });
    actions.append(preview, choose);
    card.append(actions);
    return card;
  }

  function customCard() {
    var card = element('article', 'la-demo-pick la-demo-custom');
    card.setAttribute('aria-label', tr('Written request', 'طلب مكتوب'));
    var top = element('div', 'la-pick-top');
    top.append(element('span', 'la-pick-tag', tr('Written request · not a live demo', 'طلب مكتوب · ليس نموذجاً حياً')));
    card.append(top, element('h4', '', tr('Need something different?', 'تحتاج شيئاً مختلفاً؟')));
    card.append(element('p', 'la-pick-desc', tr('Tell the team what you need. It is reviewed before any quote.', 'اكتب للفريق ما تحتاجه، ويُراجع قبل أي عرض سعر.')));
    var actions = element('div', 'la-pick-actions');
    var describe = element('button', 'la-pick-choose la-pick-describe', tr('Describe my request', 'اكتب طلبي'));
    describe.type = 'button';
    describe.addEventListener('click', function () {
      if (describe.disabled) return;
      lockPicks(card.parentNode);
      askCustomRequest();
    });
    actions.append(describe);
    card.append(actions);
    return card;
  }

  function lockPicks(node) {
    if (!node) return;
    node.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
  }

  function buildPicks() {
    var wrap = element('div', 'la-demo-picks');
    var shown = picksState.thirdShown ? picksState.results : picksState.results.slice(0, 2);
    shown.forEach(function (result, index) { wrap.append(demoCard(result, index === 0)); });
    wrap.append(customCard());
    return wrap;
  }

  function renderPicks() {
    var fresh = buildPicks();
    if (picksNode && picksNode.isConnected) picksNode.replaceWith(fresh);
    else log.append(fresh);
    picksNode = fresh;
  }

  function picksChips() {
    options.replaceChildren();
    option('Describe what I need instead', 'اكتب طلبك بدلاً من ذلك', function () {
      lockPicks(picksNode);
      askCustomRequest();
    });
    if (!picksState.thirdShown) {
      option('Show the third demo', 'اعرض النموذج الحي الثالث', function () {
        picksState.thirdShown = true;
        /* Append only the new card (not a full rebuild) so the live region announces one card and focus is kept */
        var third = demoCard(picksState.results[2], false);
        third.tabIndex = -1;
        var custom = picksNode.querySelector('.la-demo-custom');
        if (custom) picksNode.insertBefore(third, custom); else picksNode.append(third);
        picksChips();
        third.focus();
        scroll();
      });
    }
    option('Change my answers', 'غيّر إجاباتي', changeAnswers);
  }

  function showDemoMatch(opts) {
    var rerender = Boolean(opts && opts.rerender && picksState);
    review.replaceChildren();
    flow = null;
    step = -1;
    editOnly = false;
    view = 'picks';
    chrome();
    if (!rerender) {
      picksState = { results: core.matchDemos(brief), thirdShown: false };
      picksNode = null;
      say(tr('Based on your answers, these two directions fit you best. Preview them, then choose one — or describe what you need instead.', 'بناءً على إجاباتك، هذان الاتجاهان هما الأنسب لك. عاينهما ثم اختر واحداً — أو اكتب ما تحتاجه بدلاً من ذلك.'));
    }
    renderPicks();
    picksChips();
    scroll();
  }

  function chooseDemo(id) {
    var demo = core.demoById(id);
    if (!demo) return;
    brief.demo = demo.id;
    brief.package = demo.package;
    packageFromDemo = true;
    brief.customRequest = '';
    if (picksState) {
      var shown = picksState.thirdShown ? picksState.results : picksState.results.slice(0, 2);
      brief.considered = shown.map(function (result) { return result.id; }).filter(function (other) { return other !== demo.id; });
    }
    brief.source = 'matcher';
    say(tr('Chosen: ', 'اخترت: ') + demoLabel(demo), true);
    askDetails();
  }

  function askCustomRequest() {
    review.replaceChildren();
    options.replaceChildren();
    flow = 'custom';
    step = -1;
    editOnly = false;
    view = 'custom';
    chrome();
    say(tr('Tell me what you need — the pages, features or style you have in mind. This is a written request for the team, not a live demo, and it is reviewed before any quote.', 'اكتب ما تحتاجه — الصفحات أو الميزات أو الأسلوب الذي تفكر فيه. هذا طلب مكتوب للفريق وليس نموذجاً حياً، ويُراجع قبل أي عرض سعر.'));
    option('Back to the demos', 'العودة إلى النماذج', changeDemo);
    input.focus();
    scroll();
  }

  function acceptCustom(text) {
    text = text.replace(/\r\n?/g, '\n').trim().slice(0, 1200);
    if (!text) return;
    if (text.length < 10) {
      say(tr('Please add a little more detail (at least 10 characters).', 'أضف مزيداً من التفاصيل من فضلك (10 أحرف على الأقل).'));
      return;
    }
    brief.customRequest = text;
    brief.demo = null;
    delete brief.considered;
    if (packageFromDemo) { delete brief.package; packageFromDemo = false; }
    brief.source = 'matcher';
    say(text, true);
    input.value = '';
    if (core.encodedLength(text) > core.LONG_TEXT_ENCODED) {
      say(tr('That is a long request. WhatsApp may cut very long messages, so you can shorten it or copy it from the summary screen.', 'طلبك طويل. قد يقتطع واتساب الرسائل الطويلة جداً، لذا يمكنك اختصاره أو نسخه من شاشة الملخص.'));
    }
    askDetails();
  }

  function choosePackage() {
    flow = null;
    step = -1;
    view = 'package';
    chrome();
    options.replaceChildren();
    var suggestion = core.recommend(brief);
    say(tr('Based on these requirements, ', 'بناءً على هذه المتطلبات، باقة ') + catalog.packages[suggestion].name + tr(' is a starting point. Choose a package below; custom requirements still need team review.', ' نقطة بداية مناسبة. اختر باقة أدناه؛ المتطلبات الخاصة تحتاج مراجعة الفريق.'));
    Object.keys(catalog.packages).forEach(function (key) {
      var pack = catalog.packages[key];
      option(pack.name + ' · AED ' + pack.price.toLocaleString('en-US'), pack.name + ' · ' + pack.price.toLocaleString('en-US') + ' درهم', function () {
        /* A different package replaces the chosen demo so the message never pairs the two */
        if (brief.demo && core.demoById(brief.demo).package !== key) { delete brief.demo; delete brief.considered; }
        brief.package = key;
        packageFromDemo = false;
        showReview();
      });
    });
    scroll();
  }

  /* ---------- WhatsApp message builders ---------- */

  /* Only the flagship-card source tag carries meaning for the team; internal 'matcher' / 'url' values are not exposed */
  function sourceLines() {
    return /^WEB-DEMO-/.test(brief.source || '') ? [tr('Source: ', 'المصدر: ') + brief.source] : [];
  }

  function contactLines() {
    var lines = [];
    if (brief.business) lines.push(tr('Business: ', 'المشروع: ') + oneLine(brief.business));
    if (brief.sector) lines.push(tr('Business type: ', 'نوع النشاط: ') + oneLine(localizeChoice('sector', brief.sector)));
    if (brief.goal) lines.push(tr('Goal: ', 'الهدف: ') + oneLine(localizeChoice('goal', brief.goal)));
    if (brief.name) lines.push(tr('Contact name: ', 'الاسم: ') + oneLine(brief.name));
    if (brief.phone) lines.push(tr('WhatsApp: ', 'واتساب: ') + ltr(oneLine(brief.phone)));
    return lines;
  }

  function notesLines() {
    return brief.notes ? [tr('Notes for review: ', 'ملاحظات للمراجعة: ') + multiLine(brief.notes)] : [];
  }

  function trailer() {
    return tr('Please confirm scope, timeline and payment instructions in writing. No payment has been collected or verified.', 'يرجى تأكيد النطاق والمدة وتعليمات الدفع كتابياً. لم يتم تحصيل أو التحقق من أي دفعة.');
  }

  function buildDemoMessage(demo) {
    var lines = [tr('Launch1500 demo enquiry (not an order)', 'استفسار عن نموذج Launch1500 (ليس طلب شراء)')].concat(sourceLines(), ['']);
    lines = lines.concat(contactLines());
    lines.push('', tr('Chosen demo: ', 'النموذج المختار: ') + demoName(demo) + ' · ' + demoConcept(demo) + ' · ' + money(demo.tier));
    lines.push(tr('Package: ', 'الباقة: ') + catalog.packages[demo.package].name);
    lines.push(tr('Demo link: ', 'رابط النموذج: ') + demoUrl(demo));
    var considered = (brief.considered || []).map(core.demoById).filter(Boolean);
    if (considered.length) {
      lines.push(tr('Also considered: ', 'خيار آخر عُرض: ') + considered.map(demoLabel).join(' | '));
    }
    lines = lines.concat(notesLines());
    lines.push('', trailer());
    return lines.join('\n');
  }

  function buildCustomMessage() {
    var lines = [tr('Launch1500 custom request (not an order)', 'طلب مخصص من Launch1500 (ليس طلب شراء)')].concat(sourceLines(), ['']);
    lines = lines.concat(contactLines());
    lines.push('', tr('Request: ', 'الطلب: ') + multiLine(brief.customRequest || ''));
    lines.push(tr('Note: this request is outside the three live demos and needs team review before any quote.', 'ملاحظة: هذا الطلب خارج نطاق النماذج الحية الثلاثة ويحتاج مراجعة الفريق قبل أي عرض سعر.'));
    lines = lines.concat(notesLines());
    lines.push('', trailer());
    return lines.join('\n');
  }

  function buildMessage(quote) {
    var labels = {
      business: ['Business', 'المشروع'],
      sector: ['Business type', 'نوع النشاط'],
      name: ['Contact name', 'الاسم'],
      phone: ['Phone', 'الهاتف'],
      goal: ['Goal', 'الهدف'],
      pages: ['Pages requested', 'الصفحات المطلوبة'],
      features: ['Features / style', 'الميزات والتصميم'],
      languages: ['Languages', 'اللغات'],
      budget: ['Budget', 'الميزانية'],
      deadline: ['Preferred launch', 'موعد الإطلاق المفضل'],
      assets: ['Content readiness', 'جاهزية المحتوى'],
      notes: ['Notes for review', 'ملاحظات للمراجعة'],
      customRequest: ['Custom request', 'طلب مخصص']
    };
    var lines = [tr('Launch1500 project enquiry (not an order)', 'استفسار مشروع Launch1500 (ليس طلب شراء)'), ''];
    Object.keys(labels).forEach(function (key) {
      if (!brief[key]) return;
      var raw = localizeChoice(key, brief[key]);
      var value = SINGLE_LINE.indexOf(key) !== -1 ? oneLine(raw) : multiLine(raw);
      lines.push(tr(labels[key][0], labels[key][1]) + ': ' + value);
    });
    lines.push('', tr('Package: ', 'الباقة: ') + quote.name);
    var demo = brief.demo ? core.demoById(brief.demo) : null;
    if (demo) lines.push(tr('Chosen demo: ', 'النموذج المختار: ') + demoName(demo) + ' · ' + demoConcept(demo) + ' · ' + money(demo.tier));
    quote.extras.forEach(function (key) {
      var addon = catalog.addons[key];
      lines.push(tr('Extra: ', 'إضافة: ') + (ar() ? addon.nameAr : addon.name) + ' · ' + money(addon.price));
    });
    lines.push(tr('Provisional total: ', 'الإجمالي المبدئي: ') + money(quote.total));
    lines.push(tr('30% deposit after written confirmation: ', 'دفعة 30% بعد التأكيد الكتابي: ') + money(quote.deposit));
    lines.push(tr('70% before launch / handover: ', '70% قبل الإطلاق أو التسليم: ') + money(quote.balance));
    if (quote.monthly) lines.push(tr('Optional care, separate: ', 'عناية اختيارية منفصلة: ') + money(quote.monthly) + tr('/month', ' شهرياً'));
    lines.push('', tr('Please confirm scope, taxes, third-party fees, timeline and payment instructions in writing. No payment has been collected or verified. No founder approval is recorded.', 'يرجى تأكيد النطاق والضرائب ورسوم الأطراف الأخرى والمدة وتعليمات الدفع كتابياً. لم يتم تحصيل أو التحقق من دفعة، ولا توجد موافقة مؤسس مسجلة.'));
    return lines.join('\n');
  }

  /* ---------- Shared consent / preview / WhatsApp handoff block ---------- */

  function renderHandoff(messageText, blocked) {
    var label = element('label', '', tr('Review and edit the message', 'راجع الرسالة وعدلها'));
    label.htmlFor = 'laMessagePreview';
    var preview = element('textarea');
    preview.id = 'laMessagePreview';
    preview.value = messageText;
    preview.maxLength = 12000;

    var consentLabel = element('label', 'la-consent');
    var consent = element('input');
    consent.type = 'checkbox';
    consent.id = 'laConsent';
    consentLabel.append(consent, element('span', '', tr('I reviewed this draft and agree to open these details in WhatsApp for the Launch1500 team. Nothing is sent until I press Send there.', 'راجعت المسودة وأوافق على فتح هذه التفاصيل في واتساب لفريق Launch1500. لا تُرسل حتى أضغط إرسال هناك.')));

    var handoff = element('button', 'la-handoff', tr('Continue to WhatsApp', 'تابع إلى واتساب'));
    handoff.type = 'button';
    handoff.disabled = true;

    var feedback = element('p', 'la-feedback');
    feedback.setAttribute('role', 'status');

    /* Holds the long-message warning, a direct link when pop-ups are blocked and the copy button.
       Built only after consent is checked; cleared whenever the draft changes or consent is withdrawn. */
    var extra = element('div', 'la-handoff-extra');

    function copyButton() {
      var button = element('button', 'la-copy', tr('Copy message', 'انسخ الرسالة'));
      button.type = 'button';
      button.addEventListener('click', function () {
        var text = preview.value.trim();
        var done = function () { feedback.textContent = tr('Message copied. Paste it into WhatsApp.', 'نُسخت الرسالة. الصقها في واتساب.'); };
        var fallback = function () {
          preview.focus();
          preview.select();
          var copied = false;
          try { copied = document.execCommand('copy'); } catch (e) { copied = false; }
          if (copied) done();
          else feedback.textContent = tr('Select the message and copy it manually.', 'حدد الرسالة وانسخها يدوياً.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
      });
      return button;
    }

    function syncExtra() {
      extra.replaceChildren();
      if (handoff.disabled) return;
      var target = window.waLink(preview.value.trim());
      if (target.length > core.WA_URL_LIMIT) {
        extra.append(element('p', 'la-feedback', tr('Long message — WhatsApp may cut it. Shorten it or copy it.', 'الرسالة طويلة — قد يقتطعها واتساب. اختصرها أو انسخها.')), copyButton());
      }
    }

    function validateConsent() {
      handoff.disabled = !consent.checked || blocked || !preview.value.trim();
      syncExtra();
    }
    consent.addEventListener('change', validateConsent);
    preview.addEventListener('input', function () {
      preview.dataset.edited = 'true';
      consent.checked = false;
      validateConsent();
    });
    handoff.addEventListener('click', function () {
      if (handoff.disabled) return;
      var target = window.waLink(preview.value.trim());
      var popup = window.open('about:blank', '_blank');
      if (popup) {
        popup.opener = null;
        popup.location.href = target;
      } else {
        feedback.textContent = tr('The browser blocked the new tab. Allow pop-ups and try again, or copy the reviewed message.', 'حظر المتصفح التبويب الجديد. اسمح بالنوافذ المنبثقة وأعد المحاولة، أو انسخ الرسالة التي راجعتها.');
        extra.replaceChildren();
        var direct = element('a', 'la-handoff la-handoff-link', tr('Open WhatsApp', 'افتح واتساب'));
        direct.href = target;
        direct.target = '_blank';
        direct.rel = 'noopener noreferrer';
        extra.append(direct, copyButton());
        return;
      }
      consent.checked = false;
      validateConsent();
      feedback.textContent = tr('WhatsApp opened for review. No message was sent by this page.', 'فُتح واتساب للمراجعة. لم تُرسل هذه الصفحة أي رسالة.');
    });

    review.append(label, preview, consentLabel, handoff, feedback, extra);
    return { preview: preview, consent: consent, button: handoff, feedback: feedback };
  }

  function showReview() {
    if (!brief.package) brief.package = core.recommend(brief);
    flow = null; step = -1; view = 'review'; chrome(); options.replaceChildren(); review.replaceChildren();
    var quote = core.quote(brief, catalog);
    review.append(element('h3', '', tr('Your provisional estimate', 'تقديرك المبدئي')));
    var dl = element('dl');
    [
      [tr('Package', 'الباقة'), quote.name],
      [tr('One-time total', 'الإجمالي لمرة واحدة'), money(quote.total)],
      [tr('Deposit · 30%', 'الدفعة الأولى · 30%'), money(quote.deposit)],
      [tr('Balance · 70%', 'المتبقي · 70%'), money(quote.balance)]
    ].forEach(function (row) {
      var div = element('div');
      div.append(element('dt', '', row[0]), element('dd', '', row[1]));
      dl.append(div);
    });
    review.append(dl);
    if (quote.monthly) review.append(element('p', '', tr('Optional care: ', 'العناية الاختيارية: ') + money(quote.monthly) + tr('/month, separate from this total.', ' شهرياً، منفصلة عن الإجمالي.')));
    var budget = core.parseAmount(brief.budget);
    if (budget && budget < quote.total) {
      review.append(element('p', 'la-feedback', tr('This exceeds your stated budget. Reduce the scope or ask the team to review it before committing.', 'هذا أعلى من ميزانيتك المحددة. قلل النطاق أو اطلب مراجعة الفريق قبل الالتزام.')));
    }
    var missing = steps.filter(function (item) { return !brief[item.key]; });
    var blocked = missing.length > 0;
    review.append(element('p', '', tr('Custom features, taxes, domain, paid hosting and provider charges need a written quote. Dates are not confirmed.', 'تحتاج الميزات الخاصة والضرائب والنطاق والاستضافة المدفوعة ورسوم المزود إلى عرض مكتوب. المواعيد غير مؤكدة.')));
    if (blocked) {
      review.append(element('p', 'la-feedback', tr('Complete your project brief before continuing to WhatsApp.', 'أكمل متطلبات المشروع قبل المتابعة إلى واتساب.')));
    }
    renderHandoff(buildMessage(quote), blocked);

    option(missing.length ? 'Complete my brief' : 'Edit project details', missing.length ? 'أكمل المتطلبات' : 'عدل تفاصيل المشروع', function () {
      if (missing.length) { askNext(); return; }
      review.replaceChildren();
      options.replaceChildren();
      steps.forEach(function (item, index) {
        option(item.en, item.ar, function () { flow = 'brief'; step = index; editOnly = true; askCurrent(); });
      });
    });
    option('Change package', 'غير الباقة', function () { review.replaceChildren(); choosePackage(); });
    option('Change extras', 'غير الإضافات', showExtras);
    option('Start a new brief', 'ابدأ ملخصاً جديداً', function () {
      options.replaceChildren();
      say(tr('Replace the unsent brief and clear this conversation?', 'هل تريد استبدال الملخص غير المرسل ومسح هذه المحادثة؟'));
      option('Yes, start again', 'نعم، ابدأ من جديد', function () {
        resetAll();
        askNext();
      });
      option('Keep my brief', 'احتفظ بملخصي', showReview);
    });
    scroll();
  }

  function showHandoff() {
    flow = null; step = -1; editOnly = false; view = 'handoff';
    chrome(); options.replaceChildren(); review.replaceChildren();
    var demo = brief.demo ? core.demoById(brief.demo) : null;
    var request = brief.customRequest || '';
    review.append(element('h3', '', tr('Your enquiry summary', 'ملخص استفسارك')));
    var rows = [];
    if (demo) rows.push([tr('Chosen demo', 'النموذج المختار'), demoLabel(demo)]);
    else if (request) rows.push([tr('Custom request', 'طلب مخصص'), tr('Written request · not a live demo', 'طلب مكتوب · ليس نموذجاً حياً')]);
    if (!demo && request) rows.push([tr('Request', 'الطلب'), truncate(request, 90)]);
    if (brief.business) rows.push([tr('Business', 'المشروع'), oneLine(brief.business)]);
    if (brief.sector) rows.push([tr('Business type', 'نوع النشاط'), oneLine(localizeChoice('sector', brief.sector))]);
    if (brief.name) rows.push([tr('Contact name', 'الاسم'), oneLine(brief.name)]);
    if (brief.phone) rows.push([tr('WhatsApp', 'واتساب'), ltr(oneLine(brief.phone))]);
    var dl = element('dl');
    rows.forEach(function (row) {
      var div = element('div');
      div.append(element('dt', '', row[0]), element('dd', '', row[1]));
      dl.append(div);
    });
    review.append(dl);
    if (demo) {
      var again = element('a', 'la-preview-again', tr('Preview again ', 'عاين النموذج مرة أخرى '));
      again.append(arrowGlyph());
      again.setAttribute('aria-label', tr('Preview ', 'معاينة ') + demoName(demo) + tr(' again (opens in a new tab)', ' مرة أخرى (يفتح في تبويب جديد)'));
      again.href = demoUrl(demo);
      again.target = '_blank';
      again.rel = 'noopener';
      review.append(again);
    }
    var blocked = !brief.name || !(demo || request.length >= 10);
    if (blocked) {
      review.append(element('p', 'la-feedback', tr('Add your name and choose a demo or describe your request before continuing to WhatsApp.', 'أضف اسمك واختر نموذجاً أو اكتب طلبك قبل المتابعة إلى واتساب.')));
    }
    renderHandoff(demo ? buildDemoMessage(demo) : buildCustomMessage(), blocked);

    option('Change demo', 'غيّر النموذج', changeDemo);
    option('Edit my details', 'عدّل بياناتي', function () {
      review.replaceChildren();
      options.replaceChildren();
      detailSteps.forEach(function (item, index) {
        var label = detailLabels[item.key];
        option(label[0], label[1], function () { flow = 'details'; step = index; editOnly = true; askCurrent(); });
      });
      option('Back to summary', 'العودة إلى الملخص', showHandoff);
    });
    option('Build a full project brief instead', 'جهّز متطلبات مشروع كاملة', function () { askNext(); });
    option('Start over', 'ابدأ من جديد', function () {
      options.replaceChildren();
      say(tr('Replace the unsent enquiry and clear this conversation?', 'هل تريد استبدال الاستفسار غير المرسل ومسح هذه المحادثة؟'));
      option('Yes, start again', 'نعم، ابدأ من جديد', function () {
        resetAll();
        home();
      });
      option('Keep my enquiry', 'احتفظ باستفساري', showHandoff);
    });
    scroll();
  }

  function resetAll() {
    brief = { addons: [], care: false };
    flow = null;
    step = -1;
    editOnly = false;
    view = 'home';
    picksNode = null;
    picksState = null;
    packageFromDemo = false;
    detailsOffset = 0;
    liveHistory = [];
    liveGeneration++;
    log.replaceChildren();
    review.replaceChildren();
    options.replaceChildren();
  }

  function showExtras() {
    view = 'extras';
    review.replaceChildren();
    options.replaceChildren();
    say(tr('Select or remove extras. Included features are not charged again. Each extra page or copywriting selection covers one page; larger quantities need review.', 'اختر الإضافات أو أزلها. لا تفرض رسوم جديدة على الميزات المشمولة. اختيار الصفحة الإضافية أو كتابة المحتوى يغطي صفحة واحدة؛ الكميات الأكبر تحتاج مراجعة.'));
    Object.keys(catalog.addons).forEach(function (id) {
      var included = catalog.included[brief.package].indexOf(id) !== -1;
      var addon = catalog.addons[id];
      var label = (ar() ? addon.nameAr : addon.name) + ' · ' + (included ? tr('Included', 'مشمولة') : money(addon.price));
      var button = option(label, label, function () {
        if (brief.addons.indexOf(id) === -1) brief.addons.push(id);
        else brief.addons = brief.addons.filter(function (key) { return key !== id; });
        button.setAttribute('aria-pressed', String(brief.addons.indexOf(id) !== -1));
      });
      button.disabled = included;
      button.setAttribute('aria-pressed', String(included || brief.addons.indexOf(id) !== -1));
    });
    var care = option('Monthly care · AED 300/month', 'عناية شهرية · 300 درهم شهرياً', function () {
      brief.care = !brief.care;
      care.setAttribute('aria-pressed', String(brief.care));
    });
    care.setAttribute('aria-pressed', String(brief.care));
    option('Update estimate', 'حدث التقدير', showReview);
    scroll();
  }

  function open(preset) {
    lastFocus = document.activeElement;
    var demo = preset && preset.demo !== undefined && preset.demo !== null ? core.demoById(preset.demo) : null;
    if (preset) {
      Object.keys(preset).forEach(function (key) {
        if (key === 'demo') return;
        if (preset[key] !== undefined && preset[key] !== null && preset[key] !== '') brief[key] = preset[key];
      });
    }
    if (!dialog.open) dialog.showModal();
    if (!started) {
      started = true;
      say(tr('Welcome to Launch1500. I am your Intelligent Concierge. I can answer customer service inquiries, advise on packages, match you with the best-fitting live demo, or structure a custom website brief before connecting to WhatsApp.', 'أهلاً بك في Launch1500. أنا مساعد الكونسيرج الذكي لخدمة العملاء. يمكنني الإجابة عن استفساراتك حول الباقات والأسعار والمواعيد، أو مطابقتك مع النموذج الحي الأنسب، أو مساعدتك في تنظيم متطلبات موقعك قبل التواصل عبر واتساب.'));
      home();
      probeLive();
    }
    if (demo) {
      brief.demo = demo.id;
      brief.package = demo.package;
      packageFromDemo = true;
      brief.customRequest = '';
      delete brief.considered;
      if (!/^WEB-DEMO-(1500|3000|5000)$/.test(brief.source || '')) brief.source = 'url';
      flow = null; step = -1; editOnly = false;
      say(tr('You picked ', 'اخترت ') + demoLabel(demo) + tr(". Let's take a few details.", '. لنأخذ بعض التفاصيل.'));
      askDetails();
    } else if (preset && preset.package) {
      /* An estimator / start-link package replaces any demo chosen earlier, so the review never pairs the two */
      delete brief.demo;
      delete brief.considered;
      packageFromDemo = false;
      showReview();
    }
    input.focus();
  }

  function close() { dialog.close(); }
  dialog.addEventListener('close', function () { if (lastFocus && lastFocus.isConnected) lastFocus.focus(); });
  trigger.addEventListener('click', function () { open(); });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = input.value.trim().slice(0, 1200);
    if (!text) return;
    if (flow === 'custom') { acceptCustom(text); return; }
    if (flow && step >= 0) {
      var item = activeSteps()[step];
      /* Matcher and details answers (business names, contact names) only count as questions with an explicit "?" */
      var strict = flow !== 'brief' || (item && (item.key === 'business' || item.key === 'name'));
      if (!core.isQuestion(text, strict)) { accept(text); return; }
    }
    lastQuestion = text;
    if (liveAi) {
      input.value = '';
      askLive(text);
      return;
    }
    say(text, true);
    input.value = '';
    var matchedTopic = core.topic(text);
    answer(matchedTopic);
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a');
    if (!link || dialog.contains(link)) return;
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    var sameOrigin = url.origin === location.origin;
    var source = url.searchParams.get('source') || '';
    var demoMatch = sameOrigin ? /^WEB-DEMO-(1500|3000|5000)$/.exec(source) : null;
    var isStart = sameOrigin && /\/start\/(index\.html)?$/.test(url.pathname);
    if (!link.matches('[data-wa], #sumWhatsApp') && !isStart && !demoMatch) return;
    event.preventDefault();
    var preset = {};
    if (link.id === 'sumWhatsApp') {
      preset.package = document.querySelector('#estPkgs input:checked').value;
      preset.addons = Array.from(document.querySelectorAll('#estAddons input:checked')).map(function (item) { return item.value; }).filter(function (key) { return key !== 'care'; });
      preset.care = document.getElementById('ad-care').checked;
    } else if (demoMatch) {
      preset.demo = Number(demoMatch[1]);
      preset.package = core.demoById(preset.demo).package;
      preset.source = source;
    } else {
      var requested = url.searchParams.get('package');
      var message = link.getAttribute('data-wa') || '';
      preset.package = Object.hasOwn(catalog.packages, requested || '') ? requested : Object.keys(catalog.packages).find(function (key) { return message.indexOf(catalog.packages[key].name) !== -1; });
    }
    open(preset);
  });

  function polishActions() {
    var previousDraft = review.querySelector('#laMessagePreview[data-edited="true"]');
    var editedText = previousDraft ? previousDraft.value : null;
    chrome();
    var navWa = document.getElementById('navWa');
    if (navWa) navWa.textContent = tr('Plan my website', 'خطط لموقعك');
    var sumWa = document.getElementById('sumWhatsApp');
    if (sumWa) sumWa.textContent = tr('Review with assistant', 'راجع مع المساعد');
    var leadBtn = document.querySelector('#leadForm button[type="submit"]');
    if (leadBtn) leadBtn.textContent = tr('Review with assistant', 'راجع مع المساعد');
    var heroNote = document.querySelector('.hero-note');
    if (heroNote) heroNote.textContent = tr('No payment is taken here. Plan your project with the assistant before WhatsApp.', 'لا تُحصّل أي دفعة هنا. خطط لمشروعك مع المساعد قبل واتساب.');
    var leadAlt = document.querySelector('.lead-alt a');
    if (leadAlt) leadAlt.textContent = tr('Talk to the assistant', 'تحدث مع المساعد');
    var lfNote = document.querySelector('.lf-note');
    if (lfNote) lfNote.textContent = tr('Name and business name are required. The assistant reviews your details before WhatsApp. This page does not save your enquiry.', 'الاسم واسم المشروع مطلوبان. يراجع المساعد التفاصيل قبل واتساب. لا تحفظ هذه الصفحة استفسارك.');
    document.querySelectorAll('.flagship-actions .btn-cream .lang-en').forEach(function (el) { el.textContent = 'Open demo'; });
    document.querySelectorAll('.flagship-actions .btn-ghost .lang-en').forEach(function (el) { el.textContent = 'Plan my site'; });
    document.querySelectorAll('.pkg .btn').forEach(function (el, i) {
      var packs = Object.values(catalog.packages);
      if (packs[i]) el.textContent = tr('Discuss ', 'ناقش ') + packs[i].name.replace('Launch ', '');
    });
    switch (view) {
      case 'review': showReview(); break;
      case 'handoff': showHandoff(); break;
      case 'picks': showDemoMatch({ rerender: true }); break;
      case 'custom': askCustomRequest(); break;
      case 'package': choosePackage(); break;
      case 'extras': showExtras(); break;
      case 'question': askCurrent(); break;
      default: home();
    }
    if (editedText !== null) {
      var draft = review.querySelector('#laMessagePreview');
      if (draft) {
        draft.value = editedText;
        draft.dataset.edited = 'true';
      }
    }
  }

  document.addEventListener('launch:language', polishActions);
  window.LaunchAssistant = Object.freeze({ open: open });
  polishActions();

  var params = new URLSearchParams(location.search);
  if (params.get('assistant') === '1') {
    var requested = params.get('package');
    var requestedDemo = core.demoById(params.get('demo') || '');
    var boot;
    if (requestedDemo) {
      boot = { demo: requestedDemo.id, package: requestedDemo.package };
      if (/^WEB-DEMO-(1500|3000|5000)$/.test(params.get('source') || '')) boot.source = params.get('source');
    } else if (Object.hasOwn(catalog.packages, requested || '')) {
      boot = { package: requested };
    }
    open(boot);
  }
})();
