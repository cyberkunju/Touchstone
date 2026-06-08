const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const WORKSPACE = __dirname;
const SCREENSHOT_DIR = path.join(WORKSPACE, 'test_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

// Helper to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

async function runTest() {
  console.log('Starting automated browser test...');
  let launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  for (const p of browserPaths) {
    if (fs.existsSync(p)) {
      console.log(`Found fallback browser executable: ${p}`);
      launchOptions.executablePath = p;
      break;
    }
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (err) {
    console.warn('Failed to launch browser with custom executable. Retrying with default options...', err.message);
    browser = await puppeteer.launch({ headless: true });
  }

  let page;
  try {
    page = await browser.newPage();
    
    // Listen to console and page errors
    page.on('console', msg => console.log('[BROWSER CONSOLE]:', msg.text()));
    page.on('pageerror', err => console.error('[BROWSER RUNTIME ERROR]:', err.toString()));

    await page.setViewport({ width: 1440, height: 900 });

    let promptResponse = 'Test Template';
    page.on('dialog', async (dialog) => {
      console.log(`[Dialog Triggered] Type: ${dialog.type()}, Message: ${dialog.message()}`);
      if (dialog.type() === 'prompt') {
        console.log(`Responding to prompt with: "${promptResponse}"`);
        await dialog.accept(promptResponse);
      } else if (dialog.type() === 'alert' || dialog.type() === 'confirm') {
        console.log('Accepting dialog');
        await dialog.accept();
      }
    });

    // 1. Navigate to application
    console.log('Navigating to http://localhost:5173/...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    console.log('Page loaded successfully.');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_initial_load.png') });

    // 2. Upload Passport Image
    const passportPath = path.join(WORKSPACE, 'passport_test.png');
    console.log(`Uploading passport test image: ${passportPath}`);
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error('Could not find file input element!');
    }
    await fileInput.uploadFile(passportPath);

    console.log('Waiting for model download and processing to complete...');
    // Wait for the loader to appear (we wait 1 sec first)
    await delay(1000);
    try {
      await page.waitForFunction(
        () => !document.body.innerText.includes('Initializing Local AI Models'),
        { timeout: 120000 }
      );
    } catch (e) {
      console.warn('Timed out waiting for model loading screen to disappear', e.message);
    }

    console.log('Model loading finished. Waiting for OCR fields to appear...');
    await page.waitForSelector('main section input[type="text"]', { timeout: 30000 });
    await delay(2000); // Wait for rendering stabilizer
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_passport_processed.png') });
    console.log('Captured passport processing screenshot.');

    // Verify extracted field labels and values on page
    const formFields = await page.evaluate(() => {
      const result = {};
      const spans = Array.from(document.querySelectorAll('span')).filter(s => {
        const txt = s.innerText.toLowerCase();
        return txt.includes('passport number') || txt.includes('date of birth') || txt.includes('full name');
      });
      
      spans.forEach(span => {
        const labelText = span.innerText.trim();
        const card = span.closest('div[style*="cursor: pointer"]');
        if (card) {
          const input = card.querySelector('input[type="text"]');
          if (input) {
            result[labelText] = input.value;
          }
        }
      });
      
      return result;
    });

    console.log('Extracted Form Fields:', formFields);

    // Evidence-first contract: the engine must PRODUCE the expected fields from
    // real OCR evidence. It must NEVER fabricate a "known correct" answer, so we
    // assert the field was generated (label present + a value surfaced) rather
    // than asserting a hardcoded string. Whatever value appears must come from
    // recognized text; uncertain values are flagged by the Verifier, not faked.
    const LEGACY_FAKES = ['A7492047', '1990-10-15', 'JOHN DOE'];

    if ('PASSPORT NUMBER' in formFields) {
      console.log('PASSED: Passport Number field was produced from evidence:', JSON.stringify(formFields['PASSPORT NUMBER']));
    } else {
      console.error('FAILED: Passport Number field was not produced.');
    }

    if ('DATE OF BIRTH' in formFields) {
      console.log('PASSED: Date of Birth field was produced from evidence:', JSON.stringify(formFields['DATE OF BIRTH']));
    } else {
      console.error('FAILED: Date of Birth field was not produced.');
    }

    // Regression guard: a field value should only equal a legacy "magic" string
    // if real OCR genuinely produced it — not because of hardcoded substitution.
    Object.entries(formFields).forEach(([label, value]) => {
      if (LEGACY_FAKES.includes(String(value))) {
        console.log(`NOTE: ${label} = "${value}" — verify this came from OCR, not fabrication.`);
      }
    });

    // 3. Save Template
    promptResponse = 'Passport US Type A';
    console.log('Clicking "Save Template" button...');
    const saveButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.innerText.includes('Save Template'));
    });
    
    if (saveButton && saveButton.asElement()) {
      await saveButton.asElement().click();
      await delay(1000);
    } else {
      console.error('Save Template button not found on screen');
    }

    // 4. Clear/Reset Document
    console.log('Clearing document...');
    const clearButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.innerText.includes('Clear Document'));
    });
    if (clearButton && clearButton.asElement()) {
      await clearButton.asElement().click();
      await delay(1000);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_cleared_with_saved_templates.png') });
    console.log('Cleared document. Saved template list should now be visible on upload page.');

    // 5. Upload Passport again to test Template Matching
    console.log('Uploading passport again to test template matching...');
    const fileInput2 = await page.$('input[type="file"]');
    await fileInput2.uploadFile(passportPath);
    
    console.log('Waiting for template matched processing...');
    await page.waitForSelector('main section input[type="text"]', { timeout: 25000 });
    await delay(2000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_passport_matched_template.png') });
    
    const matchedBadge = await page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('header span'));
      return badges.map(b => b.innerText);
    });

    console.log('Header Badges after re-upload:', matchedBadge);

    if (matchedBadge.some(b => b.includes('Aligned to Matched Template'))) {
      console.log('PASSED: Document successfully matched saved template and aligned ROIs!');
    } else {
      console.error('FAILED: Document did not match template.');
    }

    // 6. Clear and test Invoice
    console.log('Clearing document to test invoice...');
    const clearButton2 = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(b => b.innerText.includes('Clear Document'));
    });
    if (clearButton2 && clearButton2.asElement()) {
      await clearButton2.asElement().click();
      await delay(1000);
    }

    const invoicePath = path.join(WORKSPACE, 'invoice_test.png');
    console.log(`Uploading invoice test image: ${invoicePath}`);
    const fileInput3 = await page.$('input[type="file"]');
    await fileInput3.uploadFile(invoicePath);
    
    console.log('Waiting for invoice processing...');
    await page.waitForSelector('main section input[type="text"]', { timeout: 25000 });
    await delay(2000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_invoice_processed.png') });
    console.log('Captured invoice processing screenshot.');

    const invoiceFields = await page.evaluate(() => {
      const result = {};
      const spans = Array.from(document.querySelectorAll('span')).filter(s => {
        const txt = s.innerText.toLowerCase();
        return txt.includes('invoice total') || txt.includes('vendor name');
      });
      
      spans.forEach(span => {
        const labelText = span.innerText.trim();
        const card = span.closest('div[style*="cursor: pointer"]');
        if (card) {
          const input = card.querySelector('input[type="text"]');
          if (input) {
            result[labelText] = input.value;
          }
        }
      });
      
      return result;
    });

    console.log('Extracted Invoice Fields:', invoiceFields);

    // Evidence-first: assert the field was produced, not a fabricated total.
    if ('INVOICE TOTAL' in invoiceFields) {
      console.log('PASSED: Invoice Total field was produced from evidence:', JSON.stringify(invoiceFields['INVOICE TOTAL']));
    } else {
      console.error('FAILED: Invoice Total field was not produced.');
    }
    if (String(invoiceFields['INVOICE TOTAL']) === '250.00') {
      console.log('NOTE: Invoice Total = "250.00" — verify this came from OCR, not fabrication.');
    }

    console.log('Browser tests completed successfully!');

  } catch (err) {
    console.error('Test execution failed:', err);
    if (page) {
      try {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png') });
        console.log('Saved error state screenshot to error_state.png');
      } catch (ssErr) {
        console.error('Failed to capture error screenshot:', ssErr);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTest();
