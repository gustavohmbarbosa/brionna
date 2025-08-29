import { Scope } from "./scope";
import { Sym } from "./types";

export class SymTable {
  private stack: Scope[] = [new Scope()];
  push() { this.stack.push(new Scope()); }
  pop() { this.stack.pop(); }
  add(sym: Sym) { this.stack[this.stack.length - 1].add(sym); }
  lookup(name: string): Sym | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.stack[i].get(name);
      if (s) return s;
    }
    return undefined;
  }
}