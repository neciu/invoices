import yaml from 'js-yaml';
import fs from 'fs';
import pug from 'pug';
import pdf from 'html-pdf';
import {pl as inWords} from 'in-words';
import moment from 'moment';


const params = parseParams();

function parseParams() {
  const inputFilePath = process.argv[2];
  if (!inputFilePath) {
    throw new Error('Input file path required');
  }
  if (!fs.existsSync(inputFilePath)) {
    throw new Error('No file under provided input file path');
  }
  return {
    inputFilePath,
  };
}

const invoiceData = getInvoiceData(params.inputFilePath);
const html = renderTemplate();


function getInvoiceData(filePath) {
  const rawInvoiceData = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
  const {netPrice, vatRate, invoiceDate, timeSpan} = rawInvoiceData;


  const grossPrice = fixed(Number(netPrice) * (1 + Number(vatRate)));
  const vatPrice = fixed(Number(netPrice) * Number(vatRate));

  const grossPriceZlotyPartInWords = inWords(parseInt(grossPrice));
  const grossPriceGroszPartInWords = inWords(parseInt(grossPrice * 100 % 100));
  const grossPriceString = Number(grossPrice).toLocaleString('pl-PL', { minimumFractionDigits: 2});
  const netPriceString = Number(netPrice).toLocaleString('pl-PL', { minimumFractionDigits: 2});
  const vatPriceString = Number(vatPrice).toLocaleString('pl-PL', { minimumFractionDigits: 2});


  return {
    ...rawInvoiceData,
    invoiceDate: moment(invoiceDate).format('YYYY-MM-DD'),
    grossPriceString,
    netPriceString,
    vatPriceString,
    vatPercentage: Number(vatRate).toLocaleString('pl-PL', { style: 'percent', minimumFractionDigits: 2}),
    grossPriceZlotyPartInWords,
    grossPriceGroszPartInWords,
    dueDate: dueDate(invoiceDate, timeSpan),
  }
}

function fixed(number) {
  // http://www.vat.pl/interpretacje/zaokraglanie-kwot-na-fakturze-vat--groszowe-roznice-w-sumach-pozycji-faktury--20130722-9447/
  // Widniejące na fakturze VAT kwoty winny być zaokrąglone do pełnych groszy, przy czym końcówki poniżej 0,5 grosza pomija się, a końcówki 0,5 grosza i wyższe zaokrągla się do 1 grosza.
  return (number + 0.0005).toFixed(2);
}

function dueDate(date, timeSpan) {
  return moment(date).add(timeSpan, 'day').format('YYYY-MM-DD');
}

function renderTemplate() {
  return pug.renderFile('./src/template.pug', invoiceData);
}

const options = {
  format: 'A4',
  border: '1cm',
};

pdf.create(html, options).toFile('./invoice.pdf', function (error) {
  if (error) {
    throw error;
  }
});
