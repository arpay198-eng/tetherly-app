# TETHERLY PROJECT - CORE ARCHITECTURAL RULES

## 🛡️ CORE RULE: SERVER-SIDE FIRST VERIFICATION (ALWAYS ENFORCED)
**Har feature aur rule sabse pehle Server-Side verify hoga.**

1. **Zero Client Trust:**
   - Client-side (Browser / App UI) par kisi bhi balance, user status, role, ya financial transaction ko trust nahi kiya jayega.
   - Client sirf request bhejta hai; actual verification aur authorization hamesha Backend / Server (Firebase Firestore Security Rules, Server APIs) par pehle verify hogi.

2. **Financial Data & Balances:**
   - Balance increment/decrement, deposit validation, aur withdrawal approval strictly server-side verified hone chahiye.
   - Normal users apna balance ya dusre user ka data direct write/manipulate nahi kar sakte.

3. **Admin Privilege Verification:**
   - Admin routes aur actions (/tetherly-master-control) hamesha server/database me verify honge (check role == 'admin' ya verified owner account in Firebase).
   - Brute-force protection aur security cooldowns strictly enforce rahenge.

4. **Critical Constraints:**
   - **APK Build Rule:** User jab tak explicitly command na kare, tab tak koi bhi APK build (./gradlew, cap build, etc.) generate nahi karna hai.
   - **Project Isolation:** tetherly-usdt database aur configurations strictly isolated rahenge.

## ⚡ LOCALHOST SERVER RULES (PERMANENT FIX)

1. **Server jab chalu ho (port 3000) tab KABHI `npm run build` / `npm run export` NA chalao.** Build (`npm run build`) server ko pehle band kar ke karo, warna `.next` cache corrupt hokar server mar jata hai (yehi purani crash wajah thi).
2. **Production server:** Setup ab `next start` (production mode) par hai. `npm run build` = server build. Watchdog script `run-localhost.ps1` server ko restart karta hai agar mar jaye. Manual start: `start-localhost.bat`.
3. **Auto-start on login:** `%APPDATA%\...\Startup\TetherlyLocalhost.cmd` (Startup folder) — Windows login par server khud start hota hai. Remove karne ke liye woh file delete karo.
4. **APK/static export:** `output: 'export'` ab conditional hai. APK ke liye `NEXT_STATIC=1 npm run build` (ya `NEXT_STATIC=1 next build && next export`) chalao — phir `npx cap sync android` etc. Default build (bina NEXT_STATIC) normal server/spa build deta hai.
5. **Logs:** `server.log` (server output), `server-error.log` (errors), `server-watchdog.log` (restart history).
6. **Status check:** `Get-NetTCPConnection -LocalPort 3000 -State Listen` se confirm karo ki server up hai, phir hi koi change verify karo.
