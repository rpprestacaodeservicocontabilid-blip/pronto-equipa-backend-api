import { parseImportCsv } from './import-csv';
describe('Onboarding CSV validation', () => {
  it('preserves quoted commas and escaped quotes', () => {
    expect(parseImportCsv('name,note\r\n"Ana, Maria","Disse ""sim"""')).toEqual([
      { name: 'Ana, Maria', note: 'Disse "sim"' },
    ]);
  });
  it('rejects duplicate and unsafe column names and mismatched rows', () => {
    expect(() => parseImportCsv('name,name\na,b')).toThrow();
    expect(() => parseImportCsv('__proto__,name\na,b')).toThrow();
    expect(() => parseImportCsv('a,b\nx')).toThrow();
  });
  it('rejects unclosed quoted data', () => {
    expect(() => parseImportCsv('name\n"Ana')).toThrow();
  });
});
