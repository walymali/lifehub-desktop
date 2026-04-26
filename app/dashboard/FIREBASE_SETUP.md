# Firebase Setup Guide

تفعيل **Cloud Sync** في LifeHub محتاج إعداد Firebase. العملية مرة واحدة فقط وبتاخد **10 دقايق**.

---

## لماذا Firebase؟

- ✅ **مجاني** للـ 50,000 مستخدم أول (Spark plan)
- ✅ Authentication جاهز (Email + Google)
- ✅ Firestore real-time sync بين الأجهزة
- ✅ مفيش server تحتاج تديره
- ✅ يشتغل offline-first

---

## الخطوة 1: إنشاء Firebase Project

1. افتح [console.firebase.google.com](https://console.firebase.google.com)
2. سجل دخول بحساب Google
3. اضغط **"Add project"** أو **"Create project"**
4. **Project name:** `LifeHub` (أو أي اسم)
5. **Google Analytics:** اختار Disable (مش محتاجينه دلوقتي)
6. اضغط **Create project**

---

## الخطوة 2: تفعيل Authentication

1. من القائمة على اليسار → **Build → Authentication**
2. اضغط **Get started**
3. في tab **Sign-in method**، فعّل:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → ضيف support email → Save

---

## الخطوة 3: إنشاء Firestore Database

1. من القائمة على اليسار → **Build → Firestore Database**
2. اضغط **Create database**
3. **Mode:** اختار **Production mode**
4. **Location:** اختار أقرب region ليك (مثلاً `eur3` للشرق الأوسط أو `us-central`)
5. اضغط **Enable**

---

## الخطوة 4: نسخ الإعدادات

1. من القائمة على اليسار → **Project Overview** (أيقونة الترس ⚙️)
2. اختار **Project settings**
3. انزل لـ **Your apps** section
4. اضغط على أيقونة الويب **</>** عشان تضيف Web app
5. **App nickname:** `LifeHub Web`
6. اضغط **Register app**
7. هتلاقي كود زي كده:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lifehub-xyz.firebaseapp.com",
  projectId: "lifehub-xyz",
  storageBucket: "lifehub-xyz.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123..."
};
```

**انسخ هذه القيم!**

---

## الخطوة 5: تعديل firebase-config.js

افتح الملف `/Users/walysmac/dashboard/firebase-config.js` وبدّل القيم:

```javascript
window.LIFEHUB_FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",                                // ← من Firebase
  authDomain: "lifehub-xyz.firebaseapp.com",          // ← من Firebase
  projectId: "lifehub-xyz",                           // ← من Firebase
  storageBucket: "lifehub-xyz.appspot.com",           // ← من Firebase
  messagingSenderId: "123456789",                     // ← من Firebase
  appId: "1:123..."                                   // ← من Firebase
};

window.LIFEHUB_FIREBASE_ENABLED = true;  // ← غيرها لـ true
```

---

## الخطوة 6: إعداد Firestore Security Rules

في Firebase Console → **Firestore Database → Rules**، بدّل الـ rules بده:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Public config (if any)
    match /config/{doc} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

اضغط **Publish**.

---

## الخطوة 7: اختبار

1. شغّل السيرفر: `python3 -m http.server 8000` من `/Users/walysmac/`
2. افتح `http://localhost:8000/dashboard/`
3. اضغط **"Sign In / Sync"** في الـ sidebar
4. اعمل حساب جديد
5. ✅ المفروض تشوف اسمك + **Synced** dot خضرا

---

## 🎉 تم!

دلوقتي:
- بياناتك بتتحفظ في الـ cloud تلقائياً كل 30 ثانية
- تقدر تفتح الـ dashboard من أي جهاز تاني، تسجل دخول، وتلاقي كل حاجة
- الـ licenses بتتزامن بين الأجهزة
- لو مفيش نت → يشتغل offline ويزامن لما الإنترنت يرجع

---

## التكلفة

Firebase **Spark Plan** (المجاني):
- 50,000 reads/day
- 20,000 writes/day  
- 1 GB storage
- 10 GB bandwidth/month

**ده كافي لـ ~500 مستخدم نشط** بدون أي تكلفة.

لو وصلت الحد ده، Firebase Blaze Plan (pay-as-you-go):
- $0.06 per 100K reads
- $0.18 per 100K writes

**تقدير:** لـ 1,000 مستخدم نشط = **~$2-5/شهر**

---

## مشاكل شائعة

### "Firebase not configured" Error
- تأكد إن `LIFEHUB_FIREBASE_ENABLED = true`
- تأكد إن الـ `apiKey` مش `YOUR_API_KEY_HERE`

### Permission Denied
- تأكد من Firestore Security Rules (الخطوة 6)
- تأكد إن الـ user مسجل دخول

### Google Sign-in مش شغال
- في Firebase Console → Authentication → Sign-in method → Google → تأكد إنه Enabled
- ضيف support email في الإعدادات

### Sync Slow
- طبيعي - يحصل كل 30 ثانية
- لتسريعه: `LifeHubAuth.pushToCloud()` يدوياً

---

## الخطوات القادمة

بعد ما Firebase يشتغل:
1. **Gumroad Webhook** - يولد licenses تلقائياً بعد الشراء
2. **Stripe Integration** - للـ subscriptions
3. **Admin Panel** - إدارة المستخدمين والـ licenses
4. **Mobile App** - استخدام نفس Firebase للـ sync
