/** Replace `{{name}}` placeholders after t(key). */
export function translateTemplate(t, key, vars = {}) {
  let text = t(key)
  for (const [name, value] of Object.entries(vars)) {
    text = text.split(`{{${name}}}`).join(String(value))
  }
  return text
}
