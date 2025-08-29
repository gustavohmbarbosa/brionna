import { tokenSpecs } from "../gramma";
import { Token } from "../types";
import { removeComments } from "../utils";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = removeComments(source).split("\n");

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let pos = 0;

    while (pos < line.length) {
      let match: string | null = null;
      let tokenType = "";

      for (const [type, regex] of tokenSpecs) {
        regex.lastIndex = 0;
        const result = regex.exec(line.slice(pos));
        if (result && result.index === 0) {
          match = result[0];
          tokenType = type;
          break;
        }
      }

      if (!match) {
        const errorChar = line[pos];
        console.error(`Erro léxico na linha ${lineNum + 1}, coluna ${pos + 1}: caractere inválido "${errorChar}"`);
        console.error("> " + line);
        console.error("  " + " ".repeat(pos) + "^");
        return [];
      }

      if (tokenType !== "SKIP") {
        const position = `${lineNum + 1}:${pos + 1}`;
        console.log(`${position}  ${tokenType.padEnd(10)} ${match}`);
        const token: Token = { value: match, type: tokenType, position };
        tokens.push(token);
      }
      pos += match.length;
    }
  }
  return tokens;
}