/**
 * A property key's name as a string, or null: `color` and `'color'` give "color", and a
 * numeric key ({ 413: '...' }) gives "413". The rules compare key names with string
 * methods; a numeric key's raw value is a number, which crashed ESLint for the whole run.
 */
module.exports = function keyName(key) {
  const name = key && (key.name || key.value);
  return name === undefined || name === null || name === '' ? null : String(name);
};
