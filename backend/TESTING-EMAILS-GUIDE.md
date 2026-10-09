# 📧 Testing with MetaForge IT Domain Only

## 🎯 **Email Validation: MetaForge IT Only**

Your system is correctly configured to **only allow @metaforgeit.com emails** for both testing and production.

---

## ✅ **Valid Test Emails**

Use these email addresses for testing:

### **User Registration**
```
✅ test@metaforgeit.com
✅ demo@metaforgeit.com
✅ user@metaforgeit.com
✅ candidate@metaforgeit.com
```

### **Recruiter Registration**
```
✅ recruiter@metaforgeit.com
✅ hr@metaforgeit.com
✅ hiring@metaforgeit.com
✅ jobs@metaforgeit.com
```

### **Admin Registration**
```
✅ admin@metaforgeit.com
✅ super@metaforgeit.com
✅ manager@metaforgeit.com
```

---

## 🚫 **Blocked Emails (Will Show Error)**
These will correctly show "Only metaforgeit.com email addresses are allowed":
```
❌ test@gmail.com
❌ user@yahoo.com
❌ demo@outlook.com
❌ admin@company.com
```

---

## 🧪 **How to Test Full Flow**

### **1. Test User Registration**
```
Email: test@metaforgeit.com
Password: password123
First Name: Test
Last Name: User
Role: CANDIDATE
```

### **2. Test Recruiter Registration**
```
Email: recruiter@metaforgeit.com
Password: password123
First Name: John
Last Name: Recruiter
Role: RECRUITER
Company: MetaForge IT
```

### **3. Test Login**
Use any of the registered emails above.

### **4. Test OTP Login**
Use any registered email for passwordless login.

---

## 📧 **Email Features Working**

### **Welcome Email**
- Sent after successful registration
- Contains congratulations message
- Professional MetaForge IT branding

### **Email Verification**
- Verification link sent to registered email
- Must click to verify account

### **OTP Login**
- 6-digit code sent to email
- Valid for 5 minutes
- Professional email template

---

## 🎉 **Success Indicators**

✅ **Registration Works** - With @metaforgeit.com email  
✅ **Email Delivered** - Check your email inbox  
✅ **Login Works** - Both password and OTP  
✅ **Profile Created** - Data saved in database  
✅ **Security Maintained** - Only corporate emails  

---

## 🛡️ **Why This is Good**

1. **Corporate Security** - Only MetaForge IT employees can register
2. **Professional Testing** - Realistic test environment
3. **Production Ready** - Same rules as production
4. **Email Delivery** - All emails go to same domain

---

## 🔄 **Backend Restart Required**

After changing email validation, restart your backend:

```bash
cd "f:\Recruiter platform\backend"
npm run dev:full
```

---

## 📞 **If You Need Different Domains**

For future testing with other domains, you can temporarily add them in:
`backend/src/utils/emailValidator.ts`

But for now, **@metaforgeit.com only** maintains your corporate security standards.

**Your MetaForge IT recruitment platform is ready for testing!** 🚀
