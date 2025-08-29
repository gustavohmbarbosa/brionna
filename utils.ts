export function removeComments(code: string) {
  return code.replace(/\/\/.*$/gm, "");
}
