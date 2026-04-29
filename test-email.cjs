require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log('Testing SMTP...');
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: 'ari.wibowo@millennia21.id',
            pass: 'nmny xyon bdbc yeuc' 
        }
    });

    try {
        await transporter.verify();
        console.log('✅ SMTP connection successful!');
        
        const info = await transporter.sendMail({
            from: '"Test" <ari.wibowo@millennia21.id>',
            to: 'ari.wibowo@millennia21.id',
            subject: 'Test Email',
            text: 'If you see this, email works!'
        });
        console.log('✅ Email sent:', info.messageId);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testEmail();