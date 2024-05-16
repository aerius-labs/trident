export const bigIntMax = (...args: BigInt[]) => args.reduce((m, e) => e > m ? e : m);
export const bigIntMin = (...args: BigInt[]) => args.reduce((m, e) => e < m ? e : m);