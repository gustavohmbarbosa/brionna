import { Sym } from "./types";

export class Scope {
  private map = new Map<string, Sym>();
  add(sym: Sym) {
    if (this.map.has(sym.name)) throw new Error(`Erro semântico: '${sym.name}' já declarado neste escopo`);
    this.map.set(sym.name, sym);
  }
  get(n: string) { return this.map.get(n); }
}