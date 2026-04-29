// scripts/migrate-observations.ts
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';

// Inisialisasi Prisma Client langsung (tanpa alias @)
const prisma = new PrismaClient();

interface Submission {
  id: string;
  staffName: string;
  rubricName: string;
  status: string;
  submittedAt: string;
  detailUrl: string;
}

interface ObservationDetail {
  staffEmail: string;
  managerEmail: string;
  submittedAt: string;
  acknowledgedAt: string;
  sections: Section[];
}

interface Section {
  name: string;
  weight: string;
  indicators: Indicator[];
}

interface Indicator {
  name: string;
  score: number;
  note: string;
}

async function loginToNLSmartTrack(page: any) {
  console.log('🔐 Login ke nlsmarttrack.com...');
  await page.goto('https://nlsmarttrack.com/');
  
  // Tunggu 2 detik untuk loading
  await page.waitForTimeout(2000);
  
  // Cari tombol login Google
  const googleButton = await page.$('button[data-oauth="google"], .google-login, a[href*="google"]');
  if (googleButton) {
    await googleButton.click();
    console.log('✅ Klik tombol Google login');
  } else {
    console.log('⚠️ Tombol Google tidak ditemukan, coba selector lain...');
    // Alternative: cari link login
    await page.click('a:contains("Login"), button:contains("Login")');
  }
  
  // Tunggu navigasi - manual intervention mungkin diperlukan
  console.log('⏳ Tunggu login manual jika perlu (60 detik)...');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {
    console.log('⚠️ Timeout navigasi, lanjutkan...');
  });
  
  console.log('✅ Login berhasil (asumsi)');
}

async function scrapeSubmissionsList(page: any): Promise<Submission[]> {
  console.log('📥 Mengambil daftar submission...');
  await page.goto('https://nlsmarttrack.com/repositories/observationTool/submissions_list.php', {
    waitUntil: 'networkidle0',
    timeout: 30000
  });
  
  // Tunggu table muncul
  await page.waitForSelector('table', { timeout: 10000 }).catch(() => {
    console.log('⚠️ Table tidak ditemukan, mungkin perlu login ulang');
    return null;
  });
  
  const submissions = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    return Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td');
      return {
        id: cells[0]?.innerText?.trim() || '',
        staffName: cells[1]?.innerText?.trim() || '',
        rubricName: cells[2]?.innerText?.trim() || '',
        status: cells[3]?.innerText?.trim() || '',
        submittedAt: cells[4]?.innerText?.trim() || '',
        detailUrl: row.querySelector('a')?.getAttribute('href') || '',
      };
    }).filter(sub => sub.id); // Filter yang punya ID
  });
  
  console.log(`✅ Ditemukan ${submissions.length} submission`);
  return submissions;
}

async function scrapeObservationDetail(page: any, url: string): Promise<ObservationDetail | null> {
  console.log(`🔍 Scrape detail: ${url}`);
  const fullUrl = url.startsWith('http') ? url : `https://nlsmarttrack.com/${url}`;
  
  await page.goto(fullUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  
  // Tunggu form muncul
  await page.waitForTimeout(3000);
  
  const detail = await page.evaluate(() => {
    // Extract email dari berbagai kemungkinan selector
    const staffEmail = 
      document.querySelector('.staff-email, [data-staff-email]')?.innerText ||
      document.querySelector('td:contains("Staff") + td')?.innerText ||
      '';
    
    const managerEmail = 
      document.querySelector('.manager-email, [data-manager-email]')?.innerText ||
      document.querySelector('td:contains("Manager") + td')?.innerText ||
      '';
    
    // Extract sections dan indicators
    const sections: any[] = [];
    const sectionElements = document.querySelectorAll('.section, .observation-section, .rubric-section');
    
    sectionElements.forEach(section => {
      const indicators: any[] = [];
      const indicatorElements = section.querySelectorAll('.indicator, .question, .criteria');
      
      indicatorElements.forEach(ind => {
        indicators.push({
          name: ind.querySelector('.indicator-name, .question-text')?.innerText || '',
          score: parseInt(ind.querySelector('.score, .rating')?.getAttribute('value') || '0'),
          note: ind.querySelector('.note, .comment, .feedback')?.innerText || '',
        });
      });
      
      sections.push({
        name: section.querySelector('.section-title, h3, .title')?.innerText || 'General',
        weight: section.querySelector('.weight, .bobot')?.innerText?.replace(/\D/g, '') || '100',
        indicators,
      });
    });
    
    return {
      staffEmail,
      managerEmail,
      submittedAt: document.querySelector('.submitted-date, .date-submitted')?.innerText || '',
      acknowledgedAt: document.querySelector('.acknowledged-date, .date-acknowledged')?.innerText || '',
      sections,
    };
  });
  
  if (!detail.staffEmail && !detail.managerEmail) {
    console.log('⚠️ Tidak dapat extract email, mungkin struktur halaman berbeda');
    return null;
  }
  
  return detail;
}

async function migrateToNewDatabase(submissions: Submission[], details: (ObservationDetail | null)[]) {
  console.log('💾 Migrasi ke database baru...');
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const detail = details[i];
    
    if (!detail) {
      console.log(`❌ Skip ${sub.id}: No detail data`);
      failCount++;
      continue;
    }
    
    try {
      // Cari atau buat user staff
      let staff = await prisma.user.findFirst({
        where: { email: detail.staffEmail }
      });
      
      if (!staff && detail.staffEmail) {
        staff = await prisma.user.create({
          data: {
            email: detail.staffEmail,
            roles: ['staff'],
            full_name: sub.staffName,
          },
        });
        console.log(`✅ Created staff: ${detail.staffEmail}`);
      }
      
      // Cari atau buat manager
      let manager = await prisma.user.findFirst({
        where: { email: detail.managerEmail }
      });
      
      if (!manager && detail.managerEmail) {
        manager = await prisma.user.create({
          data: {
            email: detail.managerEmail,
            roles: ['manager'],
            full_name: detail.managerEmail.split('@')[0],
          },
        });
        console.log(`✅ Created manager: ${detail.managerEmail}`);
      }
      
      if (!staff || !manager) {
        console.log(`❌ Skip ${sub.id}: Missing staff or manager`);
        failCount++;
        continue;
      }
      
      // Cari atau buat rubric
      let rubric = await prisma.rubric.findFirst({
        where: { name: sub.rubricName }
      });
      
      if (!rubric) {
        rubric = await prisma.rubric.create({
          data: {
            name: sub.rubricName,
            sections: {
              create: detail.sections.map((section: Section, idx: number) => ({
                name: section.name || `Section ${idx + 1}`,
                weight: section.weight || '100',
                indicators: {
                  create: section.indicators.map((ind: Indicator) => ({
                    name: ind.name || 'Indicator',
                    description: ind.note || '',
                  })),
                },
              })),
            },
          },
        });
        console.log(`✅ Created rubric: ${sub.rubricName}`);
      }
      
      // Cek apakah observation sudah ada
      const existingObs = await prisma.observation.findUnique({
        where: { id: sub.id }
      });
      
      if (existingObs) {
        console.log(`⚠️ Observation ${sub.id} already exists, skipping...`);
        successCount++;
        continue;
      }
      
      // Buat observation
      const observation = await prisma.observation.create({
        data: {
          id: sub.id,
          staffId: staff.id,
          managerId: manager.id,
          rubricId: rubric.id,
          status: sub.status.toLowerCase() === 'acknowledged' ? 'acknowledged' : 
                  sub.status.toLowerCase() === 'submitted' ? 'submitted' : 'draft',
          submittedAt: detail.submittedAt ? new Date(detail.submittedAt) : null,
          acknowledgedAt: detail.acknowledgedAt ? new Date(detail.acknowledgedAt) : null,
          answers: {
            create: detail.sections.flatMap((section: Section) =>
              section.indicators.map((ind: Indicator, idx: number) => ({
                indicatorId: rubric.sections[idx]?.indicators[idx]?.id || 'temp',
                score: ind.score || 0,
                note: ind.note || '',
              })).filter(a => a.indicatorId !== 'temp')
            ),
          },
        },
      });
      
      console.log(`✅ Migrated: ${sub.id} - ${sub.staffName}`);
      successCount++;
      
    } catch (error) {
      console.error(`❌ Error migrating ${sub.id}:`, error);
      failCount++;
    }
  }
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total: ${submissions.length}`);
}

async function main() {
  console.log('🚀 Memulai migrasi data observasi...');
  console.log('📁 Project path:', __dirname);
  
  // Cek koneksi database
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
  
  const browser = await puppeteer.launch({ 
    headless: false, // Set false agar bisa login manual
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  try {
    await loginToNLSmartTrack(page);
    
    // Screenshot untuk debugging
    await page.screenshot({ path: 'after-login.png' });
    console.log('📸 Screenshot saved: after-login.png');
    
    const submissions = await scrapeSubmissionsList(page);
    
    if (submissions.length === 0) {
      console.log('⚠️ Tidak ada submission ditemukan');
      return;
    }
    
    const details: (ObservationDetail | null)[] = [];
    for (let i = 0; i < Math.min(submissions.length, 10); i++) { // Batasi 10 dulu untuk testing
      console.log(`\nProcessing ${i+1}/${Math.min(submissions.length, 10)}...`);
      const detail = await scrapeObservationDetail(page, submissions[i].detailUrl);
      details.push(detail);
      
      // Delay untuk menghindari rate limit
      await page.waitForTimeout(2000);
    }
    
    await migrateToNewDatabase(submissions.slice(0, 10), details);
    console.log('🎉 Migrasi selesai!');
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// Helper: waitForTimeout
declare global {
  namespace NodeJS {
    interface Global {
      waitForTimeout: (ms: number) => Promise<void>;
    }
  }
}

// Run migration
main().catch(console.error);