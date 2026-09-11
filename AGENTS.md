# TETHERLY PROJECT - CORE ARCHITECTURAL RULES

## CORE RULE: SERVER-SIDE FIRST VERIFICATION (ALWAYS ENFORCED)
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

4. **Project Isolation:** arwalletp2p database aur configurations strictly isolated rahenge.

## DEPLOYMENT

- **Hosting:** Firebase App Hosting (Cloud Run) — persistent server, NOT serverless
- **Build:** `npm run build` (Next.js server build)
- **Project:** arwalletp2p (Blaze plan)
