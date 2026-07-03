declare module 'cyrillic-to-translit-js' {
  interface CyrillicToTranslitOptions {
    preset?: 'ru' | 'uk';
  }

  interface CyrillicToTranslitInstance {
    transform(input: string, spaceReplacement?: string): string;
  }

  function cyrillicToTranslit(options?: CyrillicToTranslitOptions): CyrillicToTranslitInstance;
  export default cyrillicToTranslit;
}
