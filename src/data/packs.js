// Approved phrase packs. Regulated sentences are only ever spoken from here,
// never generated freely, so a translation cannot quietly change an obligation.
// Arabic and Urdu lines are drafted for the prototype and are marked as pending
// review by a fluent speaker and the institution's compliance reviewer.

const EN = {
  intro:
    'Hello, this is the AI assistant from Demo Bank. This call is recorded. I am calling about an account servicing matter. You can always reach us on the official number 800 0000.',
  wrong_party_end:
    'Thank you. This is a personal call for our customer. Please ask them to contact Demo Bank on the official number 800 0000. Goodbye.',
  verify_request:
    'To verify your identity I have sent a request to your Demo Bank app. Please open the app and approve it. I will never ask for your PIN, password or one time code.',
  verify_success: 'Thank you, your identity is confirmed.',
  verify_failed:
    'I was not able to confirm your identity, so I cannot discuss the account. Please call Demo Bank on the official number 800 0000.',
  facts: 'An instalment of {amount} on your {product} was due on {date}.',
  options:
    'I can send a secure payment link, record a payment date from the dates we have available, or arrange for a person to call you.',
  ask_promise_date: 'The available dates are {dates}. Which one suits you?',
  confirm_promise: 'Recorded: payment by {date}. Your reference is {ref}.',
  confirm_link: 'The secure payment link is on its way to your app. Your reference is {ref}.',
  confirm_callback: 'A colleague will call you on {date}. Your reference is {ref}.',
  optout_ack:
    'I have recorded that you do not want automated voice calls. Your reference is {ref}. Demo Bank may still send required written notices.',
  human_ack: 'Of course. I am handing you to a person now.',
  hardship_ack:
    'Thank you for telling me. I am stopping the payment conversation now. I will not make any decision about your situation.',
  dispute_ack:
    'Thank you. I am stopping the payment conversation and opening a case so the amount can be checked.',
  complaint_ack: 'Thank you. I am recording your complaint and stopping the payment conversation.',
  transfer_owner:
    'Your case is with {owner} in the {queue}. They will contact you within {sla} hours. Your reference is {ref}. Automated calls about this account are now paused.',
  tool_failure:
    'I could not complete that action just now, so I will not say it is done. A colleague will call you back.',
  low_confidence: 'I want to be sure I understood you correctly, so I am passing you to a person.',
  language_switch_ack: 'Of course, we can continue in English.',
  closing: 'Thank you for your time. Goodbye.',
  never_secrets:
    'I will never ask for your PIN, password or one time code. Please approve the request inside your Demo Bank app instead.',
  verify_pending:
    'I cannot see an approval yet. Please open the Demo Bank app and approve the request when you are ready.',
  unsupported_ack:
    'I am not able to decide fees or payment terms. I am stopping the payment conversation and opening a case so a person can look at it.',
};

const AR = {
  intro:
    'مرحباً، أنا المساعد الآلي من بنك ديمو. هذه المكالمة مسجّلة. أتصل بخصوص أمر يتعلق بخدمة حسابك. يمكنك دائماً الاتصال بنا على الرقم الرسمي 800 0000.',
  wrong_party_end:
    'شكراً لك. هذه مكالمة شخصية لأحد عملائنا. من فضلك اطلب منه الاتصال ببنك ديمو على الرقم الرسمي 800 0000. مع السلامة.',
  verify_request:
    'للتحقق من هويتك أرسلت طلباً إلى تطبيق بنك ديمو. من فضلك افتح التطبيق ووافق على الطلب. لن أطلب منك الرقم السري أو كلمة المرور أو رمز التحقق.',
  verify_success: 'شكراً لك، تم التحقق من هويتك.',
  verify_failed:
    'لم أتمكن من التحقق من هويتك، لذلك لا يمكنني مناقشة الحساب. من فضلك اتصل ببنك ديمو على الرقم الرسمي 800 0000.',
  facts: 'كان هناك قسط بقيمة {amount} على {product} مستحقاً في {date}.',
  options:
    'يمكنني إرسال رابط دفع آمن، أو تسجيل تاريخ دفع من التواريخ المتاحة، أو ترتيب اتصال من أحد الموظفين.',
  ask_promise_date: 'التواريخ المتاحة هي {dates}. أي تاريخ يناسبك؟',
  confirm_promise: 'تم التسجيل: الدفع بحلول {date}. رقم المرجع {ref}.',
  confirm_link: 'رابط الدفع الآمن في طريقه إلى تطبيقك. رقم المرجع {ref}.',
  confirm_callback: 'سيتصل بك أحد الزملاء في {date}. رقم المرجع {ref}.',
  optout_ack:
    'سجلت أنك لا ترغب في مكالمات آلية. رقم المرجع {ref}. قد يرسل البنك إشعارات مكتوبة مطلوبة نظاماً.',
  human_ack: 'بالتأكيد. سأحولك الآن إلى أحد الموظفين.',
  hardship_ack:
    'شكراً لإخباري. سأتوقف الآن عن الحديث عن الدفع. لن أتخذ أي قرار بشأن وضعك.',
  dispute_ack: 'شكراً لك. سأتوقف عن الحديث عن الدفع وأفتح حالة لمراجعة المبلغ.',
  complaint_ack: 'شكراً لك. سأسجل شكواك وأتوقف عن الحديث عن الدفع.',
  transfer_owner:
    'حالتك الآن لدى {owner} في {queue}. سيتواصل معك خلال {sla} ساعة. رقم المرجع {ref}. تم إيقاف المكالمات الآلية بشأن هذا الحساب.',
  tool_failure:
    'لم أتمكن من إتمام هذا الإجراء الآن، ولن أقول إنه تم. سيعاود أحد الزملاء الاتصال بك.',
  low_confidence: 'أريد التأكد من أنني فهمتك بشكل صحيح، لذلك سأحولك إلى أحد الموظفين.',
  language_switch_ack: 'بالطبع، يمكننا المتابعة بالعربية.',
  closing: 'شكراً لوقتك. مع السلامة.',
  never_secrets:
    'لن أطلب منك أبداً الرقم السري أو كلمة المرور أو رمز التحقق. من فضلك وافق على الطلب داخل تطبيق بنك ديمو.',
  verify_pending:
    'لم تصلني الموافقة بعد. من فضلك افتح تطبيق بنك ديمو ووافق على الطلب عندما تكون جاهزاً.',
  unsupported_ack:
    'لا أستطيع اتخاذ قرار بشأن الرسوم أو شروط الدفع. سأتوقف عن الحديث عن الدفع وأفتح حالة ليطلع عليها أحد الموظفين.',
};

const UR = {
  intro:
    'السلام علیکم، میں ڈیمو بینک کا اے آئی اسسٹنٹ ہوں۔ یہ کال ریکارڈ ہو رہی ہے۔ میں آپ کے اکاؤنٹ سے متعلق ایک معاملے پر رابطہ کر رہا ہوں۔ آپ ہمارے سرکاری نمبر 800 0000 پر ہم سے رابطہ کر سکتے ہیں۔',
  wrong_party_end:
    'شکریہ۔ یہ ہمارے ایک گاہک کے لیے ذاتی کال ہے۔ براہ کرم انہیں ڈیمو بینک کے سرکاری نمبر 800 0000 پر رابطہ کرنے کو کہیں۔ اللہ حافظ۔',
  verify_request:
    'تصدیق کے لیے میں نے آپ کی ڈیمو بینک ایپ میں ایک درخواست بھیجی ہے۔ براہ کرم ایپ کھول کر اسے منظور کریں۔ میں کبھی آپ کا پن، پاس ورڈ یا او ٹی پی نہیں مانگوں گا۔',
  verify_success: 'شکریہ، آپ کی تصدیق ہو گئی ہے۔',
  verify_failed:
    'میں آپ کی تصدیق نہیں کر سکا، اس لیے اکاؤنٹ پر بات نہیں کر سکتا۔ براہ کرم ڈیمو بینک کے سرکاری نمبر 800 0000 پر کال کریں۔',
  facts: 'آپ کے {product} پر {amount} کی قسط {date} کو واجب الادا تھی۔',
  options:
    'میں محفوظ ادائیگی لنک بھیج سکتا ہوں، دستیاب تاریخوں میں سے ادائیگی کی تاریخ درج کر سکتا ہوں، یا کسی نمائندے سے آپ کو کال کروا سکتا ہوں۔',
  ask_promise_date: 'دستیاب تاریخیں {dates} ہیں۔ آپ کے لیے کون سی مناسب ہے؟',
  confirm_promise: 'درج کر لیا گیا: ادائیگی {date} تک۔ آپ کا حوالہ نمبر {ref} ہے۔',
  confirm_link: 'محفوظ ادائیگی لنک آپ کی ایپ پر بھیجا جا رہا ہے۔ آپ کا حوالہ نمبر {ref} ہے۔',
  confirm_callback: 'ایک ساتھی آپ کو {date} کو کال کرے گا۔ آپ کا حوالہ نمبر {ref} ہے۔',
  optout_ack:
    'میں نے درج کر لیا ہے کہ آپ خودکار کالیں نہیں چاہتے۔ حوالہ نمبر {ref}۔ بینک ضروری تحریری اطلاعات بھیج سکتا ہے۔',
  human_ack: 'ضرور۔ میں ابھی آپ کو ایک نمائندے سے ملا رہا ہوں۔',
  hardship_ack:
    'بتانے کا شکریہ۔ میں ابھی ادائیگی کی بات یہیں روک دیتا ہوں۔ آپ کے معاملے کا فیصلہ میں نہیں کروں گا۔',
  dispute_ack: 'شکریہ۔ میں ادائیگی کی بات روک کر رقم کی جانچ کے لیے کیس کھول رہا ہوں۔',
  complaint_ack: 'شکریہ۔ میں آپ کی شکایت درج کر رہا ہوں اور ادائیگی کی بات روک رہا ہوں۔',
  transfer_owner:
    'آپ کا کیس {queue} میں {owner} کے پاس ہے۔ وہ {sla} گھنٹوں کے اندر رابطہ کریں گے۔ حوالہ نمبر {ref}۔ اس اکاؤنٹ پر خودکار کالیں اب روک دی گئی ہیں۔',
  tool_failure:
    'میں یہ کام ابھی مکمل نہیں کر سکا، اس لیے میں یہ نہیں کہوں گا کہ ہو گیا۔ ایک ساتھی آپ کو واپس کال کرے گا۔',
  low_confidence: 'میں یقین کرنا چاہتا ہوں کہ میں نے آپ کو صحیح سمجھا، اس لیے آپ کو ایک نمائندے سے ملا رہا ہوں۔',
  language_switch_ack: 'ضرور، ہم اردو میں بات جاری رکھ سکتے ہیں۔',
  closing: 'آپ کے وقت کا شکریہ۔ اللہ حافظ۔',
  never_secrets:
    'میں کبھی آپ کا پن، پاس ورڈ یا او ٹی پی نہیں مانگوں گا۔ براہ کرم ڈیمو بینک ایپ میں درخواست کی منظوری دیں۔',
  verify_pending:
    'مجھے ابھی تک منظوری نہیں ملی۔ براہ کرم ڈیمو بینک ایپ کھول کر درخواست منظور کریں۔',
  unsupported_ack:
    'میں فیس یا ادائیگی کی شرائط کا فیصلہ نہیں کر سکتا۔ میں ادائیگی کی بات روک کر کیس کھول رہا ہوں تاکہ کوئی نمائندہ دیکھ سکے۔',
};

export const PACKS = {
  'en-AE': { label: 'English', short: 'EN', dir: 'ltr', voice: 'en-GB', reviewed: true, t: EN },
  'ar-AE': { label: 'Arabic', short: 'AR', dir: 'rtl', voice: 'ar-SA', reviewed: false, t: AR },
  'ur-AE': { label: 'Urdu', short: 'UR', dir: 'rtl', voice: 'ur-PK', reviewed: false, t: UR },
};

// Suggested customer replies shown in the demo, with an English gloss so a judge
// who does not read Arabic or Urdu can still follow the call.
export const REPLIES = {
  INTRO: [
    { intent: 'affirm', en: 'Yes, speaking.', ar: 'نعم، أنا هو.', ur: 'جی ہاں، میں بات کر رہا ہوں۔' },
    { intent: 'wrong_party', en: 'You have the wrong number.', ar: 'لقد اتصلت بالرقم الخطأ.', ur: 'آپ نے غلط نمبر ملایا ہے۔' },
    { intent: 'switch_ur', en: 'Can we speak in Urdu?', ar: 'هل يمكننا التحدث بالأردية؟', ur: 'کیا ہم اردو میں بات کر سکتے ہیں؟' },
  ],
  VERIFY: [
    { intent: 'approved', en: 'I approved it in the app.', ar: 'وافقت عليه في التطبيق.', ur: 'میں نے ایپ میں منظوری دے دی ہے۔' },
    { intent: 'ask_otp', en: 'Do you need my OTP?', ar: 'هل تحتاج رمز التحقق؟', ur: 'کیا آپ کو او ٹی پی چاہیے؟' },
  ],
  RESOLVE: [
    { intent: 'promise', en: 'I can pay on the 12th.', ar: 'يمكنني الدفع في الثاني عشر.', ur: 'میں بارہ تاریخ کو ادائیگی کر سکتا ہوں۔' },
    { intent: 'payment_link', en: 'Send the payment link.', ar: 'أرسل رابط الدفع.', ur: 'ادائیگی کا لنک بھیج دیں۔' },
    { intent: 'hardship', en: 'I lost my job last week.', ar: 'فقدت عملي الأسبوع الماضي.', ur: 'میری پچھلے ہفتے نوکری چلی گئی۔' },
    { intent: 'dispute', en: 'This amount is wrong.', ar: 'هذا المبلغ غير صحيح.', ur: 'یہ رقم غلط ہے۔' },
    { intent: 'complaint', en: 'I want to make a complaint.', ar: 'أريد تقديم شكوى.', ur: 'میں شکایت درج کرانا چاہتا ہوں۔' },
    { intent: 'waiver', en: 'Can you waive the late fee?', ar: 'هل يمكنك إلغاء رسوم التأخير؟', ur: 'کیا آپ لیٹ فیس معاف کر سکتے ہیں؟' },
    { intent: 'human', en: 'I want to speak to a person.', ar: 'أريد التحدث إلى موظف.', ur: 'میں کسی نمائندے سے بات کرنا چاہتا ہوں۔' },
    { intent: 'opt_out', en: 'Do not call me with a machine again.', ar: 'لا تتصل بي بنظام آلي مرة أخرى.', ur: 'دوبارہ مشین سے کال نہ کریں۔' },
  ],
};

// Keyword sets for free text. Deliberately broad: a false alarm costs staff minutes,
// a missed hardship signal harms a customer.
export const TRIGGERS = {
  hardship: [
    'lost my job', 'lost job', 'no job', 'unemployed', 'redundant', 'laid off', 'salary delayed',
    'not been paid', 'no salary', 'cannot afford', 'can not afford', 'cant afford', 'no money',
    'in hospital', 'i am sick', 'seriously ill', 'passed away', 'died',
    'فقدت عملي', 'لا يوجد راتب', 'تأخر راتبي', 'لم يصلني راتبي', 'لم يصلني الراتب', 'راتبي متأخر',
    'لا أستطيع', 'في المستشفى', 'مريض', 'توفي',
    'نوکری چلی گئی', 'نوکری نہیں', 'تنخواہ نہیں', 'تنخواہ دیر', 'تنخواہ نہیں ملی', 'ادا نہیں کر سکتا',
    'ہسپتال', 'بیمار', 'انتقال',
  ],
  dispute: [
    'wrong amount', 'amount is wrong', 'not my account', 'already paid', 'i paid', 'incorrect',
    'المبلغ غير صحيح', 'ليس حسابي', 'دفعت بالفعل',
    'رقم غلط', 'میرا اکاؤنٹ نہیں', 'ادائیگی کر چکا',
  ],
  complaint: [
    'complain', 'complaint', 'escalate this', 'speak to your manager',
    'شكوى', 'أشتكي', 'شکایت',
  ],
  human: [
    'speak to a person', 'speak to someone', 'real person', 'human', 'agent please',
    'موظف', 'إنسان', 'نمائندہ', 'انسان',
  ],
  opt_out: [
    'do not call', "don't call", 'stop calling', 'no automated', 'remove my number',
    'لا تتصل', 'توقف عن الاتصال', 'کال نہ کریں', 'فون نہ کریں',
  ],
  wrong_party: [
    'wrong number', 'not him', 'not her', 'who is this', 'no one by that name',
    'الرقم الخطأ', 'ليس هو', 'غلط نمبر', 'یہ کون',
  ],
  waiver: [
    'waive', 'reduce the payment', 'lower the instalment', 'settlement', 'restructure', 'discount',
    'إلغاء الرسوم', 'تخفيض', 'إعادة جدولة', 'معاف', 'کم کر', 'قسط کم',
  ],
  payment_link: ['payment link', 'send the link', 'pay online', 'رابط الدفع', 'لنک بھیج', 'ادائیگی کا لنک'],
  promise: ['i can pay', 'i will pay', 'pay on', 'يمكنني الدفع', 'سأدفع', 'ادائیگی کر سکتا', 'ادا کروں گا'],
  callback: ['call me back', 'call later', 'اتصل بي لاحقا', 'بعد میں کال'],
  switch_ur: ['urdu', 'اردو', 'الأردية'],
  switch_ar: ['arabic', 'عربي', 'العربية', 'عربی'],
  switch_en: ['english', 'انجليزي', 'الإنجليزية', 'انگریزی'],
  approved: ['approved', 'i approved', 'done', 'accepted', 'وافقت', 'تم', 'منظور', 'کر دیا'],
  ask_otp: ['otp', 'one time', 'code', 'pin', 'password', 'رمز', 'او ٹی پی', 'پن'],
  affirm: ['yes', 'speaking', 'that is me', 'نعم', 'أنا هو', 'جی ہاں', 'میں ہوں'],
};
