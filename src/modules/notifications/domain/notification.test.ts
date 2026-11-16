import { render } from './notification';
describe('Notification template safety', () => {
  it('rejects missing values and inherited prototype properties', () => {
    expect(() => render('{{toString}}', {})).toThrow();
    expect(() => render('{{name}}', {})).toThrow();
  });
  it('does not execute template expressions or recursively render user values', () => {
    expect(render('{{name}}', { name: '{{process.env.SECRET}}' })).toBe('{{process.env.SECRET}}');
    expect(render('{{constructor.constructor("return 1")()}}', {})).toBe(
      '{{constructor.constructor("return 1")()}}',
    );
  });
  it('supports explicit empty values and deterministic repeated interpolation', () => {
    expect(render('{{name}}/{{name}}/{{empty}}', { name: 'Ana', empty: '' })).toBe('Ana/Ana/');
  });
});
