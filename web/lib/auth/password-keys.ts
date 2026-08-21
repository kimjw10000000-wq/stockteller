/** 두벌식 자모 → QWERTY */
const JAMO_TO_QWERTY: Record<string, string> = {
  ㄱ: "r",
  ㄲ: "R",
  ㄳ: "rt",
  ㄴ: "s",
  ㄵ: "sw",
  ㄶ: "sg",
  ㄷ: "e",
  ㄸ: "E",
  ㄹ: "f",
  ㄺ: "fr",
  ㄻ: "fa",
  ㄼ: "fq",
  ㄽ: "ft",
  ㄾ: "fx",
  ㄿ: "fv",
  ㅀ: "fg",
  ㅁ: "a",
  ㅂ: "q",
  ㅃ: "Q",
  ㅄ: "qt",
  ㅅ: "t",
  ㅆ: "T",
  ㅇ: "d",
  ㅈ: "w",
  ㅉ: "W",
  ㅊ: "c",
  ㅋ: "z",
  ㅌ: "x",
  ㅍ: "v",
  ㅎ: "g",
  ㅏ: "k",
  ㅐ: "o",
  ㅑ: "i",
  ㅒ: "O",
  ㅓ: "j",
  ㅔ: "p",
  ㅕ: "u",
  ㅖ: "P",
  ㅗ: "h",
  ㅘ: "hk",
  ㅙ: "ho",
  ㅚ: "hl",
  ㅛ: "y",
  ㅜ: "n",
  ㅝ: "nj",
  ㅞ: "np",
  ㅟ: "nl",
  ㅠ: "b",
  ㅡ: "m",
  ㅢ: "ml",
  ㅣ: "l",
};

const CHO = ["r", "R", "s", "e", "E", "f", "a", "q", "Q", "t", "T", "d", "w", "W", "c", "z", "x", "v", "g"];
const JUNG = [
  "k",
  "o",
  "i",
  "O",
  "j",
  "p",
  "u",
  "P",
  "h",
  "hk",
  "ho",
  "hl",
  "y",
  "n",
  "nj",
  "np",
  "nl",
  "b",
  "m",
  "ml",
  "l",
];
const JONG = [
  "",
  "r",
  "R",
  "rt",
  "s",
  "sw",
  "sg",
  "e",
  "f",
  "fr",
  "fa",
  "fq",
  "ft",
  "fx",
  "fv",
  "fg",
  "a",
  "q",
  "qt",
  "t",
  "T",
  "d",
  "w",
  "c",
  "z",
  "x",
  "v",
  "g",
];

/** 한글 음절·자모를 두벌식 기준 영문 키로 변환 */
export function hangulKeysToQwerty(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      const cho = Math.floor(s / 588);
      const jung = Math.floor((s % 588) / 28);
      const jong = s % 28;
      out += CHO[cho] + JUNG[jung] + JONG[jong];
    } else if (JAMO_TO_QWERTY[ch]) {
      out += JAMO_TO_QWERTY[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

const CODE_TO_ASCII: Record<string, [string, string]> = {
  KeyA: ["a", "A"],
  KeyB: ["b", "B"],
  KeyC: ["c", "C"],
  KeyD: ["d", "D"],
  KeyE: ["e", "E"],
  KeyF: ["f", "F"],
  KeyG: ["g", "G"],
  KeyH: ["h", "H"],
  KeyI: ["i", "I"],
  KeyJ: ["j", "J"],
  KeyK: ["k", "K"],
  KeyL: ["l", "L"],
  KeyM: ["m", "M"],
  KeyN: ["n", "N"],
  KeyO: ["o", "O"],
  KeyP: ["p", "P"],
  KeyQ: ["q", "Q"],
  KeyR: ["r", "R"],
  KeyS: ["s", "S"],
  KeyT: ["t", "T"],
  KeyU: ["u", "U"],
  KeyV: ["v", "V"],
  KeyW: ["w", "W"],
  KeyX: ["x", "X"],
  KeyY: ["y", "Y"],
  KeyZ: ["z", "Z"],
  Digit0: ["0", ")"],
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Backslash: ["\\", "|"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Backquote: ["`", "~"],
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
  Space: [" ", " "],
};

/** 한글 IME가 켜져 있어도 물리 키의 영문 QWERTY 문자를 반환 */
export function qwertyCharFromKeyboardEvent(e: KeyboardEvent): string | null {
  const pair = CODE_TO_ASCII[e.code];
  if (!pair) return null;
  const isLetter = e.code.startsWith("Key");
  const shifted = isLetter ? e.shiftKey !== e.getModifierState("CapsLock") : e.shiftKey;
  return shifted ? pair[1] : pair[0];
}
