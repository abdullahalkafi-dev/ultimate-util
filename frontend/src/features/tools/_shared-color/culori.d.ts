// culori ships no types; only the two functions we use are declared.
declare module 'culori' {
  export interface CuloriColor {
    mode: string;
    alpha?: number;
    [channel: string]: number | string | undefined;
  }
  export function parse(input: string): CuloriColor | undefined;
  export function rgb(color: CuloriColor): { r: number; g: number; b: number; alpha?: number } | undefined;
}
