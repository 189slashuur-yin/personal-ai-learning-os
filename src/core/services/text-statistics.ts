export function countWords(text: string) {
  return (
    text.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu,
    )?.length ?? 0
  );
}
