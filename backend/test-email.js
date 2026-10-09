const nodemailer = require('nodemailer');
require('dotenv').config();

// Test Outlook email configuration
const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.OUTLOOK_EMAIL,
    pass: process.env.OUTLOOK_PASSWORD,
  },
});

async function testEmail() {
  try {
    console.log('Testing Outlook email configuration...');
    console.log('Email:', process.env.OUTLOOK_EMAIL);
    console.log('Password configured:', process.env.OUTLOOK_PASSWORD ? 'Yes' : 'No');
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully');
    
    // Send test email
    const info = await transporter.sendMail({
      from: process.env.OUTLOOK_EMAIL,
      to: process.env.OUTLOOK_EMAIL,
      subject: '📧 Outlook Email Test - Recruitment Platform',
      html: `
        <h2>🎉 Outlook Email Configuration Test</h2>
        <p>This is a test email to verify your Outlook SMTP configuration is working correctly.</p>
        <p><strong>Details:</strong></p>
        <ul>
          <li>SMTP Server: smtp-mail.outlook.com</li>
          <li>Port: 587</li>
          <li>Secure: false (STARTTLS)</li>
          <li>Email: ${process.env.OUTLOOK_EMAIL}</li>
        </ul>
        <p>✅ Your Outlook email system is ready to use!</p>
        <p>Best regards,<br>Recruitment Platform Team</p>
      `,
    });
    
    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Check your inbox for the test email.');
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.error('Full error:', error);
    
    if (error.code === 'EAUTH') {
      console.log('💡 Solution: Check your Outlook email and password');
      console.log('💡 If using 2FA, generate an app password');
    } else if (error.code === 'ECONNECTION') {
      console.log('💡 Solution: Check network connection and SMTP settings');
    } else if (error.code === 'ESOCKET') {
      console.log('💡 Solution: Check firewall and port 587');
    }
  }
}

testEmail();
