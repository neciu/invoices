import yaml from 'js-yaml';
import fs from 'fs';
import pug from 'pug';
import pdf from 'html-pdf';
import {pl as inWords} from 'in-words';
import moment from 'moment';
import Intl from 'intl';

const numberFormat = new Intl.NumberFormat('pl-PL', {style:'currency', currency:'PLN'});
const percentFormat = new Intl.NumberFormat('pl-PL', { style: 'percent', minimumFractionDigits: 2});

const params = parseParams();

function parseParams() {
  const inputFilePath = parseInputFilePath();
  const outputFilePath = parseOutputFilePath(inputFilePath);

  return {
    inputFilePath,
    outputFilePath,
  };
}

function parseInputFilePath() {
  const inputFilePath = process.argv[2];
  if (!inputFilePath) {
    throw new Error('Input file path required');
  }
  if (!fs.existsSync(inputFilePath)) {
    throw new Error('No file under provided input file path');
  }
  return inputFilePath;
}

function parseOutputFilePath(inputFilePath) {
  const outputFilePath = process.argv[3];
  if (!outputFilePath) {
    const splitPath = inputFilePath.split('.');
    splitPath.pop();
    splitPath.push('pdf');
    return splitPath.join('.');
  }
  return outputFilePath;
}

const invoiceData = getInvoiceData(params.inputFilePath);
const html = renderTemplate();


function getInvoiceData(filePath) {
  console.info(`Loading file: ${filePath}`);
  const rawInvoiceData = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
  const {description, netPrice, vatRate, invoiceDate, timeSpan, items} = rawInvoiceData;
  
  const parsedItems = getItems(description, netPrice, vatRate, items);

  const grossPriceZlotyPartInWords = inWords(parseInt(sumItems(parsedItems, 'grossPrice')));
  const grossPriceGroszPartInWords = inWords(parseInt(sumItems(parsedItems, 'grossPrice') * 100 % 100));
  
  const totalNetPrice = sumItems(parsedItems, 'netPrice');
  const totalVatPrice = sumItems(parsedItems, 'vatPrice');
  const totalGrossPrice = sumItems(parsedItems, 'grossPrice');


  return {
    ...rawInvoiceData,
    invoiceDate: moment(invoiceDate).format('YYYY-MM-DD'),
    totalNetPrice,
    totalVatPrice,
    totalGrossPrice,
    grossPriceZlotyPartInWords,
    grossPriceGroszPartInWords,
    dueDate: dueDate(invoiceDate, timeSpan),
    items: parsedItems,
    formatNumber: numberFormat.format,
    formatPercent: percentFormat.format,
  }
}

function sumItems(items, key) {
  return items.reduce((acc, curr) => fixed(Number(acc) + Number(curr[key])), "0")
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

function getItems(description, netPrice, vatRate, items) {
  if (items) {
    return items.map(item => ({
      description: item.description,
      netPrice: fixed(Number(item.netPrice)),
      grossPrice: fixed(Number(item.netPrice) * (1 + Number(item.vatRate))),
      vatPrice: fixed(Number(item.netPrice) * Number(item.vatRate)),
      vatRate: item.vatRate,
    }));
  } else {
    return [{
      description: description,
      netPrice: fixed(Number(netPrice)),
      grossPrice: fixed(Number(netPrice) * (1 + Number(vatRate))),
      vatPrice: fixed(Number(netPrice) * Number(vatRate)),
      vatRate: vatRate,
    }]
  }
}

const options = {
  format: 'A4',
  border: '1cm',
};

console.info(`Saving file: ${params.outputFilePath}`);
pdf.create(html, options).toFile(params.outputFilePath, function (error) {
  if (error) {
    throw error;
  }
});
