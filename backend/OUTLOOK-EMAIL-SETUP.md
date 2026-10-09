# Outlook Email Setup Guide

## 📧 **Configure Outlook Email for Recruitment Platform**

### **🔧 Step 1: Enable SMTP Access for Outlook**

1. **Sign in to Outlook**: Go to [Outlook.com](https://outlook.com)
2. **Account Settings**: Click on your profile → View account
3. **Security**: Go to Security settings
4. **App Passwords**: Generate an app password (if 2FA is enabled)

### **🔑 Step 2: Generate App Password (if 2FA enabled)**

1. **Enable 2FA**: If not already enabled
2. **App Passwords**: Go to Security → App passwords
3. **Create New**: 
   - App name: "Recruitment Platform"
   - Generate password
4. **Copy Password**: Save this password securely

### **⚙️ Step 3: Update Environment Variables**

Update your `.env` file with Outlook credentials:

```bash
# Outlook Configuration
OUTLOOK_EMAIL="your-email@outlook.com"
OUTLOOK_PASSWORD="your-app-password"

# Alternative SMTP (already configured)
SMTP_HOST="smtp-mail.outlook.com"
SMTP_PORT="587"
SMTP_SECURE="false"
```

### **📋 Step 4: Outlook SMTP Settings**

The system uses these Outlook SMTP settings:
- **Server**: `smtp-mail.outlook.com`
- **Port**: `587`
- **Authentication**: Required
- **SSL/TLS**: STARTTLS (secure: false)

### **🧪 Step 5: Test Email Configuration**

1. **Restart Backend**: `npm run dev:full`
2. **Register New User**: Test welcome email
3. **Forgot Password**: Test password reset email
4. **Login Code**: Test email code login

### **🔍 Step 6: Troubleshooting**

#### **Common Issues & Solutions:**

**Issue**: "Authentication failed"
- **Solution**: Check email/password, enable app password if 2FA is on

**Issue**: "Connection timeout"
- **Solution**: Check firewall, verify SMTP settings

**Issue**: "Email not sending"
- **Solution**: Verify Outlook account is active, check spam folder

#### **Outlook Specific Notes:**

1. **Sending Limits**: Outlook has daily sending limits
2. **Spam Protection**: May mark bulk emails as spam
3. **Account Status**: Account must be in good standing

### **🚀 Step 7: Production Considerations**

For production use:

1. **Dedicated Email Service**: Consider SendGrid or AWS SES
2. **Domain Verification**: Use custom domain for better deliverability
3. **Monitoring**: Track email delivery and bounce rates
4. **Unsubscribe**: Include unsubscribe link in emails

### **✅ Verification Commands**

Test your email setup:

```bash
# Test email service
curl -X POST http://localhost:8000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@outlook.com"}'

# Check email logs
tail -f logs/email.log
```

### **📞 Support**

If you encounter issues:
1. Check Outlook account status
2. Verify app password is correct
3. Ensure SMTP settings match exactly
4. Check backend logs for detailed errors

---

**🎯 Your email system is now configured for Outlook!**
