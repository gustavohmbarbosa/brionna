interface TestCase {
    name: string;
    code: string;
}

export const testCases: TestCase[] = [
    {
        name: "A litte complex",
        code: `
            fn main() {
                let x: int;
                let y, z: bool;
                proc soma(a: int, b: int) {
                    write(x);
                }
                if (x == 10) { // teste comment
                    read(y);
                } else {
                    write(z);
                }
                // teste contar linha comentário
                // teste contar linha comentário
                // z = @;  // erro proposital
            }
        `
    },
    {
        name: 'Basic valid program',
        code: `
            fn main() {
                let x: int;
                x = 5;
            }
        `,
    },
    {
        name: 'Invalid token error',
        code: `fn main() { z = @; }`,
    },
    {
        name: 'Bool and if-else',
        code: `
            fn main() {
                let b: bool;
                b = true;
                if (b) { 
                    write(b); 
                } else { 
                    write(b); 
                }
            }
        `,
    },
    {
        name: 'Procedure call',
        code: `
            fn main() {
                proc hello() { write(true); }
                hello();
            }
        `,
    },
];
