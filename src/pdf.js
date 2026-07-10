const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const NAVEGADORES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const PASTA_RELATORIOS = path.join(__dirname, '..', 'relatorios');

async function gerarPdf(urlBase) {
  const executavel = NAVEGADORES.find(p => fs.existsSync(p));
  if (!executavel) {
    throw new Error('Nenhum navegador encontrado (Chrome ou Edge) para gerar o PDF.');
  }
  if (!fs.existsSync(PASTA_RELATORIOS)) fs.mkdirSync(PASTA_RELATORIOS);

  const hoje = new Date();
  const carimbo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  let arquivo = `Relatorio-Diretoria-${carimbo}.pdf`;
  let n = 2;
  while (fs.existsSync(path.join(PASTA_RELATORIOS, arquivo))) {
    arquivo = `Relatorio-Diretoria-${carimbo}-${n++}.pdf`;
  }

  const browser = await puppeteer.launch({
    executablePath: executavel,
    headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'gp-pdf-')),
    args: ['--no-first-run', '--no-default-browser-check', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${urlBase}/relatorio/print`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#pronto', { timeout: 15000 });
    await page.pdf({
      path: path.join(PASTA_RELATORIOS, arquivo),
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' },
    });
  } finally {
    await browser.close();
  }
  return arquivo;
}

module.exports = { gerarPdf };
