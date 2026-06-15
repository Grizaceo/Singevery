declare module 'kuroshiro' {
  class Kuroshiro {
    init(analyzer: unknown): Promise<void>;
    convert(
      text: string,
      options: { to: string; mode: string; romajiSystem?: string },
    ): Promise<string>;
  }
  export default Kuroshiro;
}

declare module 'kuroshiro-analyzer-kuromoji' {
  class KuromojiAnalyzer {
    constructor();
  }
  export default KuromojiAnalyzer;
}
