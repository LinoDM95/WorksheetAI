declare module 'roughjs/bundled/rough.esm.js' {
  interface RoughSvg {
    line(x1: number, y1: number, x2: number, y2: number, options?: Record<string, unknown>): SVGElement;
    rectangle(x: number, y: number, w: number, h: number, options?: Record<string, unknown>): SVGElement;
    circle(x: number, y: number, d: number, options?: Record<string, unknown>): SVGElement;
    linearPath(points: number[][], options?: Record<string, unknown>): SVGElement;
  }
  interface RoughStatic {
    svg(el: SVGSVGElement): RoughSvg;
  }
  const rough: RoughStatic;
  export default rough;
}
