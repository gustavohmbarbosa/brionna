import { appendFileSync, mkdirSync, readFile, writeFileSync } from "fs";
import { testCases } from "./tests/tests.ts";
import { tokenize } from "./analisadores/lexic.ts";
import { SyntacticParser } from "./analisadores/syntactic.ts";

mkdirSync("resultado", { recursive: true });
writeFileSync("resultado/log.txt", "", { encoding: "utf-8" });
// helper para salvar em arquivo
function logToFile(type: "log" | "error", message: any, ...optional: any[]) {
  const text = `[${type.toUpperCase()}] ${message} ${optional.map(x => String(x)).join(" ")}\n`;
  appendFileSync("resultado/log.txt", text, { encoding: "utf-8" });
}

// sobrescreve console.log e console.error
const oldLog = console.log;
console.log = (msg?: any, ...opt: any[]) => {
  oldLog(msg, ...opt);
  logToFile("log", msg, ...opt);
};

const oldErr = console.error;
console.error = (msg?: any, ...opt: any[]) => {
  oldErr(msg, ...opt);
  logToFile("error", msg, ...opt);
};

function main(code: string): void {
  const tokens = tokenize(code);
  if (tokens.length === 0) return;

  const parser = new SyntacticParser(tokens);
  if (parser.parse()) {
    console.log("\nAnálise sintática + semântica concluída com sucesso!");
  } else {
    console.error("\nErros foram encontrados na análise.");
  }
}

const [, , filePath] = process.argv;
if (!filePath) {
  console.log("RUNNING TESTS");
  for (const test of testCases) {
    console.log(`\n=== ${test.name} ===`);
    try { main(test.code); } catch (e) { console.error(String(e)); }
  }
} else {
  readFile(filePath, { encoding: "utf-8" }, (err, data) => {
    if (err) {
      console.error(`Erro ao ler ou processar o arquivo: ${err.message}`);
      process.exit(1);
    }
    console.log(`Lendo arquivo: ${filePath}\n`);
    try { main(data); } catch (e) { console.error(String(e)); process.exit(1); }
  });
}
